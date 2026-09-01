# Public API and Entrypoints

All workspace packages are currently `private: true`. “Public” here means exported from a package entrypoint or exported runtime surface, not published to a public npm registry.

Runtime compatibility is governed separately by `SCORE_RENDERER_CONTRACT_VERSION`, currently `0.2.0`.

## Package entrypoints

Each workspace package exposes only its `.` entrypoint (`dist/index.js` plus declarations). Deep imports are not part of the reviewed API.

## `@st/score-renderer-contracts`

Implementation: `packages/contracts/src/index.ts`.

| Export | Kind | Purpose |
| --- | --- | --- |
| `SCORE_RENDERER_CONTRACT_VERSION` | constant | runtime compatibility handshake |
| `ScoreSource` | type | MusicXML input source |
| `ScoreRenderOptions` | type | page/title/composer/auto-resize options |
| `ScoreRenderResult` | type | renderer id + contract version |
| `ScoreNoteRef` | type | deterministic rendered-note locator |
| `ScoreMeasureRef` | type | part + measure locator |
| `ScorePartRef` | type | part locator |
| `ScoreHighlight` | type | note target + optional class |
| `ScoreRendererCapability` | type | capability union |
| `ScoreRenderer` | interface | common renderer lifecycle API |

`ScoreSource` currently supports only `{ kind: "musicxml", content: string, sourceId?: string }`.

`ScoreRenderer` methods are `load`, `render`, `exportSvg`, `highlight`, `clearHighlights`, `moveCursor`, `setPartVisible`, and `dispose`. Note hit-testing is not a required base-interface method.

## `@st/score-renderer-core`

Implementation: `packages/renderer-core/src/index.ts`.

Exports:

- `DEFAULT_MAX_MUSICXML_BYTES`;
- `InvalidScoreSourceError`;
- `UnsupportedRendererCapabilityError`;
- `validateScoreSource`;
- `RendererRegistry`.

`validateScoreSource()` is a source/resource guard, not a full MusicXML semantic validator.

## `@st/score-renderer-osmd`

Implementation: `packages/adapter-osmd/src/index.ts`.

Primary exports include `OsmdRenderer`, `OsmdEngine`, `OsmdFactory` and `OsmdClientPoint`.

`OsmdRenderer` advertises:

```text
musicxml-render
svg-export
cursor
note-highlight
part-visibility
tablature
```

Concrete adapter extensions:

```ts
resolveRenderedNoteElement(target: ScoreNoteRef): Element
resolveNoteAtClientPoint(point: OsmdClientPoint): ScoreNoteRef | null
```

These are not mandatory `ScoreRenderer` methods. `resolveRenderedNoteElement()` returns only a DOM `Element`, never an OSMD model object.

## `@st/score-renderer-osmd-headless`

Implementation: `packages/adapter-osmd-headless/src/index.ts`.

Exports include:

- `OsmdHeadlessRenderRequest`;
- `OsmdHeadlessHost`;
- `OsmdHeadlessRendererOptions`;
- `renderWithChrome`;
- `digestSvgPages`;
- `OsmdHeadlessRenderer`.

Capabilities: `musicxml-render`, `svg-export`, `tablature`, `headless`. Interactive methods fail explicitly and corresponding interactive capabilities are not advertised.

## `@st/score-renderer-browser-host`

Implementation: `packages/browser-host/src/index.ts`.

Exports:

- `BrowserRendererFactory`;
- `BrowserNoteHitPoint`;
- `BrowserScoreHostOptions`;
- `ScoreRendererContractVersionMismatchError`;
- `BrowserScoreHostUnavailableError`;
- `BrowserScoreHost`.

`BrowserScoreHost` methods:

```ts
renderMusicXml(content, options?, sourceId?)
exportSvg()
moveCursor(target)
hitTestNote(point)
highlight(highlight)
clearHighlights()
dispose()
```

No method exposes an OSMD object, canonical score model, playback controller, filesystem/network loader or editor mutation API.

## `@st/score-renderer-accessibility`

Implementation: `packages/accessibility/src/index.ts`.

Exports include:

- `DEFAULT_MAX_ACCESSIBLE_TARGETS`;
- `DEFAULT_MAX_ACCESSIBILITY_LABEL_LENGTH`;
- `ScoreAccessibilityEntry`;
- `RenderedTargetResolver`;
- `ScoreAccessibilityBridgeOptions`;
- `ScoreAccessibilityBridge`.

Bridge methods: `apply`, `focus`, `focusNext`, `focusPrevious`, `clear`, `dispose`.

Semantic labels are consumer-provided; the package does not infer musical meaning from SVG/MusicXML.

## Exported runtime API

### Generic browser runtime

Built by `scripts/export-browser-runtime.mjs` and exposed through:

```js
globalThis.__ST_SCORE_RENDER_HOST__
```

Current methods:

```js
renderMusicXml(payload)
exportSvg()
moveCursor(payload)
hitTestNote(payload)
highlight(payload)
clearHighlights()
dispose()
```

It dispatches `st-score-render-host-ready` with the renderer contract version.

### Workstation runtime

The Workstation export uses the same render host and adds the reviewed Workstation/JUCE bridge. That native bridge is Workstation-specific and is removed from the generic browser runtime.

## Runtime manifest

Exported runtime manifests contain renderer source revision, renderer contract version, ST package versions, OSMD version/license metadata, asset byte lengths/SHA-256 digests, and `runtimeTarget: "browser"` for the generic browser export.

Consumers embedding runtime assets should verify immutable provenance/integrity.

## Public vs internal/vendor surface

| Surface | Classification |
| --- | --- |
| ST package `.` exports | PUBLIC WITHIN PRIVATE WORKSPACE/DISTRIBUTION |
| `SCORE_RENDERER_CONTRACT_VERSION` | PUBLIC RUNTIME CONTRACT |
| `BrowserScoreHost` | PUBLIC CONSUMER-FACING BROWSER BOUNDARY |
| `__ST_SCORE_RENDER_HOST__` | PUBLIC EXPORTED-RUNTIME BOUNDARY |
| `OsmdRenderer.resolveNoteAtClientPoint` | ADAPTER-SPECIFIC EXTENSION |
| `OsmdRenderer.resolveRenderedNoteElement` | ADAPTER-SPECIFIC RENDERED-TARGET EXTENSION |
| OSMD `graphic`, `Sheet`, graphical objects | INTERNAL VENDOR DETAIL |
| non-exported generated/runtime internals | INTERNAL |

## Versioning

Private package version `0.1.0` and runtime contract `0.2.0` intentionally coexist. Runtime compatibility must not be inferred from package SemVer alone.

See [VERSIONING.md](VERSIONING.md).
