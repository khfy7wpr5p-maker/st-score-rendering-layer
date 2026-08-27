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

### Renderer core

Owns source validation, registry/lifecycle behavior and shared errors. It must remain browser-vendor neutral.

### OSMD adapter

Owns every import from `opensheetmusicdisplay` and maps ST options to OSMD. Consumers must not import OSMD directly.

## Consumer boundaries

- `st-music-workstation`: browser score view; no renderer work in realtime audio callback paths.
- `seslitab-guitar-reader`: visual score/TAB view; accessibility semantics remain ST-owned.
- `musicxml-to-guitar-tab-engine`: renderer is validation/output only, never the fingering solver.
- `scoremosaic-platform`: visual QA of normalized MusicXML; never the OMR engine.
- `st-score-restore-engine`: before/after rendering and regression evidence only.
- `ST-Orchestration`: full-score presentation only.
- `st-score-editor-core`: preview/read side only; editor remains authoritative write side.

## Capability policy

A feature may be advertised only after the adapter boundary implements and tests it. R2 advertises only `musicxml-render` and `svg-export` at the adapter-contract level. Real OSMD browser rendering is still gated by R3. `tablature` is intentionally withheld until the R5 guitar-TAB fixture gate. Cursor, note highlighting, part visibility and headless rendering remain unavailable until later stages.

## Dependency direction

Dependency arrows may only point inward toward contracts/core and outward from adapters to their vendor. A consumer-to-OSMD edge is an architecture violation.
