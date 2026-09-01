# Testing Architecture

The repository protects architecture through TypeScript/unit contracts plus real Chromium, Playwright WebKit-engine and headless gates.

## CI entrypoint

Workflow: `.github/workflows/ci.yml`.

Protected `main` requires the strict `foundation` status check.

`foundation` runs:

```text
npm install --ignore-scripts --no-audit --no-fund
npx playwright install --with-deps webkit
npm run check
npm run test:browser
npm run test:webkit
npm run test:headless
```

`npm run check` expands to typecheck + build + root unit tests.

`playwright` is an exact-pinned development/test dependency. CI installs only the WebKit browser engine required by the SRL-EB-07 gate; browser binaries are not runtime/package artifacts.

## Test layers

### Unit / contract tests

Root `tests/*.test.mjs` covers:

- source validation and renderer registry;
- OSMD adapter option/capability/lifecycle behavior;
- BrowserScoreHost lifecycle, replacement and authority boundaries;
- note hit-test/highlight semantics;
- cursor delegation;
- headless adapter contracts;
- accessibility transactions/restoration;
- browser/Workstation runtime export structure and integrity.

### Real Chromium browser tests

`tests/browser/run-osmd-browser-fixture.mjs` launches Chrome/Chromium and executes the committed HTML fixtures.

Current fixtures cover:

- baseline MusicXML→SVG rendering;
- OSMD interaction capabilities;
- chord notehead research evidence;
- exact note hit-test/highlight at 720px and 320px;
- standard notation + guitar TAB and fret labels;
- accessibility against real rendered note elements;
- BrowserScoreHost → adapter → OSMD path;
- exported Workstation runtime asset graph.

### WebKit-engine feasibility / regression

`tests/webkit/run-osmd-webkit-fixture.mjs` launches the pinned Playwright WebKit engine against a loopback-only static server.

It executes:

- `osmd-browser-fixture.html` for baseline MusicXML→SVG evidence;
- `osmd-note-interaction-fixture.html` for exact hit ownership, ambiguity abstention, rerender/stale-evidence behavior and the fixture's 720px/320px mobile-width checks.

The gate requires `data-render-pass="true"` and at least one final SVG. It captures bounded page/console diagnostics on failure.

This test is **not physical Safari acceptance**. WebKit-engine success cannot prove iOS browser chrome, safe areas, real touch delivery, pinch zoom or a consumer shell's lifecycle behavior.

### Headless visual regression

`npm run test:headless` runs controlled Chrome/Chromium rendering and committed semantic/deterministic visual-regression evidence.

The headless adapter also exposes `digestSvgPages()` for deterministic SVG page hashing.

## Contract → code → test matrix

| Contract | Implementation | Protection | Status |
| --- | --- | --- | --- |
| bounded MusicXML-only source | `renderer-core`, contracts | `core.test.mjs` | PROTECTED |
| base renderer lifecycle/capabilities | contracts + adapters | `osmd-adapter.test.mjs`, `headless-adapter.test.mjs` | PROTECTED |
| browser-host contract handshake | `browser-host` | `browser-host.test.mjs`, real browser-host fixture | PROTECTED |
| failed replacement clears stale presentation | `BrowserScoreHost.renderMusicXml` | `browser-host.test.mjs`, runtime fixture | PROTECTED |
| concurrent replacement rejected | `BrowserScoreHost` | `browser-host.test.mjs` | PROTECTED |
| measure cursor | OSMD adapter/browser host/runtime bridge | adapter + browser-host/workstation cursor tests | PROTECTED |
| deterministic `ScoreNoteRef` traversal | OSMD adapter | `note-interaction.test.mjs`, real interaction fixture | PROTECTED |
| exact notehead identity | OSMD adapter | chord research + interaction fixtures | PROTECTED |
| unique graphical-group mobile touch ownership | OSMD adapter | unit + Chromium + WebKit interaction gates; PR #16 real-device acceptance | MULTI-ENGINE PROTECTED |
| ambiguous/shared group abstention | OSMD adapter | unit + Chromium + WebKit interaction gates | MULTI-ENGINE PROTECTED |
| no nearest-note/pitch inference | OSMD adapter | `note-interaction.test.mjs` | PROTECTED |
| highlight is reversible presentation state | OSMD adapter | adapter + interaction tests | PROTECTED |
| replacement render invalidates old presentation evidence | BrowserScoreHost + OSMD adapter | unit + Chromium + WebKit interaction gates | MULTI-ENGINE PROTECTED |
| standard notation + 6-line TAB | OSMD/browser fixture | `osmd-tablature-fixture.html` | PROTECTED |
| string/fret display evidence | OSMD/browser fixture | fret `7`/`12` assertions | PROTECTED |
| headless has no interactive capabilities | headless adapter | `headless-adapter.test.mjs` | PROTECTED |
| accessibility resolves before mutation/rolls back | accessibility bridge | `accessibility.test.mjs` + browser fixture | PROTECTED |
| browser runtime is consumer-neutral | export script | `browser-runtime-export.test.mjs` | PROTECTED |
| runtime asset integrity manifest | export scripts | browser/workstation runtime export tests | PROTECTED |
| no browser-host direct OSMD/network/message transport | browser-host | source-boundary assertion in `browser-host.test.mjs` | PROTECTED |
| generic WebKit baseline + bounded note interaction | browser host + OSMD adapter | `test:webkit` | WEBKIT ENGINE PROTECTED |
| physical Safari orientation/zoom/safe-area/consumer-shell behavior | host/device-specific | physical target-device acceptance | NOT REPOSITORY-CI PROVEN |
| consumer canonical mapping of `ScoreNoteRef` | consumer-owned | not in this repository | OUT OF SCOPE |
| playback with incomplete OMR | consumer/playback-owned | not in this repository | OUT OF SCOPE |
| OMR/correction correctness | external producer | not in this repository | OUT OF SCOPE |

## Mobile evidence interpretation

The interaction fixture at width `320px` is now exercised in both Chromium and the pinned Playwright WebKit engine. This is stronger browser-engine evidence than Chromium alone, but it must not be relabeled as a physical iPhone/Safari acceptance test.

PR #16 records real iPhone/Safari acceptance that motivated widening note ownership. Physical-device acceptance remains necessary for iOS browser chrome, touch/gesture policy, safe-area and consumer-shell lifecycle behavior.

## Determinism and visual evidence

Visual digests are review gates, not self-updating truth. A changed SVG digest must be understood before a baseline is updated.

Headless/browser semantic assertions should run before treating a visual hash as meaningful; a deterministic wrong/empty render is not acceptable evidence.

## Test configuration reality

There is no Jest/Vitest configuration. Unit tests use Node's built-in `node:test` runner on built JavaScript.

TypeScript build configuration is project-reference based under the six workspace packages with shared strict compiler settings from `tsconfig.base.json`.

Playwright is used only for the WebKit engine gate, not as the repository's unit-test framework and not as application/runtime code.

## Lockfile behavior

The repository tree contains no committed root lockfile. CI runs `npm install`, which may generate `package-lock.json`, and the workflow uploads that file as a short-lived artifact for review when present.

The exact Playwright version is pinned in `package.json`; the generated CI lockfile remains review evidence rather than a committed repository entrypoint under the current repository policy.

## Documentation validation

For architecture changes, review should confirm:

1. Markdown links resolve to committed paths;
2. package/API names match source exports;
3. Mermaid nodes use real component names;
4. claims of support have code/test evidence;
5. unsupported/out-of-scope systems are not silently represented as renderer components;
6. `npm run check`, `npm run test:browser`, `npm run test:webkit` and `npm run test:headless` remain green.
