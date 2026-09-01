# Public API and Entrypoints

All workspace packages are currently `private: true`. “Public” here means exported from a package entrypoint or exported runtime surface, not published to a public npm registry.

Runtime compatibility is governed separately by `SCORE_RENDERER_CONTRACT_VERSION`, currently `0.2.0`.

## Package entrypoints

Each workspace package exposes only its `.` entrypoint (`dist/index.js` plus declarations). Deep imports are not part of the reviewed API.

## `@st/score-renderer-contracts`

Implementation: `packages/contracts/src/index.ts`.

Primary exports are `SCORE_RENDERER_CONTRACT_VERSION`, `ScoreSource`, `ScoreRenderOptions`, `ScoreRenderResult`, `ScoreNoteRef`, `ScoreMeasureRef`, `ScorePartRef`, `ScoreHighlight`, `ScoreRendererCapability` and `ScoreRenderer`.

`ScoreSource` currently supports only `{ kind: "musicxml", content: string, sourceId?: string }`.

`ScoreRenderer` methods are `load`, `render`, `exportSvg`, `highlight`, `clearHighlights`, `moveCursor`, `setPartVisible`, and `dispose`. Note hit-testing is not a required base-interface method.

## `@st/score-renderer-core`

Implementation: `packages/renderer-core/src/index.ts`.

Exports include `DEFAULT_MAX_MUSICXML_BYTES`, `InvalidScoreSourceError`, `UnsupportedRendererCapabilityError`, `validateScoreSource` and `RendererRegistry`.

`validateScoreSource()` is a source/resource guard, not a full MusicXML semantic validator.

## `@st/score-renderer-osmd`

Implementation: `packages/adapter-osmd/src/index.ts`.

Primary exports include `OsmdRenderer`, `OsmdEngine`, `OsmdFactory`, `OsmdClientPoint`, `OsmdNoteHitMissReason` and `OsmdNoteHitDetailedResult`.

`OsmdRenderer` advertises:

```text
musicxml-render
svg-export
cursor
note-highlight
part-visibility
tablature
```

Concrete adapter extensions include:

```ts
resolveRenderedNoteElement(target: ScoreNoteRef): Element
resolveNoteAtClientPoint(point: OsmdClientPoint): ScoreNoteRef | null
resolveNoteAtClientPointDetailed(point: OsmdClientPoint): OsmdNoteHitDetailedResult
```

These are not mandatory `ScoreRenderer` methods. Detailed hit results are bounded HIT/MISS data. `resolveRenderedNoteElement()` is an internal-facing rendered-target extension and returns only a DOM `Element`, never an OSMD model object.

## `@st/score-renderer-osmd-headless`

Implementation: `packages/adapter-osmd-headless/src/index.ts`.

Exports include `OsmdHeadlessRenderRequest`, `OsmdHeadlessHost`, `OsmdHeadlessRendererOptions`, `renderWithChrome`, `digestSvgPages` and `OsmdHeadlessRenderer`.

Capabilities: `musicxml-render`, `svg-export`, `tablature`, `headless`. Interactive methods fail explicitly and corresponding interactive capabilities are not advertised.

## `@st/score-renderer-browser-host`

Implementation: `packages/browser-host/src/index.ts`.

Exports include:

- `BrowserRendererFactory`;
- `BrowserNoteHitPoint`;
- `BrowserNoteHitMissReason`;
- `BrowserRenderEpoch`;
- `BrowserRenderResult`;
- `BrowserRenderedHitEvidence`;
- `BrowserRenderedHitMiss`;
- `BrowserNoteHitDetailedResult`;
- `BrowserScoreHostOptions`;
- `ScoreRendererContractVersionMismatchError`;
- `BrowserScoreHostUnavailableError`;
- `BrowserScoreHost`.

`BrowserScoreHost` methods include:

```ts
renderMusicXml(content, options?, sourceId?)
exportSvg()
moveCursor(target)
hitTestNote(point)
hitTestNoteDetailed(point)
highlight(highlight)
clearHighlights()
dispose()
```

A successful `renderMusicXml()` returns `BrowserRenderResult`, which extends the renderer result with opaque `renderEpoch` and optional bounded `sourceId` evidence.

`hitTestNoteDetailed()` returns current-render HIT/MISS evidence. It does not expose DOM/OSMD objects and does not resolve canonical score identity.

