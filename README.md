# ST Score Rendering Layer

Shared, vendor-isolated notation rendering boundary for the ST music ecosystem.

## Status

Foundation stage: **R0–R2**. The public contracts, renderer core, and first OSMD adapter are being established. No consumer repository should depend directly on OpenSheetMusicDisplay.

## Architecture

```text
Consumer repositories
        |
        v
@st/score-renderer-contracts
        |
        v
@st/score-renderer-core
        |
        +------------------+
        |                  |
        v                  v
@st/score-renderer-osmd   future adapters
        |
        v
OpenSheetMusicDisplay
```

The renderer is a presentation boundary only. Editing, OMR, harmony analysis, MIDI, AI and realtime audio remain outside this repository.

## Security baseline

- accepts in-memory MusicXML text only; no URL/network loader contract
- bounded MusicXML input (5 MiB default)
- rejects empty input and NUL bytes before the vendor parser
- OSMD is isolated to one package and pinned to an exact direct dependency version
- unsupported features fail closed with explicit capability errors
- consumer projects use capability detection rather than OSMD internals

See `SECURITY.md` and `docs/ARCHITECTURE.md`.

## Planned stages

- R0 — architecture and contracts
- R1 — renderer core
- R2 — OSMD adapter foundation
- R3 — MusicXML rendering fixtures and browser integration
- R4 — cursor, highlighting and part visibility
- R5 — guitar TAB validation
- R6 — headless rendering and visual regression
- R7 — accessibility bridge
- R8 — consumer integrations
