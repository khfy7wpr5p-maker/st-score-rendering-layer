# Note Interaction / Hit-Test / Highlight Boundary

## Authority

This layer is presentation-only. The renderer owns rendered-note hit-testing, structured rendered-hit diagnostics and reversible highlight state; the consumer owns canonical musical identity, selected-note application state and edit authority.

The renderer does **not** own pitch, duration, octave, voice correctness, tie/tuplet correction, OMR truth, teacher approval, `SemanticAddress`, canonical mutation, panel/keypad state or playback authorization.

`ScoreNoteRef` is a rendered locator only. Invalid assumption:

```text
renderer ScoreNoteRef.noteIndex == consumer global/canonical NoteObject array index
```

## Event ownership

The renderer does not register `pointerdown`, `touchstart`, `click` or gesture listeners. A host/application obtains the physical event and passes fresh browser client coordinates:

```ts
host.hitTestNote({ clientX: event.clientX, clientY: event.clientY })
host.hitTestNoteDetailed({ clientX: event.clientX, clientY: event.clientY })
```

Gesture policy, touch-action policy, selection/deselection and application callbacks remain consumer responsibilities.

## ScoreNoteRef identity policy

```ts
{
  partId: string;
  measureIndex: number;
  noteIndex: number;
  voice?: number;
}
```

Traversal policy:

```text
selected part / Instrument.IdString
→ instrument staves sorted by idInMusicSheet
→ staff entry order
→ graphical voice entry order
→ graphical note order
```

When a valid non-negative OSMD/MusicXML voice id is available, hit-test returns `voice` and `noteIndex` is counted within that voice for the selected part+measure. If a usable voice id is unavailable, the renderer does not invent one; `voice` is omitted and `noteIndex` is the unfiltered traversal index for that part+measure.

Pitch, duration and visual proximity are never used to establish identity.

## Visual geometry vs interaction geometry

**Visual geometry** is the SVG geometry produced by OSMD.

**Interaction geometry** is deterministic DOM ownership registered by the ST adapter:

- the exact notehead element is the strongest target;
- a graphical-note group obtained from the same exact OSMD `GraphicalNote` may be an interaction owner when exactly one `ScoreNoteRef` owns it;
- shared groups are ambiguous and fail closed.

There is no synthetic bounding-box expansion, hit radius, nearest-note search or score-space distance calculation.

## Browser adapter hit-test

`OsmdRenderer.resolveNoteAtClientPoint()` is a legacy OSMD-adapter extension returning `ScoreNoteRef | null`.

`OsmdRenderer.resolveNoteAtClientPointDetailed()` is an additive adapter extension returning bounded:

```ts
{ kind: "HIT", target: ScoreNoteRef }
```

or:

```ts
{
  kind: "MISS",
  reason:
    | "NO_ELEMENT_AT_POINT"
    | "OUTSIDE_RENDER_CONTAINER"
    | "UNMAPPED_ELEMENT"
    | "AMBIGUOUS_OWNERSHIP"
    | "NO_NOTE_OWNER"
}
```

Neither method is required by the base `ScoreRenderer` interface in contract `0.2.0`.

After each successful render, the adapter builds a bounded DOM-to-`ScoreNoteRef` ownership index. The index uses the same graphical traversal, stores only DOM ownership and rendered locator values, uses a `WeakMap`, is rebuilt after render/part-visibility graphic changes, is reset on load/rerender failure/dispose, is bounded to 200,000 graphical notes, and never searches for a nearest note.

If two different `ScoreNoteRef` values claim the same DOM element, that element is marked ambiguous.

## Client-coordinate policy

The adapter accepts CSS-pixel viewport coordinates and calls:

```ts
document.elementFromPoint(clientX, clientY)
```

It walks DOM ancestry only until the renderer container. It performs no custom scroll-offset, device-pixel-ratio, browser/pinch zoom, SVG transform or score-space conversion.

## Exact notehead and graphical-group ownership

The pinned OSMD `2.1.2` adapter uses `getNoteheadSVGs()`, `vfnoteIndex` and `getSVGGElement()`.

The notehead remains the strongest exact identity target. Chord members may share a graphical group while having distinct noteheads, so an exact notehead descendant can resolve successfully even when a broader ancestor is ambiguous.

A uniquely owned graphical note group may widen touch ownership to stem/flag/dot/other descendants of that same group. If multiple notes claim the group, a group-only hit abstains.

For a single pitched graphical note, if `vfnoteIndex` is unavailable but `getNoteheadSVGs()` exposes exactly one element, index `0` is accepted as an unambiguous same-notehead fallback. Multi-note cases require a valid exact notehead index or fail closed. Graphical rests are excluded from note interaction.

## BrowserScoreHost API and render freshness

```ts
const render = await host.renderMusicXml(content, options, sourceId)
// render.renderEpoch: opaque current-render token

host.hitTestNote({ clientX, clientY })
// ScoreNoteRef | null

host.hitTestNoteDetailed({ clientX, clientY })
// { kind, renderEpoch, sourceId?, target? / reason? }

await host.highlight({ target: scoreNoteRef, className? })
await host.clearHighlights()
```