No browser-host method exposes a canonical score model, playback controller, filesystem/network loader or editor mutation API.

## `@st/score-renderer-accessibility`

Implementation: `packages/accessibility/src/index.ts`.

Exports include `DEFAULT_MAX_ACCESSIBLE_TARGETS`, `DEFAULT_MAX_ACCESSIBILITY_LABEL_LENGTH`, `ScoreAccessibilityEntry`, `RenderedTargetResolver`, `ScoreAccessibilityBridgeOptions` and `ScoreAccessibilityBridge`.

Bridge methods are `apply`, `focus`, `focusNext`, `focusPrevious`, `clear`, `dispose`. Semantic labels are consumer-provided; the package does not infer musical meaning from SVG/MusicXML.

## Exported runtime API

### Generic browser runtime

Built by `scripts/export-browser-runtime.mjs` and exposed through:

```js
globalThis.__ST_SCORE_RENDER_HOST__
```

Current interaction-capable methods are:

```js
renderMusicXml(payload)
exportSvg()
moveCursor(payload)
hitTestNote(payload)
hitTestNoteDetailed(payload)
highlight(payload)
clearHighlights()
dispose()
```

`renderMusicXml(payload)` returns the host result including `renderEpoch` and optional bounded `sourceId`. `hitTestNoteDetailed(payload)` accepts only an exact plain `{ clientX, clientY }` payload with finite numbers and returns normalized epoch-bound HIT/MISS data.

The runtime dispatches `st-score-render-host-ready` with the renderer contract version.

### Workstation runtime

The Workstation export uses the same render host and adds the reviewed Workstation/JUCE bridge. That native bridge is Workstation-specific and is removed from the generic browser runtime.

## Runtime manifest and provenance

Exported runtime manifests contain:

- renderer source revision;
- renderer contract version;
- ST package versions;
- exact OSMD version/license metadata;
- asset byte lengths and SHA-256 digests;
- `runtimeTarget: "browser"` for the generic browser export.

Consumers embedding runtime assets should verify immutable provenance/integrity.

The exact-pinned `playwright: 1.62.1` dependency is development/test tooling for the WebKit gate. It is not copied into the browser/Workstation runtime asset graph and is not listed as a runtime vendor in the manifest.

## Public vs internal/vendor surface

| Surface | Classification |
| --- | --- |
| ST package `.` exports | PUBLIC WITHIN PRIVATE WORKSPACE/DISTRIBUTION |
| `SCORE_RENDERER_CONTRACT_VERSION` | PUBLIC RUNTIME CONTRACT |
| `BrowserScoreHost` | PUBLIC CONSUMER-FACING BROWSER BOUNDARY |
| `BrowserRenderResult` / detailed hit evidence types | ADDITIVE REVISION-SPECIFIC BROWSER-HOST EXTENSION |
| `__ST_SCORE_RENDER_HOST__` | PUBLIC EXPORTED-RUNTIME BOUNDARY |
| `hitTestNoteDetailed` runtime method | ADDITIVE REVISION-SPECIFIC RUNTIME EXTENSION |
| `OsmdRenderer.resolveNoteAtClientPoint*` | ADAPTER-SPECIFIC EXTENSION |
| `OsmdRenderer.resolveRenderedNoteElement` | RENDERED-TARGET EXTENSION; NOT CANONICAL IDENTITY |
| OSMD `graphic`, `Sheet`, graphical objects | INTERNAL VENDOR DETAIL |
| non-exported generated/runtime internals | INTERNAL |

## Consumer/editor boundary

Renderer HIT evidence is not an edit target. SesliTab/Editor Core must resolve a current-render `ScoreNoteRef` through its current canonical mapping before selecting or editing. Renderer MISS, stale epoch, canonical-map MISS and consumer UI failure are separate states.

See [SESLITAB-DIAGNOSTIC-HANDOFF.md](SESLITAB-DIAGNOSTIC-HANDOFF.md) and [EDITOR-BRIDGE.md](EDITOR-BRIDGE.md).

## Versioning

Private package version `0.1.0` and runtime contract `0.2.0` intentionally coexist. The detailed hit/render-epoch APIs are additive revision-specific extensions; consumers requiring them must feature-detect and pin/verify an exact renderer revision/runtime manifest rather than inferring availability from `0.2.0` alone.

See [VERSIONING.md](VERSIONING.md).
