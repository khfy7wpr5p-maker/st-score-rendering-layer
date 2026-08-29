# ST Score Rendering Layer

Shared, vendor-isolated notation rendering boundary for the ST music ecosystem.

## Status

**R0–R7, R8-B1, and R8-B4 are merged on `main`.** The repository provides contracts, renderer core, OSMD browser and headless adapters, validated browser interaction/TAB gates, deterministic visual-regression foundations, an accessibility bridge, the ST-owned browser-host boundary, and the renderer-owned offline Workstation runtime export.

R8-B4 is complete on renderer `main` at `717c0c2f32cebf11350104020d9d12ff88c59e94`. The exported `dist/workstation-runtime` is a self-contained, ST-owned presentation asset boundary with integrity/provenance metadata, bounded in-memory MusicXML input, stale-output clearing on failed replacement, and an offline-first CSP. Consumer repositories must not depend directly on OpenSheetMusicDisplay.

The first R8 consumer integration is also complete in `st-music-workstation`: the Workstation pins and verifies the exact renderer revision and embeds the exported runtime behind its presentation/WebView boundary. No additional renderer consumer integration stage is currently defined in this repository; the next consumer must be selected explicitly rather than inferred.

## Architecture

```text
Consumer repositories / UI shells
        |
        v
@st/score-renderer-browser-host   (R8-B1, ST-owned integration boundary)
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

R8-B4 build-time export
        |
        v
dist/workstation-runtime
        |
        v
ST Music Workstation presentation/WebView boundary
```

The renderer is a presentation boundary only. Editing, OMR, harmony analysis, MIDI, AI and realtime audio remain outside this repository.

## Security baseline

- accepts in-memory MusicXML text only; no URL/network loader contract
- bounded MusicXML input (5 MiB default)
- rejects empty input and NUL bytes before the vendor parser
- OSMD is isolated to its adapter boundary and pinned to an exact direct dependency version
- consumer-facing browser host has no direct OSMD dependency/import
- runtime contract compatibility is checked independently from private package SemVer
- R8-B4 runtime export includes integrity/provenance metadata and exact asset digests
- R8-B4 runtime is offline-first and disables page connections through CSP
- replacement render failures clear stale presentation output rather than leaving old notation visible
- unsupported features fail closed with explicit capability errors
- consumer projects use ST-owned contracts/capability detection rather than OSMD internals
- rendering/browser work remains outside realtime audio, DSP, AI and device authority

See `SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/BROWSER-HOST.md`, and `docs/CONSUMER-INTEGRATION.md`.

## Stages

- R0 — architecture and contracts ✅
- R1 — renderer core ✅
- R2 — OSMD adapter foundation ✅
- R3 — MusicXML rendering fixtures and browser integration ✅
- R4 — cursor, highlighting and part visibility ✅
- R5 — guitar TAB validation ✅
- R6 — headless rendering and visual regression ✅
- R7 — accessibility bridge ✅
- R8-B1 — ST-owned browser-host integration boundary ✅
- R8-B4 — offline Workstation runtime export ✅
- R8 Workstation consumer integration — completed in `st-music-workstation` ✅
- Next consumer integration — not yet selected/defined
