# Editor Bridge Current Reality

Program: `SRL-EDITOR-BRIDGE-01`

Fresh-read baseline: `814cddef12cb9150045793b007b1ceab82c25259` on 2026-09-01.

This document freezes the renderer/editor responsibility boundary for SRL-EB-00 and records the additive SRL-EB-01 diagnostic surface introduced on the feature branch. It does not grant canonical edit authority to the renderer.

## Fresh-read repository evidence

- default branch: `main`
- active default-branch ruleset: `main`
- pull request required for `main`
- strict required status check: `foundation`
- required check on baseline SHA: success
- open pull requests at freeze: none
- open issues at freeze: none
- renderer contract: `0.2.0`
- browser renderer vendor dependency: exact `opensheetmusicdisplay` `2.1.2`
- browser host currently exposes legacy `hitTestNote(point): ScoreNoteRef | null`
- generic browser runtime currently exposes legacy note-hit/highlight presentation operations
- no automated Safari/WebKit gate exists in the current repository

The REST branch-protection endpoint was not readable through the integration, but the repository ruleset endpoint was readable and is authoritative for this freeze: the active ruleset targets the default branch, prevents deletion/non-fast-forward updates, requires pull requests, and requires the strict `foundation` check.

## Frozen responsibility matrix

| Concern | Rendering Layer | Host / SesliTab | Editor Core |
| --- | --- | --- | --- |
| MusicXML presentation | owns | supplies source | does not own rendering |
| DOM/SVG hit testing | owns exact renderer-side evidence | supplies browser coordinates | does not inspect DOM/SVG |
| `ScoreNoteRef` | owns as rendered locator | may map it for current render | never treats it as canonical identity |
| canonical note identity | does not own | bridges current mapping | owns through revision-bound `SemanticAddress` |
| edit transaction | does not own | invokes editor API | owns |
| selected-note application state | does not own | owns | owns canonical selection semantics |
| highlight presentation | owns renderer DOM state | requests current highlight | does not own renderer DOM |
| rerender rebind | invalidates old presentation state | coordinates new mapping | validates/rebinds canonical selection |
| nearest/pitch/proximity fallback | forbidden | forbidden for identity | forbidden for identity |
| playback authorization | does not own | consumer-owned | does not derive from renderer hit state |

## Identity invariant

`ScoreNoteRef` is a deterministic rendered-note locator only. It is not a global event id, canonical array index, `SemanticAddress`, pitch identity, or durable identity across replacement renders.

The shared bridge direction remains:

```text
current editor revision / render projection
→ renderer presentation
→ exact rendered hit evidence
→ host validates current render mapping
→ Editor Core resolves current SemanticAddress
→ canonical selection/edit
→ renderer highlight for the current rendered locator
```

No renderer package imports Editor Core as canonical authority.

## Current legacy hit path

```text
host pointer/touch event
→ clientX/clientY
→ BrowserScoreHost.hitTestNote
→ OsmdRenderer.resolveNoteAtClientPoint
→ document.elementFromPoint
→ renderer-owned DOM ancestry ownership index
→ ScoreNoteRef or null
```

Exact noteheads are strongest targets. A uniquely owned graphical note group may widen ownership to stem/flag/dot descendants. Shared ownership abstains. Rests are not selectable note targets. No nearest-note, radius expansion, pitch matching, distance ranking, or consumer-side SVG scraping is admitted.

## SRL-EB-01 additive diagnostic surface

The OSMD adapter adds:

```ts
resolveNoteAtClientPointDetailed(point):
  | { kind: "HIT"; target: ScoreNoteRef }
  | { kind: "MISS"; reason: HitMissReason }
```

Bounded miss reasons:

- `NO_ELEMENT_AT_POINT`
- `OUTSIDE_RENDER_CONTAINER`
- `UNMAPPED_ELEMENT`
- `AMBIGUOUS_OWNERSHIP`
- `NO_NOTE_OWNER`

The legacy `resolveNoteAtClientPoint(point): ScoreNoteRef | null` remains present and converts every detailed miss back to `null`. Thus SRL-EB-01 adds observability without adding a fallback selection path.

`NO_NOTE_OWNER` is explicit renderer evidence for rendered ownership that is known not to be a selectable note target, currently including indexed rest graphical groups. `UNMAPPED_ELEMENT` means the browser hit is inside the renderer container but no renderer-owned note/rest ownership was found in its ancestry.

Detailed results contain only bounded plain data. DOM elements, OSMD objects, WeakMaps, score source contents and raw persisted coordinates do not escape the adapter.

## Contract/version decision for PR-A

`SCORE_RENDERER_CONTRACT_VERSION` remains `0.2.0` in PR-A because:

1. the base `ScoreRenderer` interface is unchanged;
2. the existing browser-host `hitTestNote()` surface is unchanged;
3. the exported browser runtime is unchanged in PR-A;
4. the new method is an additive concrete OSMD-adapter extension;
5. no new authority or dependency is introduced.

Any later exposure of diagnostics through the generic browser runtime must be reviewed again under SRL-EB-03 before merge.

## Companion Editor Core boundary

The companion editor program defines the same shared bridge principle: renderer/browser/DOM/coordinates never become musical authority; external exact-hit evidence must be resolved against the current render/revision mapping, and `SemanticAddress` remains the edit target. Renderer changes therefore must not invent or persist Editor Core canonical identities.

## Explicitly deferred after PR-A

- render epoch / stale evidence token (`SRL-EB-02`)
- BrowserScoreHost detailed diagnostic exposure (`SRL-EB-03`)
- exported runtime detailed diagnostic exposure (`SRL-EB-03`)
- renderer-side shared bridge handoff contract (`SRL-EB-04`)
- rerender/selection regression expansion (`SRL-EB-05`)
- mobile 320px regression expansion (`SRL-EB-06`)
- WebKit feasibility (`SRL-EB-07`)
- SesliTab consumer diagnostic handoff (`SRL-EB-08`)
- synchronized final public docs/versioning pass (`SRL-EB-09`)

## PR-A no-touch confirmation

No changes are intended to:

- OMR/provider/runtime/gateway/worker behavior;
- canonical score mutation;
- Editor Core transaction implementation;
- SesliTab keypad UI;
- playback/audio authorization;
- Guitar TAB or Violin authority;
- dependency graph;
- nearest-note/pitch/proximity fallback behavior.
