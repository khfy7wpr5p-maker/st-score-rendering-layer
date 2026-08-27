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

## Per-project target usage

| Consumer | Initial rendering packages | Purpose |
| --- | --- | --- |
| st-music-workstation | contracts + core + osmd | browser score viewer |
| seslitab-guitar-reader | contracts + core + osmd | score/TAB visual surface |
| musicxml-to-guitar-tab-engine | contracts + future headless/testkit | output validation |
| scoremosaic-platform | contracts + future headless/testkit | OMR/MusicXML visual QA |
| st-score-restore-engine | contracts + future headless/testkit | before/after QA |
| ST-Orchestration | contracts + osmd | orchestral score presentation |
| st-score-editor-core | contracts + osmd preview | read-side preview only |

No consumer integration should begin before the R3 browser fixture gate passes.
