# ST Score Rendering Layer

Shared, vendor-isolated notation rendering boundary for the ST music ecosystem.

## Status

**R0–R7 are merged on `main`. R8 consumer integration is in progress.** The repository has contracts, renderer core, OSMD browser adapter, validated browser interaction/TAB gates, headless rendering/visual regression foundations, and an accessibility bridge. Consumer repositories must not depend directly on OpenSheetMusicDisplay.

R8-B1 is establishing a private ST-owned browser-host boundary. It is not considered complete until its exact PR head passes the full unit, browser, headless, and CI gates.

## Architecture

```text
Consumer repositories / UI shells
        |
        v
@st/score-renderer-browser-host   (R8-B1, integration boundary)
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
- OSMD is isolated to its adapter boundary and pinned to an exact direct dependency version
- consumer-facing browser host has no direct OSMD dependency/import
- runtime contract compatibility is checked independently from private package SemVer
- replacement render failures clear stale presentation output rather than leaving old notation visible
- unsupported features fail closed with explicit capability errors
- consumer projects use ST-owned contracts/capability detection rather than OSMD internals
- rendering/browser work remains outside realtime audio, DSP, AI and device authority

See `SECURITY.md`, `docs/ARCHITECTURE.md`, and `docs/BROWSER-HOST.md`.

## Stages

- R0 — architecture and contracts
- R1 — renderer core
- R2 — OSMD adapter foundation
- R3 — MusicXML rendering fixtures and browser integration
- R4 — cursor, highlighting and part visibility
- R5 — guitar TAB validation
- R6 — headless rendering and visual regression
- R7 — accessibility bridge
- R8 — consumer integrations (in progress)
