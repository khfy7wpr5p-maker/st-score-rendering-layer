# Editor / Renderer Selection Bridge

Program: `SRL-EDITOR-BRIDGE-01`

This document defines the renderer-owned side of the selection bridge. It does not make the renderer a canonical score or edit authority.

## Authority boundary

The rendering layer owns presentation lifecycle, exact rendered hit evidence, renderer-local highlight state and render-generation evidence.

The rendering layer does **not** own:

- canonical note identity;
- `SemanticAddress`;
- editor revision semantics;
- pitch/duration correction truth;
- note mutation;
- teacher approval;
- playback/audio authorization;
- Guitar TAB or Violin transformation authority.

`ScoreNoteRef` remains a rendered-note locator only. A consumer must never interpret `noteIndex` as a canonical array index or use pitch, duration, nearest-note, radius, SVG proximity or DOM ids to invent canonical identity.

## Render result evidence

A successful `BrowserScoreHost.renderMusicXml(...)` returns the existing renderer result fields plus additive presentation evidence:

```ts
{
  rendererId: string;
  contractVersion: "0.2.0";
  renderEpoch: string;
  sourceId?: string;
}
```

`renderEpoch` is an opaque token scoped to one `BrowserScoreHost` instance. Consumers may compare it for exact equality only. They must not parse it, order it, persist it as canonical identity or infer editor revision semantics from it.

Every successful replacement render advances the epoch. Failed validation, failed render, renderer reset and dispose invalidate the previously active epoch. The epoch counter is not reset during ordinary replacement, so a later successful render cannot silently reuse the prior token within the same host instance.

`sourceId`, when included in bridge evidence, is only a bounded presentation/source correlation value already supplied by the host. It is not canonical note identity. BrowserScoreHost omits an unsafe or unbounded source id from bridge evidence rather than expanding the evidence payload.

## Detailed hit evidence

The additive browser-host method is:

```ts
hitTestNoteDetailed({ clientX, clientY }):
  | {
      kind: "HIT";
      renderEpoch: string;
      sourceId?: string;
      target: ScoreNoteRef;
    }
  | {
      kind: "MISS";
      renderEpoch: string;
      sourceId?: string;
      reason:
        | "NO_ELEMENT_AT_POINT"
        | "OUTSIDE_RENDER_CONTAINER"
        | "UNMAPPED_ELEMENT"
        | "AMBIGUOUS_OWNERSHIP"
        | "NO_NOTE_OWNER";
    }
```

The legacy `hitTestNote(point): ScoreNoteRef | null` remains unchanged.

Detailed results are normalized to bounded plain data. DOM elements, OSMD objects, WeakMaps and score source contents are not returned. Unknown result fields or unsupported miss reasons fail closed.

## Consumer stale-evidence rule

The host/editor bridge must retain the `renderEpoch` returned by the **current successful render**. A detailed hit is eligible for canonical resolution only when its epoch exactly equals that current render epoch and, when the host uses `sourceId`, the source correlation is also the expected current value.

Recommended flow:

```text
editor revision R produces current MusicXML + mapping
→ renderer render succeeds
→ consumer stores current renderEpoch
→ physical pointer/touch event supplies current clientX/clientY
→ hitTestNoteDetailed
→ require hit.renderEpoch == current renderEpoch
→ if MISS: abstain and expose diagnostic class
→ if HIT: resolve ScoreNoteRef through the current host/editor mapping
→ Editor Core validates current SemanticAddress / SelectionSnapshot
→ canonical selection succeeds
→ renderer highlight(current ScoreNoteRef)
```

If replacement rendering begins or fails, the consumer must treat any previously stored hit evidence as stale. If the canonical mapping no longer resolves exactly after a successful replacement, selection/highlight must be cleared rather than guessed.

## Runtime exposure

The interaction-capable Workstation and generic browser runtime exports include additive:

```js
__ST_SCORE_RENDER_HOST__.hitTestNoteDetailed({ clientX, clientY })
```

`renderMusicXml(payload)` also returns the BrowserScoreHost render result containing `renderEpoch` and bounded `sourceId` evidence.

Runtime hit payloads are validated as plain objects with exactly `clientX` and `clientY`, both finite numbers. The runtime delegates to BrowserScoreHost and therefore receives the same normalized epoch-bound result.

## Contract version decision

`SCORE_RENDERER_CONTRACT_VERSION` remains `0.2.0` for SRL-EB-02/03/04 because:

1. the base `ScoreRenderer` interface is unchanged;
2. `ScoreNoteRef` semantics and shape are unchanged;
3. the capability union is unchanged;
4. existing `BrowserScoreHost.hitTestNote()` semantics are unchanged;
5. existing exported runtime methods are unchanged;
6. `renderEpoch`, the more-specific BrowserScoreHost render result and `hitTestNoteDetailed()` are additive presentation extensions;
7. production consumers are required to pin/verify an exact renderer revision/runtime manifest.

Important compatibility rule: a consumer must **not** infer that every historical `0.2.0` runtime contains `hitTestNoteDetailed()`. Consumers that require this additive extension must feature-detect it and pin a renderer revision whose manifest is known to include it. A future change that makes detailed hit evidence mandatory for all `0.2.x` runtimes or changes existing method semantics requires a new compatibility review.

## No-cross-dependency rule

The rendering repository does not import ST Score Editor Core to implement this bridge. The host resolves renderer evidence into Editor Core canonical identity. This prevents a renderer/editor circular dependency and keeps edit authority outside presentation.

## Explicit abstention

The following conditions never select a fallback note:

- no browser element at the point;
- hit outside the render container;
- unmapped element inside the container;
- shared/ambiguous graphical ownership;
- known non-note ownership such as a rest;
- stale render epoch;
- canonical mapping miss in the consumer/editor layer.

The bridge therefore increases observability without increasing guess-based selection authority.
