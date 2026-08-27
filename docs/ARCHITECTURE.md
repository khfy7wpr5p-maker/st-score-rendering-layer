# Architecture

## Purpose

`st-score-rendering-layer` is the stable notation-presentation boundary shared by ST projects. Consumers bind to ST-owned contracts, never to OSMD internals.

## Layering

```text
ST Music Workstation / SesliTab / TAB Engine / ScoreMosaic / Score Restore
                                  |
                                  v
                   @st/score-renderer-contracts
                                  |
                                  v
                      @st/score-renderer-core
                                  |
                +-----------------+------------------+
                |                                    |
                v                                    v
      @st/score-renderer-osmd          @st/score-renderer-osmd-headless
                |                                    |
                +-----------------+------------------+
                                  |
                                  v
                         OpenSheetMusicDisplay
```

Future renderer implementations may sit beside the OSMD adapters while preserving the same ST-owned contracts.

### Contracts

Owns vendor-neutral types, capabilities and lifecycle interfaces. It must have zero dependency on OSMD, DOM, network or consumer repositories.

`ScoreNoteRef` is a deterministic rendered-note locator. `noteIndex` is zero-based within the selected `partId` and `measureIndex`, after optional MusicXML/OSMD voice filtering, traversing instrument staff order, staff entries, graphical voice entries and notes. This keeps consumer-facing note references independent from OSMD object identities.

### Renderer core

Owns source validation, registry/lifecycle behavior and shared errors. It must remain browser-vendor neutral.

### Browser OSMD adapter

`@st/score-renderer-osmd` owns every browser import from `opensheetmusicdisplay` and maps ST options to OSMD. Consumers must not import OSMD directly. OSMD CommonJS/ESM interop is contained at this boundary.

### Headless OSMD adapter

`@st/score-renderer-osmd-headless` is a separate server/CI adapter. It launches a controlled local Chrome/Chromium process around the exact-pinned local OSMD bundle and returns SVG output. It intentionally does not claim interactive cursor, note-highlight or part-visibility capabilities.

The headless adapter accepts only validated in-memory MusicXML, writes a restricted temporary local fixture, blocks page network access with CSP, bounds process time/output, deletes temporary state in `finally`, and keeps the browser sandbox enabled by default. GitHub-hosted CI explicitly opts into `--no-sandbox` because of runner constraints; that opt-in is not the package default.

## Consumer boundaries

- `st-music-workstation`: browser score view; no renderer work in realtime audio callback paths.
- `seslitab-guitar-reader`: visual score/TAB view; accessibility semantics remain ST-owned.
- `musicxml-to-guitar-tab-engine`: renderer is validation/output only, never the fingering solver.
- `scoremosaic-platform`: visual QA of normalized MusicXML; never the OMR engine.
- `st-score-restore-engine`: before/after rendering and regression evidence only.
- `ST-Orchestration`: full-score presentation only.
- `st-score-editor-core`: preview/read side only; editor remains authoritative write side.

Consumer repositories remain unchanged through R7. Cross-repository adoption begins only at the explicit R8 integration gate.

## Capability policy

A feature may be advertised only after its adapter behavior and the relevant real-runtime fixture are tested.

- R2 established `musicxml-render` and `svg-export` at the adapter contract boundary.
- R3 proved real OSMD 2.1.2 MusicXML-to-SVG rendering in Chrome/Chromium.
- R4 advertises `cursor`, `note-highlight` and `part-visibility` after unit tests plus real-browser evidence for the underlying OSMD cursor, graphical-note SVG and instrument visibility primitives.
- R5 advertises `tablature` only after a real-browser guitar fixture proves an OSMD `Staff.isTab` staff with six lines and renders distinct fret labels from MusicXML technical string/fret data.
- R6 advertises `headless` only on `@st/score-renderer-osmd-headless`, after real Chrome/Chromium rendering, repeated-render determinism checks, TAB semantic checks and an exact committed SHA-256 visual baseline for OSMD 2.1.2.
- Note highlighting is ST-owned, reversible SVG state; it must not overwrite source/MusicXML note colors.
- Accessibility semantics remain ST-owned and are introduced at R7; rendered SVG must not become the authoritative semantic score model.

## Visual regression policy

The R6 baseline is tied to the committed fixture and exact OSMD version. A digest change is a review gate, not an automatic baseline update. The SVG must first satisfy semantic assertions such as expected title and TAB fret labels; only then is its deterministic digest compared with the committed baseline.

## Security boundaries

- Score loading accepts in-memory MusicXML only; URL/network loading is outside the renderer contract.
- Input size validation remains fail-closed.
- Consumer-supplied highlight class names are restricted to one validated CSS class token.
- Missing parts, measures, notes or unsupported runtime primitives fail closed rather than silently degrading.
- Headless execution uses argv-based process spawning, never a shell command string.
- Headless browser output and execution time are bounded.
- Headless page network access is disabled through CSP and Chrome background-network suppression flags.
- Renderer code must never enter realtime audio callback paths.

## Dependency direction

Dependency arrows may only point inward toward contracts/core and outward from adapters to their vendor. A consumer-to-OSMD edge is an architecture violation. Accessibility remains vendor-neutral at R7 and may depend on ST references/resolvers, never on OSMD as its semantic authority.
