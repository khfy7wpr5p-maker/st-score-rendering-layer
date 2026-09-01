# Production-Reality Architecture Audit

Audit date: 2026-09-01  
Fresh-read baseline: protected `main` at `5ac49bf5483fe6ab0d4ba0cbd09978054ff8af4f`.

This file records documentation/repository mismatches discovered during the architecture refresh. It is an audit record, not a second architecture specification. Current architecture is defined in [ARCHITECTURE.md](ARCHITECTURE.md).

## Fresh-read snapshot

- default/protected branch: `main`;
- active main ruleset: pull request required, strict `foundation` status check required, no bypass;
- open pull requests at audit start: none;
- open issues at audit start: none;
- latest main CI at audit start: success;
- releases: none;
- tags: none;
- workspace packages: `contracts`, `renderer-core`, `adapter-osmd`, `adapter-osmd-headless`, `accessibility`, `browser-host`;
- renderer vendor: exact `opensheetmusicdisplay` `2.1.2` in both OSMD adapters;
- committed lockfile: none in the fresh-read tree; CI generates a lockfile during `npm install` and uploads it as an artifact when present.

## Finding classification

| Finding | Category | Production reality / resolution | Primary evidence |
| --- | --- | --- | --- |
| README pinned R8-B4 status to older renderer SHA `717c0c...` | DOC_STALE | Removed stale architecture-status SHA from README; this audit records the fresh-read baseline instead | protected main + `README.md` |
| README architecture did not describe note hit-test/highlight or generic browser runtime | DOC_INCOMPLETE | Added current interaction/runtime boundaries | `packages/browser-host`, `scripts/export-browser-runtime.mjs` |
| `BROWSER-HOST.md` still described R8-B1 as if Workstation display/delivery were future work | DOC_STALE | Rewritten around current BrowserScoreHost + exported runtimes | runtime scripts/tests |
| `CONSUMER-INTEGRATION.md` repeated older renderer SHA and stage-centric consumer planning | DOC_STALE | Reframed around actual internal package/runtime surfaces; SesliTab completion is not inferred | current source + runtime exports |
| Architecture text could be read as if an ST canonical score/ScoreGraph sits inside the renderer | ARCHITECTURAL_AMBIGUITY | Explicitly documented that no ScoreGraph/canonical model implementation exists here | repository search + contracts/core source |
| Requested PDF/image/MXL/JSON import pipeline does not exist | UNDOCUMENTED_RUNTIME_BEHAVIOR | Documented the actual MusicXML-only contract and all unsupported source kinds | `ScoreSource`, `validateScoreSource` |
| Requested page/system/staff/measure/note renderer layers are not ST modules | ARCHITECTURAL_AMBIGUITY | Documented that graphical parsing/layout/rendering is delegated to OSMD | `adapter-osmd` |
| Note interaction previously lacked a top-level visual-geometry vs interaction-geometry explanation | DOC_INCOMPLETE | Added exact distinction and DOM ownership model | `resolveNoteAtClientPoint`, hit-test tests |
| A conventional viewport→score coordinate transform could be inferred from interaction discussions | DOC_INCORRECT | Production uses `clientX/clientY` directly with `document.elementFromPoint()`; no custom score-coordinate conversion exists | `adapter-osmd` |
| Renderer could be assumed to own touch/pointer listeners and selection state | DOC_INCORRECT | Host owns event listeners and selected-note state; renderer exposes imperative hit-test/highlight primitives | `browser-host`, `adapter-osmd` |
| Mobile behavior lacked a clear Safari verification boundary | DOC_INCOMPLETE | Added dedicated mobile document: real iPhone/Safari acceptance motivated PR #16, but repository automation is Chrome/Chromium only | PR #16 + browser fixture runner |
| Render lifecycle docs did not make replacement clearing/current-state destruction explicit enough | DOC_INCOMPLETE | Documented fresh-renderer replacement lifecycle and stale-output clearing | `BrowserScoreHost.renderMusicXml` + tests |
| OSMD `autoResize` could be mistaken for an ST-owned ResizeObserver/reflow system | ARCHITECTURAL_AMBIGUITY | Documented that ST only maps `autoResize`; no ST ResizeObserver/orientation/font listener exists | source search + adapter code |
| Playback availability could be accidentally coupled to renderer/OMR validation | CODE_DOC_CONTRACT_MISMATCH | There is no playback contract or playback gate in this repo; host playback must remain independently governed | contracts/source search |
| OMR/Score Restore/ScoreMosaic relationships were consumer-name descriptions rather than an explicit authority boundary | DOC_INCOMPLETE | Added upstream MusicXML producer boundary; renderer has no OMR/correction authority | package dependencies + source search |
| TAB support was described broadly without a production support matrix | DOC_INCOMPLETE | Added fixture-backed support levels and distinguished untested techniques | TAB fixture + repository search |
| Hammer-on/pull-off/slide/bend could be inferred from generic guitar/TAB support | ARCHITECTURAL_AMBIGUITY | Marked as not guaranteed by ST capability/contract/tests | no matching contract/test implementation |
| Error/degraded behavior had no consolidated contract | DOC_INCOMPLETE | Added dedicated degraded-mode document | core/host/headless code + tests |
| Public package/runtime API was scattered across source and stage docs | DOC_INCOMPLETE | Added public API inventory and public-vs-adapter-specific distinctions | package exports + source entrypoints |
| Test architecture was stage-oriented rather than contract-oriented | DOC_INCOMPLETE | Added contract→code→test matrix and explicit Safari gap | CI workflow + tests |
| Historical R-stage prose was mixed with current architecture | DEPRECATED_ARCHITECTURE_REFERENCE | Historical labels retained only where useful as test provenance; production docs now use component/runtime names | documentation set |

## Architectural discoveries

No production-code change was made as part of this documentation refresh.

### ARCHITECTURE_DISCOVERY: Safari automation gap

- severity: LOW / verification gap
- component: browser note interaction / mobile verification
- observed_behavior: repository CI executes Chrome/Chromium fixtures, including 320px responsive interaction; it has no Safari/WebKit automation.
- expected_contract: documentation must not describe Safari-specific interaction/reflow behavior as continuously CI-proven.
- evidence: `tests/browser/run-osmd-browser-fixture.mjs`, PR #16 acceptance record.
- recommended_follow_up: add a dedicated WebKit/Safari integration gate only if the project requires automated Safari conformance; until then, keep Safari claims bounded to manual/real-device acceptance evidence.

This is not evidence of a current renderer bug and therefore was not changed in production code or opened as a blocking defect by this documentation PR.

## Code → documentation authority rules

During this refresh, claims were accepted only when one of the following held:

1. directly implemented in source code;
2. represented in public contracts/package exports;
3. proven by executable tests/CI;
4. explicitly labeled as a boundary/non-goal when absence was verified.

OSMD vendor behavior that is not wrapped or fixture-gated by ST is not promoted to an ST architecture guarantee.

## Unverified areas

The following are intentionally **UNVERIFIED** as ST contracts:

- Safari/WebKit automated behavior across orientation changes, browser UI resize, safe areas and pinch zoom;
- OSMD handling of arbitrary partially malformed MusicXML or unknown symbols;
- technique-specific guitar rendering beyond the current standard+TAB string/fret fixture;
- consumer-side canonical mapping from `ScoreNoteRef` to SesliTab/ScoreGraph entities;
- consumer playback behavior for incomplete OMR results.

These areas remain outside the certainty level of repository code/tests and are not stated as guaranteed production behavior in the refreshed architecture.
