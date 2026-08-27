# Security Policy

## Trust boundaries

MusicXML supplied by consumers is **untrusted input**. Rendering must not grant it network, filesystem, shell, plugin, AI-provider, MIDI-device, or realtime-audio privileges.

## Current controls

1. `ScoreSource` only accepts in-memory MusicXML text. URL loading is intentionally absent.
2. `validateScoreSource` rejects empty input, NUL bytes, and payloads larger than 5 MiB by default.
3. OpenSheetMusicDisplay is reachable only through `@st/score-renderer-osmd`.
4. Unsupported adapter capabilities fail explicitly; they are not emulated through unreviewed vendor internals.
5. Direct dependencies use exact versions during foundation development.
6. CI actions are pinned to commit SHAs.

## Explicit non-goals for R0–R2

- no remote MusicXML fetching
- no archive extraction API
- no PDF/OMR parsing
- no script execution from score content
- no plugin execution
- no AI/provider calls
- no realtime audio callbacks

## Release gate

Before any package is published or consumed from production repositories, require:

- committed dependency lockfile and `npm ci`
- dependency/license review
- MusicXML parser abuse fixtures
- browser integration tests
- visual regression baseline
- documented supported OSMD version matrix
