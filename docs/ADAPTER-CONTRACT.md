# Adapter Contract

All renderer adapters implement the ST-owned `ScoreRenderer` interface from `@st/score-renderer-contracts`.

## Base lifecycle

```text
construct with environment-owned target/resources
→ load(ScoreSource)
→ render(ScoreRenderOptions)
→ optional capability operations
→ dispose()
```

Base rules:

1. `load()` validates the ST source contract before vendor processing.
2. `render()` before successful `load()` fails.
3. An adapter advertises only capabilities backed by implementation and repository evidence.
4. Unsupported required interface methods fail explicitly; absence must not be silently simulated.
5. `dispose()` releases adapter-owned state/resources and, for browser presentation adapters, clears the owned target.
6. A renderer does not initiate a network load on behalf of `ScoreSource`.
7. Vendor model objects are not part of the ST consumer contract.

## Browser OSMD adapter

Implementation: `packages/adapter-osmd/src/index.ts`.

Vendor: exact `opensheetmusicdisplay` `2.1.2`.

Advertised capabilities:

```text
musicxml-render
svg-export
cursor
note-highlight
part-visibility
tablature
```

Production behavior:

- creates OSMD with SVG backend;
- maps ST render options to OSMD;
- delegates MusicXML parsing/layout/drawing to OSMD;
- serializes SVG DOM for export;
- derives deterministic `ScoreNoteRef` locators from graphical traversal;
- rebuilds a bounded DOM hit-test ownership index after render changes;
- applies reversible renderer-owned highlight DOM state;
- delegates measure cursor and part visibility through OSMD primitives.

Adapter-specific methods:

```ts
resolveRenderedNoteElement(ScoreNoteRef): Element
resolveNoteAtClientPoint({ clientX, clientY }): ScoreNoteRef | null
```

These are concrete-adapter extensions, not required methods of the base `ScoreRenderer` interface in contract `0.2.0`.

`resolveRenderedNoteElement()` deliberately returns only a DOM `Element`, not an OSMD object.

## Headless OSMD adapter

Implementation: `packages/adapter-osmd-headless/src/index.ts`.

Advertised capabilities:

```text
musicxml-render
svg-export
tablature
headless
```

It does **not** advertise cursor, highlight or part visibility.

The default headless host:

- validates the same MusicXML source contract;
- locates a local Chrome/Chromium executable;
- writes a restricted temporary local fixture;
- loads the exact local OSMD bundle;
- disables page connections through CSP;
- bounds timeout/output;
- keeps browser sandboxing on unless explicitly opted out;
- deletes temporary state in `finally`;
- returns SVG pages only.

CI may explicitly use `--no-sandbox` for runner constraints; this is not the package default.

## Capability policy

A capability is an ST guarantee only after the corresponding implementation plus test/runtime evidence exists.

Current evidence:

| Capability | Browser OSMD | Headless OSMD | Primary evidence |
| --- | ---: | ---: | --- |
| `musicxml-render` | yes | yes | unit + real browser/headless gates |
| `svg-export` | yes | yes | unit + runtime gates |
| `cursor` | yes | no | adapter/host/runtime cursor tests |
| `note-highlight` | yes | no | adapter + interaction fixtures |
| `part-visibility` | yes | no | adapter tests |
| `tablature` | yes | yes | real guitar TAB browser/headless evidence |
| `headless` | no | yes | headless gate |

Accessibility is intentionally not a `ScoreRendererCapability`; it is a separate ST-owned semantic/presentation bridge.

Note hit-testing is currently exposed through the browser adapter/browser host but is not a member of the base capability union. A future change making hit-test a mandatory cross-adapter capability requires a separate contract-version decision.

## Source boundary

Adapters currently accept only `ScoreSource.kind === "musicxml"` with in-memory text. PDF, image, MXL, ScoreGraph, JSON and URL sources are not adapter inputs.

## Error policy

Adapters fail explicitly when lifecycle preconditions or requested capabilities cannot be satisfied. The browser host adds a stronger replacement rule: a failed replacement clears stale presentation state.

See [DEGRADED-MODES.md](DEGRADED-MODES.md).
