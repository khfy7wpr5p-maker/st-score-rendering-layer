# Versioning and Compatibility

The repository separates private package SemVer, renderer runtime compatibility and development/test tooling versions.

## Current production values

- workspace root: private `0.0.0`;
- all six workspace packages: private `0.1.0`;
- `SCORE_RENDERER_CONTRACT_VERSION`: `0.2.0`;
- OSMD runtime/vendor dependency: exact `opensheetmusicdisplay` `2.1.2`;
- WebKit development/test dependency: exact `playwright` `1.62.1`;
- published GitHub releases at the 2026-09-01 fresh-read: none;
- Git tags at the 2026-09-01 fresh-read: none.

Package version `0.1.0` and runtime contract `0.2.0` intentionally coexist. Playwright is not part of either runtime compatibility surface.

## Runtime contract

Consumers/runtime assets must check `SCORE_RENDERER_CONTRACT_VERSION` independently from package versions.

`BrowserScoreHost` verifies the expected contract before renderer creation and checks the returned render result again after rendering. A mismatch fails closed rather than being accepted through package-version inference.

## Package compatibility

Current packages remain `private: true`. Their package `.` entrypoints are used inside the workspace/exported runtime assembly, but no npm publication contract is implied.

If packages become publishable in the future:

- breaking package TypeScript API changes require normal SemVer review;
- adapters must document vendor compatibility;
- consumers should depend on immutable reviewed package/runtime revisions rather than moving branches.

## Runtime vendor pinning

Both OSMD adapters depend directly on exact `opensheetmusicdisplay: 2.1.2`.

A vendor-version change can affect SVG structure, layout, graphical object behavior, note interaction and visual digests. It therefore requires adapter/browser/headless regression review and must not be treated as an unreviewed transitive upgrade.

## Development/test tooling pinning

SRL-EB-07 adds exact `playwright: 1.62.1` only as a development/test dependency for the WebKit engine gate.

CI explicitly installs the WebKit browser/system dependencies and runs `npm run test:webkit`. This tooling is not copied into exported browser/Workstation runtime assets, is not a runtime vendor entry and does not expand renderer authority.

A future Playwright/WebKit version change is a test-infrastructure change requiring browser-gate review; it does not by itself change `SCORE_RENDERER_CONTRACT_VERSION`.

Automated WebKit success remains engine evidence, not physical iPhone/Safari acceptance.

## Exported runtime provenance

Runtime manifests record:

- renderer source revision;
- ST runtime contract version;
- ST package versions;
- exact OSMD version/license metadata;
- exported asset byte lengths and SHA-256 digests;
- `runtimeTarget: "browser"` for generic browser export.

The manifest does not include Playwright/WebKit tooling because that tooling is not shipped with the runtime.

SRL-EB-09 regression coverage verifies that two browser-runtime exports created from the same source revision produce byte-identical manifest JSON and equal manifest objects, even when exported to different output directory names. This protects the manifest from destination-path or execution-time nondeterminism under the reviewed inputs.

A production consumer embedding the exported runtime should pin/verify an immutable renderer revision and manifest integrity.

## Contract-version decision for note interaction

The current note hit-test implementation does not require a contract bump because:

- the base `ScoreRenderer` interface is unchanged;
- the `ScoreNoteRef` structure is unchanged;
- the capability union is unchanged;
- legacy hit-test is exposed through concrete browser adapter/browser host/runtime surfaces;
- deterministic mobile ownership widening does not change canonical authority.

Making hit-test a required base-renderer method/capability or changing `ScoreNoteRef` semantics requires a new compatibility decision.

## Additive editor-bridge evidence

SRL-EB-02/03/04 adds presentation-generation evidence without changing the base renderer protocol:

- successful `BrowserScoreHost.renderMusicXml()` results include opaque `renderEpoch` and optional bounded evidence `sourceId`;
- `BrowserScoreHost.hitTestNoteDetailed()` returns current render epoch plus normalized hit/miss evidence;
- interaction-capable exported runtimes add `hitTestNoteDetailed(payload)`;
- legacy `hitTestNote()` behavior and all existing runtime operations remain unchanged.

`SCORE_RENDERER_CONTRACT_VERSION` therefore remains `0.2.0`. These additions are optional/revision-specific extensions, not mandatory members of the base `ScoreRenderer` interface.

A consumer must not infer availability of `hitTestNoteDetailed()` merely from contract `0.2.0`, because historical `0.2.0` runtime artifacts predate the extension. Consumers that require it must feature-detect the method and pin/verify an exact renderer source revision/runtime manifest.

A future change that makes the detailed bridge mandatory across the compatibility family, changes existing hit semantics, changes `ScoreNoteRef`, or expands canonical/edit authority requires a new contract-version review.

## SesliTab handoff compatibility

SRL-EB-08 defines only a consumer diagnostic/integration vocabulary. Codes such as canonical-map miss or panel/tab state failure are not added to the renderer runtime enum and do not change the renderer contract.

The renderer continues to emit only its bounded rendered-hit evidence and five structured MISS reasons. SesliTab/Editor Core owns canonical-resolution and UI-state classifications.

See [EDITOR-BRIDGE.md](EDITOR-BRIDGE.md) and [SESLITAB-DIAGNOSTIC-HANDOFF.md](SESLITAB-DIAGNOSTIC-HANDOFF.md).

## SRL-EB-09 dependency diff

PR-E introduces **no dependency change**:

- runtime dependency remains exact OSMD `2.1.2`;
- existing Playwright `1.62.1` remains test-only from SRL-EB-07;
- no new package, browser, font, editor-core or consumer dependency is added;
- no runtime contract bump is introduced.

## Historical stage identifiers

R0–R8 and SRL-EB stage labels are evidence/program identifiers, not version numbers. They must not substitute for package versions, runtime contract values or immutable renderer source revisions.

See [PUBLIC-API.md](PUBLIC-API.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
