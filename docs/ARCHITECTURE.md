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
                     +------------+------------+
                     |                         |
                     v                         v
            @st/score-renderer-osmd      future renderer
                     |
                     v
             OpenSheetMusicDisplay
```

### Contracts

Owns vendor-neutral types, capabilities and lifecycle interfaces. It must have zero dependency on OSMD, DOM, network or consumer repositories.

`ScoreNoteRef` is a deterministic rendered-note locator. `noteIndex` is zero-based within the selected `partId` and `measureIndex`, after optional MusicXML/OSMD voice filtering, traversing instrument staff order, staff entries, graphical voice entries and notes. This keeps consumer-facing note references independent from OSMD object identities.

### Renderer core

Owns source validation, registry/lifecycle behavior and shared errors. It must remain browser-vendor neutral.

### OSMD adapter

Owns every import from `opensheetmusicdisplay` and maps ST options to OSMD. Consumers must not import OSMD directly. OSMD CommonJS/ESM interop is contained at this boundary.

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
- Note highlighting is ST-owned, reversible SVG state; it must not overwrite source/MusicXML note colors.
- `tablature` remains withheld until the R5 guitar-TAB fixture gate.
- `headless` remains withheld until the R6 headless/visual-regression gate.
- Accessibility semantics remain ST-owned and are introduced at R7; rendered SVG must not become the authoritative semantic score model.

## Security boundaries

- Score loading accepts in-memory MusicXML only; URL/network loading is outside the renderer contract.
- Input size validation remains fail-closed.
- Consumer-supplied highlight class names are restricted to one validated CSS class token.
- Missing parts, measures, notes or unsupported runtime primitives fail closed rather than silently degrading.
- Renderer code must never enter realtime audio callback paths.

## Dependency direction

Dependency arrows may only point inward toward contracts/core and outward from adapters to their vendor. A consumer-to-OSMD edge is an architecture violation.
