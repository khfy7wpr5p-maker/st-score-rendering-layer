# Editor Bridge Current Reality

Program: `SRL-EDITOR-BRIDGE-01`

Current program baseline after merged SRL-EB-05/06: `25ddf4a99ae85cc761ad9606f6bfebad817afe66` on 2026-09-01.

This document records the renderer/editor responsibility boundary and the current additive bridge evidence. It does not grant canonical edit authority to the renderer.

## Repository evidence

- default branch: `main`
- pull request required for `main`
- strict required status check: `foundation`
- renderer contract: `0.2.0`
- browser renderer vendor dependency: exact `opensheetmusicdisplay` `2.1.2`
- browser host exposes legacy `hitTestNote(point): ScoreNoteRef | null` and bounded detailed hit evidence
- render results/detailed hit evidence carry a render epoch so stale evidence can be detected across replacement renders
- generic browser runtime exposes bounded presentation hit/highlight operations without Editor Core authority
- Chromium automation covers the committed browser fixture suite
- SRL-EB-07 adds a pinned Playwright WebKit engine gate for bounded baseline rendering and note interaction; physical iPhone/Safari remains a separate acceptance boundary

## Frozen responsibility matrix

| Concern | Rendering Layer | Host / SesliTab | Editor Core |
| --- | --- | --- | --- |
| MusicXML presentation | owns | supplies source | does not own rendering |
| DOM/SVG hit testing | owns exact renderer-side evidence | supplies browser coordinates | does not inspect DOM/SVG |
| `ScoreNoteRef` | owns as rendered locator | maps only for current render | never treats it as canonical identity |
| render epoch | owns presentation-generation evidence | rejects/rebinds stale mapping | may use host-provided current mapping only |
| canonical note identity | does not own | bridges current mapping | owns through revision-bound semantic identity |
| edit transaction | does not own | invokes editor API | owns |
| selected-note application state | does not own | owns | owns canonical selection semantics |
| highlight presentation | owns renderer DOM state | requests current highlight | does not own renderer DOM |
| rerender rebind | invalidates old presentation state | coordinates new mapping | validates/rebinds canonical selection |
| nearest/pitch/proximity fallback | forbidden | forbidden for identity | forbidden for identity |
| playback authorization | does not own | consumer-owned | does not derive from renderer hit state |

## Identity invariant

`ScoreNoteRef` is a deterministic rendered-note locator only. It is not a global event id, canonical array index, semantic edit address, pitch identity, or durable DOM identity across replacement renders.

The shared bridge direction remains:

```text
current editor revision / render projection
→ renderer presentation
→ exact rendered hit evidence + render epoch
→ host validates current render mapping
→ Editor Core resolves current canonical semantic identity
→ canonical selection/edit
→ renderer highlight for the current rendered locator
```

No renderer package imports Editor Core as canonical authority.

## Current hit path

```text
host pointer/touch event
→ clientX/clientY
→ BrowserScoreHost hit-test
→ OsmdRenderer client-point resolution
→ document.elementFromPoint
→ renderer-owned DOM ancestry ownership index
→ bounded HIT/MISS evidence
→ ScoreNoteRef or null legacy projection
```

Exact noteheads are strongest targets. A uniquely owned graphical-note group may widen ownership to stem/flag/dot descendants. Shared ownership abstains. Rests are not selectable note targets. No nearest-note, radius expansion, pitch matching, distance ranking, or consumer-side SVG scraping is admitted.

## Detailed diagnostic surface

The concrete browser path exposes bounded hit/miss evidence. Miss reasons remain explicit and finite, including:

- `NO_ELEMENT_AT_POINT`
- `OUTSIDE_RENDER_CONTAINER`
- `UNMAPPED_ELEMENT`
- `AMBIGUOUS_OWNERSHIP`
- `NO_NOTE_OWNER`

The legacy `ScoreNoteRef | null` surface remains available and collapses detailed misses to `null`. Diagnostics add observability; they do not add fallback selection authority.

Detailed results contain bounded plain data only. DOM elements, OSMD objects, WeakMaps, score source contents and raw persisted browser-event objects do not escape the adapter.

## Render epoch / stale evidence

A successful render creates current presentation-generation evidence. Detailed hit evidence is bound to that render epoch and, where available, the current source id.

Replacement rendering advances the epoch. Regression coverage verifies that:

- old rendered DOM targets are detached;
- old highlight state is cleared;
- old hit evidence has a different epoch from the new render;
- the same logical rendered locator can be resolved again only from current DOM evidence;
- a current `ScoreNoteRef` can be highlighted again after rebind.

The epoch is presentation freshness evidence. It is not a canonical score revision id.

## SRL-EB-05/06 merged evidence

Merged main `25ddf4a99ae85cc761ad9606f6bfebad817afe66` protects:

- multiple reversible renderer highlights;
- rerender cleanup of stale highlight state and DOM hit ownership;
- fresh versus stale render-epoch evidence;
- exact notehead and uniquely owned graphical-descendant interaction;
- shared chord-group ambiguity abstention;
- real OSMD Chromium fixture coverage at `720px` and `320px`;
- scroll-before-tap using current client coordinates;
- direct SVG-surface interaction with no added overlay.

## SRL-EB-07 WebKit feasibility

SRL-EB-07 adds a development/test-only exact-pinned Playwright dependency and a WebKit engine gate to the required `foundation` CI path.

The gate:

- installs only the required Playwright WebKit engine and system dependencies;
- serves repository assets from loopback HTTP only;
- runs baseline MusicXML→SVG evidence;
- runs the bounded note-interaction fixture, including `720px`/`320px`, rerender, scroll-before-tap, exact note ownership and ambiguity abstention;
- requires explicit PASS state plus final SVG evidence;
- reports bounded diagnostics on failure.

This is **WebKit engine evidence, not physical Safari acceptance**. Real iPhone/Safari browser chrome, safe-area behavior, touch/gesture delivery, pinch zoom and consumer-shell lifecycle remain external target-device acceptance concerns.

## Contract/version decision

`SCORE_RENDERER_CONTRACT_VERSION` remains `0.2.0` because these bridge stages preserve the base renderer authority boundary. Detailed browser evidence, render epochs and multi-engine regression coverage are additive presentation/diagnostic behavior rather than a new cross-renderer canonical-edit contract.

A future change that makes browser hit diagnostics or editor identities mandatory across every renderer requires a separate contract-version review.

## Remaining program work

- `SRL-EB-08` — SesliTab consumer diagnostic/current-render handoff acceptance
- `SRL-EB-09` — synchronized final public docs/versioning pass
- physical iPhone/Safari acceptance — external real-device gate, not replaceable by Playwright WebKit

## No-touch invariants

The program must not silently change:

- OMR/provider/runtime/gateway/worker authority;
- canonical score mutation ownership;
- Editor Core transaction ownership;
- playback/audio authorization;
- Guitar TAB or Violin musical authority;
- nearest-note/pitch/proximity fallback policy.
