# SRL-EB-07 — Safari/WebKit Automation Feasibility Gate

Date: 2026-09-01
Program: `SRL-EDITOR-BRIDGE-01`
Fresh-read baseline: `25ddf4a99ae85cc761ad9606f6bfebad817afe66`
Status: `HUMAN_APPROVAL_REQUIRED_FOR_TOOLING_CHANGE`

## Decision

Automated WebKit coverage cannot be added under the current `NO_NEW_RUNTIME_DEPENDENCY` / no-material-new-tooling constraint without introducing a new test dependency and/or downloading a WebKit browser build in CI.

Therefore SRL-EB-07 stops before any `package.json`, generated lockfile, browser binary, or CI workflow mutation.

This is a tooling feasibility result only. It does not change renderer behavior and it does not claim Safari/WebKit acceptance.

## Fresh-read evidence

Repository state at this gate:

- protected default branch: `main`
- baseline SHA: `25ddf4a99ae85cc761ad9606f6bfebad817afe66`
- active ruleset requires pull requests and strict `foundation`
- open pull requests: none at fresh read
- open issues: none at fresh read
- renderer contract remains `0.2.0`
- OSMD remains `2.1.2`
- repository source tree contains no committed `package-lock.json`; CI generates and uploads one as an artifact
- root development dependencies are only `@types/node` and `typescript`
- no Playwright/WebKit test dependency or WebKit runner exists in the repository
- current real-browser gate launches Chrome/Chromium directly through `spawnSync`
- current exported browser runtime remains browser-neutral and does not contain browser automation tooling

The GitHub-hosted runner used by current CI is `ubuntu-24.04`. The exact runner-image family observed by CI (`ubuntu24/20260823.283`) lists Chrome, Chromium, Edge, Firefox, Selenium, and their drivers, but no WebKit browser or Playwright installation:

`https://github.com/actions/runner-images/blob/ubuntu24/20260823.283/images/ubuntu/Ubuntu2404-Readme.md`

## Existing evidence that remains valid

The repository already proves exact-selection behavior in Chrome/Chromium at 720px and 320px, including:

- exact notehead hit
- deterministic `ScoreNoteRef`
- uniquely owned graphical descendant hit
- shared chord-group abstention
- whitespace/outside abstention
- scroll followed by fresh client-coordinate hit
- replacement render with a new render epoch
- stale evidence rejection by epoch comparison
- post-rerender exact re-hit and highlight
- no renderer-created proximity overlay

These tests must be reused for WebKit rather than inventing a separate looser mobile selection contract.

## Why the existing runner cannot be reused as-is

`tests/browser/run-osmd-browser-fixture.mjs` searches only for:

- `CHROME_BIN`
- `google-chrome`
- `google-chrome-stable`
- `chromium`
- `chromium-browser`

It depends on Chromium-specific headless CLI flags such as `--headless=new`, `--virtual-time-budget`, and `--dump-dom`.

There is no equivalent WebKit executable or CLI contract available in the repository or documented as preinstalled on the current GitHub Ubuntu runner. Merely renaming the executable candidate would not create valid WebKit coverage.

## Proposed implementation if tooling approval is granted

Preferred bounded proposal:

1. Add an exact-pinned `playwright` development dependency only for browser testing.
2. Add a dedicated WebKit test runner that launches Playwright WebKit and opens the existing local fixture surface.
3. Reuse `tests/browser/osmd-note-interaction-fixture.html`; do not add alternate hit rules, touch radius, nearest-note, pitch matching, SVG proximity, or canonical identity logic.
4. In CI, install the Playwright WebKit browser build explicitly before the WebKit gate, for example through the Playwright-supported WebKit install command for the pinned package revision.
5. Keep the existing Chrome/Chromium `foundation` evidence unchanged while WebKit is introduced and stabilized.
6. Initially report the WebKit job independently. Requiring it in the protected-branch ruleset should be a separate governance decision after the gate is stable.
7. Keep physical iPhone Safari testing as the final SesliTab acceptance gate.

Expected source changes after approval would be limited to browser-test tooling and CI, principally:

- root `package.json`
- generated dependency lock evidence as required by repository policy
- `.github/workflows/ci.yml`
- a WebKit browser runner under `tests/browser/`
- browser-test documentation after behavior is proven

No renderer runtime package, Editor Core package, canonical model, MusicXML transformation, OMR, playback, Guitar TAB authority, Violin authority, or SesliTab UI code is required for this gate.

## Important limitation

Playwright WebKit is useful engine-level regression coverage but is not identical to physical iPhone Safari. Passing WebKit automation must not be reported as proof of:

- iOS Safari browser chrome behavior
- `visualViewport` behavior on a physical device
- orientation-change behavior
- safe-area handling
- real touch/pinch/scroll gesture arbitration
- passive-listener behavior in the SesliTab host
- nested-scroller behavior in the final application shell

Those remain consumer/device acceptance responsibilities.

## Approval boundary

Human approval is required before any of the following:

- adding Playwright or another browser automation dependency
- changing package or lock dependency state
- downloading a WebKit browser build in CI
- changing CI to execute the WebKit gate
- changing protected-branch required checks

Until such approval is given, SRL-EB-07 is complete only as a feasibility gate and exact implementation proposal, not as automated WebKit coverage.
