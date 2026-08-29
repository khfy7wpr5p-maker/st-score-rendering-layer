# Consumer Integration

## Rule 1: never import OSMD from a consumer repository

Allowed:

```ts
import type { ScoreRenderer } from "@st/score-renderer-contracts";
import { OsmdRenderer } from "@st/score-renderer-osmd";
```

Forbidden:

```ts
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
```

## Current integration status

The R3 real-browser fixture gate has passed, R8-B1 is complete, and R8-B4 is complete on renderer revision `717c0c2f32cebf11350104020d9d12ff88c59e94`.

The first production consumer integration is complete in `st-music-workstation`. The Workstation consumes the renderer-owned offline runtime as verified local presentation assets, pins the exact renderer commit SHA, verifies manifest provenance/integrity, and keeps OSMD behind the ST-owned browser-host/adapter boundary.

No second consumer integration stage is currently defined in this repository. Selecting the next consumer is an explicit planning decision and must not be inferred as an undocumented R8-B5 stage.

## Per-project target usage

| Consumer | Integration status / target | Purpose |
| --- | --- | --- |
| st-music-workstation | R8-B4 integration complete; verified offline runtime | browser score viewer |
| seslitab-guitar-reader | candidate future consumer; ST-owned renderer boundary required | score/TAB visual surface |
| musicxml-to-guitar-tab-engine | candidate future consumer; headless/testkit-style validation boundary | output validation |
| scoremosaic-platform | candidate future consumer; headless/testkit-style validation boundary | OMR/MusicXML visual QA |
| st-score-restore-engine | candidate future consumer; headless/testkit-style validation boundary | before/after QA |
| ST-Orchestration | candidate future consumer; ST-owned renderer boundary required | orchestral score presentation |
| st-score-editor-core | candidate future consumer; read-side preview boundary only | read-side preview only |

## Consumer requirements

Every consumer integration must:

- depend on ST-owned contracts/runtime boundaries rather than OSMD APIs or types;
- pin an immutable renderer revision or otherwise provide equivalent reviewed provenance;
- verify the exported runtime manifest and integrity metadata where the R8-B4 runtime is used;
- pass the relevant real-runtime rendering gate before capability is advertised;
- remain fail-closed for malformed, incompatible, or unsupported inputs;
- keep rendering outside realtime audio/DSP paths and outside editing, OMR, harmony, MIDI, AI, filesystem, shell, plugin, and network authority.
