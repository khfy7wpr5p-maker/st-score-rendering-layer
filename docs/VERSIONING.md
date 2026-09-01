# Versioning and Compatibility

The repository separates private package SemVer from the renderer runtime contract.

## Current production values

- workspace root: private `0.0.0`;
- all six workspace packages: private `0.1.0`;
- `SCORE_RENDERER_CONTRACT_VERSION`: `0.2.0`;
- OSMD adapter vendor dependency: exact `opensheetmusicdisplay` `2.1.2`;
- published GitHub releases at the 2026-09-01 fresh-read: none;
- Git tags at the 2026-09-01 fresh-read: none.

Package version `0.1.0` and runtime contract `0.2.0` intentionally coexist.

## Runtime contract

Consumers/runtime assets must check `SCORE_RENDERER_CONTRACT_VERSION` independently from package versions.

`BrowserScoreHost` verifies the expected contract before renderer creation and checks the returned render result again after rendering.

A mismatch fails closed rather than being accepted through package-version inference.

## Package compatibility

Current packages remain `private: true`. Their package `.` entrypoints are used inside the workspace/exported runtime assembly, but no npm publication contract is implied.

If packages become publishable in the future:

- breaking package TypeScript API changes require normal SemVer review;
- adapters must document their vendor compatibility;
- consumers should depend on immutable reviewed package/runtime revisions rather than moving branches.

## Renderer vendor pinning

Both OSMD adapters depend directly on exact `opensheetmusicdisplay: 2.1.2`.

A vendor-version change can affect SVG structure, layout, graphical object behavior, note interaction and visual digests. It therefore requires adapter/browser/headless regression review; it must not be treated as an unreviewed transitive upgrade.

## Exported runtime provenance

Runtime manifests record:

- renderer source revision;
- ST runtime contract version;
- ST package versions;
- exact OSMD version/license metadata;
- exported asset byte lengths and SHA-256 digests.

A production consumer embedding the exported runtime should pin/verify an immutable renderer revision and manifest integrity.

## Contract-version decision for note interaction

The current note hit-test implementation does not require a contract bump because:

- the base `ScoreRenderer` interface is unchanged;
- the `ScoreNoteRef` structure is unchanged;
- the capability union is unchanged;
- hit-test is exposed through the concrete browser adapter/browser host/runtime surface;
- PR #16 only widened deterministic DOM ownership inside the existing hit-test behavior.

Making hit-test a required base-renderer method/capability or changing `ScoreNoteRef` semantics would require a new compatibility decision.

## Historical stage identifiers

R0–R8 labels remain useful to understand when evidence was introduced, but they are not version numbers and must not substitute for current package/runtime contract values.

See [PUBLIC-API.md](PUBLIC-API.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