Detailed evidence is tied to the active successful render epoch. Every successful replacement advances the epoch. Validation/load/render failure, reset and dispose invalidate prior active evidence.

Consumers may compare `renderEpoch` for equality only. It is not editor revision identity and must not be parsed or persisted as canonical note identity.

Detailed results are normalized to bounded plain data. DOM elements, OSMD objects and internal WeakMaps do not cross the host boundary.

Interaction is rejected when the host is disposed, no score has been rendered, a replacement render is in flight, required hit-test extensions are unavailable, or note-highlight capability is unavailable.

## Selection, deselection and rerender

`BrowserScoreHost` and `OsmdRenderer` do not store a canonical `selectedNote`.

A normal consumer flow is:

```text
current physical event
→ hitTestNoteDetailed
→ require current renderEpoch
→ renderer HIT
→ consumer resolves ScoreNoteRef canonically
→ consumer/editor stores selected canonical note
→ highlight(current ScoreNoteRef)
```

A rerender clears renderer-owned highlight/index/DOM state and advances render-generation evidence. The same logical rendered note may produce an equal `ScoreNoteRef` after rerender, but old detailed evidence and old DOM are stale. The consumer performs deterministic current-revision rebind; the renderer does not automatically restore canonical selection.

## Runtime bridge

Interaction-capable exported runtimes expose bounded presentation operations through `globalThis.__ST_SCORE_RENDER_HOST__`, including `hitTestNote()`, additive `hitTestNoteDetailed()`, `highlight()` and `clearHighlights()`.

Runtime payloads fail closed on malformed/non-plain objects, unknown fields, non-finite coordinates, unsafe part IDs, unsafe integer locators and unsafe highlight class tokens. The runtime exposes no consumer DOM traversal primitive, OSMD model object or editor mutation operation.

## Mobile / Safari evidence boundary

Repository CI exercises the note-interaction fixture at `720px` and `320px` in Chromium and in the exact-pinned Playwright WebKit engine. The WebKit gate covers bounded rendering, exact/unique ownership, ambiguity abstention, rerender freshness and scroll-before-tap behavior.

Playwright WebKit is **not** physical iPhone/Safari acceptance. Safari browser chrome, safe-area behavior, real touch/gesture delivery, passive-listener policy, pinch zoom and consumer-shell lifecycle remain target-device acceptance concerns.

See [MOBILE-SAFARI.md](MOBILE-SAFARI.md).

## SesliTab integration and diagnostic separation

The renderer-aware integration path is:

```text
host touch/pointer event
→ fresh clientX/clientY
→ renderer hitTestNoteDetailed()
→ renderer HIT or structured MISS
→ current renderEpoch check
→ SesliTab-owned canonical resolver
→ exact canonical selection or canonical-map MISS
→ SesliTab/Editor-owned panel/keypad state
→ renderer highlight(current ScoreNoteRef)
```

A quality-marker path must not be required for ordinary exact note selection.

These stages must remain distinguishable:

- renderer MISS;
- stale renderer epoch;
- renderer HIT + canonical-map MISS;
- canonical/editor selection rejection;
- consumer panel/keypad/tab state failure;
- current-render highlight failure.

Guitar TAB or Violin tab-open failure is a consumer issue by default when current renderer HIT and canonical resolution have succeeded. Do not claim a renderer fix without renderer evidence.

Selection diagnostics must not log score contents, MusicXML, SVG, pitches, lyrics, `SemanticAddress`, raw source ids or user filenames. See [SESLITAB-DIAGNOSTIC-HANDOFF.md](SESLITAB-DIAGNOSTIC-HANDOFF.md) for the bounded code/telemetry vocabulary.

## Contract version decision

`SCORE_RENDERER_CONTRACT_VERSION` remains `0.2.0` because note hit-testing is not a mandatory base `ScoreRenderer` method and detailed hit/render-epoch evidence is an additive revision-specific extension. Legacy `hitTestNote()` semantics remain unchanged.

Consumers requiring `hitTestNoteDetailed()` must feature-detect it and pin/verify an exact renderer revision/runtime manifest. A future change that makes the detailed bridge mandatory, changes `ScoreNoteRef`, changes existing hit semantics or expands canonical authority requires a separate compatibility review.

## Tests

- `tests/note-interaction.test.mjs`: deterministic identity, unique-group ownership, ambiguity abstention, stale DOM, rests, no-nearest-note and highlight cleanup;
- `tests/browser-host-interaction.test.mjs`: legacy/detailed host delegation and fail-closed states;
- `tests/browser-host-render-epoch.test.mjs`: render epoch advancement/invalidation;
- `tests/browser/osmd-note-interaction-fixture.html`: real OSMD interaction at 720px/320px, scroll, rerender and re-highlight;
- `tests/browser/osmd-chord-notehead-research-fixture.html`: chord notehead identity evidence;
- `tests/webkit/run-osmd-webkit-fixture.mjs`: exact-pinned WebKit engine evidence for bounded rendering and note interaction.
