# SES-38 Deterministic Measure Hit-Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, epoch-bound renderer presentation API that resolves a fresh browser client point to `{ partId, measureIndex }` for the exact current graphical measure region, including measure whitespace, without proximity guessing.

**Architecture:** Extend the existing OSMD browser adapter with a renderer-owned graphical-measure geometry index built from current `GraphicalMeasure.PositionAndShape`. Project live client coordinates through the current owned SVG page into OSMD units, resolve zero/one/many unique measure owners fail-closed, then expose the normalized result through `BrowserScoreHost` and the generated generic runtime with current `renderEpoch`/`sourceId` evidence.

**Tech Stack:** TypeScript 6.0.3, Node.js >=20.19, Node `node:test`, OpenSheetMusicDisplay 2.1.2, generated browser/Workstation runtime scripts, Chromium fixture gate, Playwright 1.62.1 WebKit gate.

**Spec:** `docs/superpowers/specs/2026-09-27-ses-38-deterministic-measure-hit-test-design.md`

## Global Constraints

- Baseline main for this plan: `c6841ed51ea775534b0b199935267eeafa46a123`.
- Keep `SCORE_RENDERER_CONTRACT_VERSION` at `0.2.0`.
- Do not add a required method to the base `ScoreRenderer` interface.
- Do not modify `packages/contracts/src/index.ts` unless implementation proves the spec impossible; stop for a new compatibility decision instead.
- Use OSMD `GraphicalMeasure.PositionAndShape` border rectangles only: no margin inflation, hit radius, nearest-note, nearest-measure, pitch, duration, or distance inference.
- Preserve current NOTE/REST hit-test semantics.
- Preserve renderer presentation-only authority.
- Do not add pointer/touch listeners inside the renderer.
- Do not mutate Student App, OMR, editor, playback, Render service/domain/deployment, or consumer canonical state.
- Generic runtime changes must originate from canonical runtime generation source; do not hand-edit generated runtime output.
- Every implementation task follows TDD RED → GREEN and ends with a focused commit.
- Chromium and pinned WebKit are repository engine evidence only; do not relabel them as physical iPhone/Safari acceptance.

## Review Focus

- **SVG transform unavailable or non-invertible:** measure hit-test must return `MEASURE_GEOMETRY_UNAVAILABLE`/fail closed and never invent a target. Add this to Task 1 unit coverage.
- **A point lies inside two physical staff regions that map to the same `partId + measureIndex`:** deduplicate to one HIT, not ambiguity. Add this to Task 1 unit coverage.
- **A point lies inside overlapping regions for different part/measure targets:** return `AMBIGUOUS_OWNERSHIP` with no tie-breaker. Add this to Task 1 unit coverage.
- **Scrolling or responsive layout occurs after render:** hit resolution must use the live SVG transform at call time and continue to resolve with fresh client coordinates. Add this to Task 4 real-browser coverage.
- **Replacement render/failure/dispose changes presentation generation:** old geometry/evidence must not survive; new host result must carry the current epoch only. Add this to Tasks 1 and 2.

---

### Task 1: OSMD adapter measure geometry index and deterministic resolution

**Files:**
- Modify: `packages/adapter-osmd/src/index.ts`
- Modify/Test: `tests/note-interaction.test.mjs`

**Interfaces:**
- Consumes: current `OsmdRenderer` render lifecycle, `OsmdClientPoint`, `Sheet.Instruments`, `graphic.measureList`, renderer-owned container/document.
- Produces:
  - `OsmdMeasureHitTargetRef = Readonly<{ partId: string; measureIndex: number }>`
  - `OsmdMeasureHitMissReason`
  - `OsmdMeasureHitDetailedResult`
  - `OsmdRenderer.resolveMeasureAtClientPointDetailed(point: OsmdClientPoint): OsmdMeasureHitDetailedResult`

- [ ] **Step 1: Extend the unit-test harness with graphical measure geometry and owned SVG page stubs**

Add deterministic stubs sufficient to model:

```js
PositionAndShape: {
  AbsolutePosition: { x, y },
  BorderLeft,
  BorderRight,
  BorderTop,
  BorderBottom,
}
ParentMusicSystem: {
  Parent: { PageNumber: 1 }
}
```

The harness must also provide a renderer-owned SVG page whose live client→SVG conversion can be controlled by the test. Keep existing note/rest tests unchanged.

- [ ] **Step 2: Write failing adapter tests for exact measure ownership**

Add focused tests named for these behaviors:

```text
measure hit-test resolves note, rest and true measure whitespace to the containing measure
measure hit-test returns NO_MEASURE_OWNER outside graphical measure borders
measure hit-test deduplicates same-target multi-staff overlap
measure hit-test fails closed on different-target overlap
measure hit-test rejects non-finite coordinates
measure hit-test fails closed when SVG projection or measure geometry is unavailable
rerender rebuilds measure ownership and drops stale geometry
```

Core assertions:

```js
assert.deepEqual(result, {
  kind: "HIT",
  target: { partId: "P1", measureIndex: 0 },
});

assert.deepEqual(result, {
  kind: "MISS",
  reason: "AMBIGUOUS_OWNERSHIP",
});
```

Also assert that existing `resolveNoteAtClientPointDetailed()` behavior is unchanged for the same harness points.

- [ ] **Step 3: Run the focused tests to verify RED**

Run:

```bash
npm run build
node --test --test-name-pattern="measure hit-test" tests/note-interaction.test.mjs
```

Expected: FAIL because `resolveMeasureAtClientPointDetailed` and its geometry index do not exist.

- [ ] **Step 4: Add the adapter result types and bounded internal geometry record**

In `packages/adapter-osmd/src/index.ts`, add the exact public extension types from the spec:

```ts
export type OsmdMeasureHitTargetRef = Readonly<{
  partId: string;
  measureIndex: number;
}>;

export type OsmdMeasureHitMissReason =
  | "NO_ELEMENT_AT_POINT"
  | "OUTSIDE_RENDER_CONTAINER"
  | "UNMAPPED_ELEMENT"
  | "NO_MEASURE_OWNER"
  | "AMBIGUOUS_OWNERSHIP"
  | "MEASURE_GEOMETRY_UNAVAILABLE";

export type OsmdMeasureHitDetailedResult =
  | Readonly<{ kind: "HIT"; target: OsmdMeasureHitTargetRef }>
  | Readonly<{ kind: "MISS"; reason: OsmdMeasureHitMissReason }>;
```

Use one private bounded region record containing only page identity, finite border coordinates, and the frozen target. Do not store DOM objects as canonical target identity.

- [ ] **Step 5: Implement measure-index lifecycle**

Add a private measure-region index and reset/rebuild it on the same lifecycle boundaries that already clear/rebuild note ownership:

- before/replacement render rebuild;
- successful render;
- `setPartVisible()` updateGraphic/render;
- load/reset preparation;
- render failure;
- dispose.

During rebuild:

```text
visible Sheet.Instruments
→ sorted instrument staff IDs
→ graphic.measureList[measureIndex][staffId]
→ validate GraphicalMeasure PositionAndShape + ParentMusicSystem.Parent.PageNumber
→ { pageNumber, left, right, top, bottom, target }
```

Requirements:

- require finite coordinates;
- require `right > left`, `bottom > top`;
- require non-negative safe `measureIndex`;
- require bounded non-empty `partId`;
- enforce a finite maximum number of indexed graphical measure regions using a named constant;
- if index trust is lost, mark measure geometry unavailable for this render instead of breaking note/rest interaction.

- [ ] **Step 6: Implement live client→OSMD projection**

Implement one private projection helper used only by measure hit-test:

```ts
#projectClientPointToOsmd(
  pageNumber: number,
  point: OsmdClientPoint,
): Readonly<{ x: number; y: number }> | undefined
```

Required behavior:

- select only the current renderer-owned SVG for that indexed page;
- use live SVG screen-coordinate conversion/inverse transform;
- reject absent, non-invertible, or non-finite transforms;
- convert SVG user units to OSMD units using `10` SVG units per OSMD unit for OSMD 2.1.2;
- do not manually apply scroll offsets, `devicePixelRatio`, cached CSS rectangles, or guessed zoom.

- [ ] **Step 7: Implement `resolveMeasureAtClientPointDetailed()`**

Signature:

```ts
resolveMeasureAtClientPointDetailed(
  point: OsmdClientPoint,
): OsmdMeasureHitDetailedResult
```

Algorithm fixed by the spec:

1. require active rendered state;
2. reject non-finite coordinates;
3. `elementFromPoint` null → `NO_ELEMENT_AT_POINT`;
4. top element outside renderer container → `OUTSIDE_RENDER_CONTAINER`;
5. establish the current renderer-owned SVG page containing the top element; none → `UNMAPPED_ELEMENT`;
6. unavailable/untrusted geometry or projection → `MEASURE_GEOMETRY_UNAVAILABLE`;
7. collect exact containing regions on that page;
8. deduplicate equal `partId + measureIndex`;
9. zero → `NO_MEASURE_OWNER`;
10. one → HIT;
11. more than one different target → `AMBIGUOUS_OWNERSHIP`.

No z-order or nearest-region tie breaker.

- [ ] **Step 8: Run focused and regression adapter tests**

Run:

```bash
npm run build
node --test tests/note-interaction.test.mjs
node --test tests/rendered-event-targeting.test.mjs
node --test tests/osmd-adapter.test.mjs
```

Expected: PASS, including all existing NOTE/REST interaction tests.

- [ ] **Step 9: Commit Task 1**

```bash
git add packages/adapter-osmd/src/index.ts tests/note-interaction.test.mjs
git commit -m "feat: add deterministic measure hit-test geometry"
```

---

### Task 2: BrowserScoreHost epoch-bound measure-hit evidence

**Files:**
- Modify: `packages/browser-host/src/index.ts`
- Modify/Test: `tests/browser-host-interaction.test.mjs`
- Modify/Test if needed for epoch replacement coverage: `tests/browser-host-render-epoch.test.mjs`

**Interfaces:**
- Consumes: `OsmdRenderer.resolveMeasureAtClientPointDetailed(point)` from Task 1.
- Produces:
  - `BrowserMeasureHitTargetRef`
  - `BrowserMeasureHitMissReason`
  - `BrowserMeasureHitDetailedResult`
  - `BrowserScoreHost.hitTestMeasureDetailed(point: BrowserNoteHitPoint): BrowserMeasureHitDetailedResult`

- [ ] **Step 1: Write failing host tests**

Add tests proving:

```text
hitTestMeasureDetailed normalizes a valid HIT and adds active renderEpoch/sourceId
hitTestMeasureDetailed normalizes every supported MISS reason
hitTestMeasureDetailed rejects malformed renderer payloads and extra fields
hitTestMeasureDetailed rejects malformed target partId/measureIndex
hitTestMeasureDetailed is unavailable before render, during render and after reset/dispose
replacement render advances epoch and old measure evidence is stale
```

Representative assertion:

```js
assert.deepEqual(host.hitTestMeasureDetailed({ clientX: 10, clientY: 20 }), {
  kind: "HIT",
  renderEpoch: firstRender.renderEpoch,
  sourceId: "score-A",
  target: { partId: "P1", measureIndex: 3 },
});
```

- [ ] **Step 2: Run host tests to verify RED**

Run:

```bash
npm run build
node --test tests/browser-host-interaction.test.mjs tests/browser-host-render-epoch.test.mjs
```

Expected: FAIL because host measure-hit types/method do not exist.

- [ ] **Step 3: Add strict host-side types and normalization**

Add the exact measure target and MISS reason union matching Task 1.

Add a renderer feature-detection interface:

```ts
type BrowserDetailedMeasureHitTestRenderer = ScoreRenderer & Readonly<{
  resolveMeasureAtClientPointDetailed(point: BrowserNoteHitPoint): unknown;
}>;
```

Add strict normalization with the same policies already used for detailed NOTE/REST evidence:

- plain object only;
- exact allowed keys;
- known `kind`;
- known MISS reason;
- bounded trimmed `partId`;
- non-negative safe `measureIndex`;
- freeze normalized output.

- [ ] **Step 4: Implement `BrowserScoreHost.hitTestMeasureDetailed()`**

Signature:

```ts
hitTestMeasureDetailed(
  point: BrowserNoteHitPoint,
): BrowserMeasureHitDetailedResult
```

Requirements:

- reuse `requireFinitePoint`;
- require active renderer;
- feature-detect adapter method;
- require active `renderEpoch`;
- normalize untrusted adapter result;
- attach current `renderEpoch`;
- attach bounded current `sourceId` when present;
- never expose page/geometry/OSMD/DOM data.

- [ ] **Step 5: Run host tests and adjacent interaction regression**

Run:

```bash
npm run build
node --test tests/browser-host-interaction.test.mjs tests/browser-host-render-epoch.test.mjs tests/rendered-event-targeting.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add packages/browser-host/src/index.ts tests/browser-host-interaction.test.mjs tests/browser-host-render-epoch.test.mjs
git commit -m "feat: expose epoch-bound measure hit evidence"
```

---

### Task 3: Generic runtime bridge and export integrity

**Files:**
- Modify: `scripts/export-workstation-runtime-with-cursor.mjs`
- Modify/Test: `tests/workstation-runtime-export.test.mjs`
- Modify/Test: `tests/browser-runtime-export.test.mjs`
- Modify fixture if the current runtime fixture owns interaction calls: `tests/browser/workstation-runtime-export-fixture.html`

**Interfaces:**
- Consumes: `BrowserScoreHost.hitTestMeasureDetailed({ clientX, clientY })` from Task 2.
- Produces:
  - `globalThis.__ST_SCORE_RENDER_HOST__.hitTestMeasureDetailed(payload)` in generated Workstation/browser runtime.

- [ ] **Step 1: Write failing runtime export tests**

Assert generated bootstrap:

- contains exactly one `hitTestMeasureDetailed(payload)` method;
- accepts only plain `{ clientX, clientY }`;
- rejects extra fields/non-finite coordinates;
- forwards only normalized numeric coordinates to `activeHost.hitTestMeasureDetailed`;
- fails closed during render or before active host;
- does not introduce OSMD internals, `graphic.measureList`, filesystem, network, native bridge authority, or Student App logic;
- manifest hashes/bytes are refreshed after generation.

- [ ] **Step 2: Run export tests to verify RED**

Run:

```bash
npm run build
node --test tests/workstation-runtime-export.test.mjs tests/browser-runtime-export.test.mjs
```

Expected: FAIL because generated runtime does not expose the new method.

- [ ] **Step 3: Extend the canonical runtime bridge source**

In `scripts/export-workstation-runtime-with-cursor.mjs`, add:

```js
hitTestMeasureDetailed(payload) {
  // exact plain-object validation for clientX/clientY
  // render-in-flight and active-host guards
  return activeHost.hitTestMeasureDetailed({
    clientX: point.clientX,
    clientY: point.clientY,
  });
}
```

Use the existing `requirePlainInteractionObject` helper and existing runtime error style. Do not create a second validator with different semantics.

- [ ] **Step 4: Regenerate through existing scripts and verify exports**

Run:

```bash
npm run export:workstation-runtime
npm run export:browser-runtime
node --test tests/workstation-runtime-export.test.mjs tests/browser-runtime-export.test.mjs
```

Expected: PASS and runtime manifest integrity assertions remain green.

- [ ] **Step 5: Commit Task 3**

```bash
git add scripts/export-workstation-runtime-with-cursor.mjs tests/workstation-runtime-export.test.mjs tests/browser-runtime-export.test.mjs tests/browser/workstation-runtime-export-fixture.html
git commit -m "feat: bridge measure hit-test through runtime"
```

Only add the fixture path if it actually changed.

---

### Task 4: Real Chromium and pinned WebKit interaction evidence

**Files:**
- Modify/Test: `tests/browser/osmd-note-interaction-fixture.html`
- Modify only if registration is required: `tests/browser/run-osmd-browser-fixture.mjs`
- Modify only if registration is required: `tests/webkit/run-osmd-webkit-fixture.mjs`

**Interfaces:**
- Consumes: Tasks 1–3 complete runtime/adapter behavior.
- Produces: real OSMD engine evidence for measure whitespace, mobile width, scroll and rerender.

- [ ] **Step 1: Add RED fixture assertions before implementation is considered complete**

Extend the existing interaction fixture instead of creating a duplicate test page unless isolation is technically necessary.

Required browser scenarios:

```text
720px: note point → measure HIT
720px: rest point → same measure HIT
720px: known empty staff/measure whitespace → measure HIT
320px: empty measure whitespace → measure HIT
320px: point outside graphical measure but inside SVG → NO_MEASURE_OWNER
scroll after render: fresh client point still maps to the same current measure
rerender: current measure geometry resolves and stale physical coordinates/owners are not reused
```

The fixture must derive test points from real current rendered geometry/elements, not hard-code page-screen coordinates that accidentally pass one viewport.

- [ ] **Step 2: Run Chromium fixture**

Run:

```bash
npm run test:browser
```

Expected before final GREEN: new measure assertions fail if Tasks 1–3 are incomplete; after implementation they PASS together with all existing fixtures.

- [ ] **Step 3: Run pinned WebKit fixture**

Run:

```bash
npm run test:webkit
```

Expected: PASS, including the existing 320px interaction fixture with the new measure-hit assertions.

- [ ] **Step 4: Verify no test silently converts engine evidence into physical-device acceptance**

Keep fixture/report wording explicit:

```text
Chromium/WebKit engine PASS != physical iPhone/Safari acceptance
```

No physical device gate belongs inside SES-38 repository CI.

- [ ] **Step 5: Commit Task 4**

```bash
git add tests/browser/osmd-note-interaction-fixture.html tests/browser/run-osmd-browser-fixture.mjs tests/webkit/run-osmd-webkit-fixture.mjs
git commit -m "test: verify measure hit-test across browser engines"
```

Only add runner files if they actually changed.

---

### Task 5: Public docs, compatibility record and contract-to-test matrix

**Files:**
- Modify: `docs/PUBLIC-API.md`
- Modify: `docs/BROWSER-HOST.md`
- Modify: `docs/NOTE-INTERACTION.md`
- Modify: `docs/CONSUMER-INTEGRATION.md`
- Modify: `docs/MOBILE-SAFARI.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/VERSIONING.md`

**Interfaces:**
- Consumes: final behavior from Tasks 1–4.
- Produces: consumer-facing renderer contract documentation and traceable testing/compatibility record.

- [ ] **Step 1: Document the exact public behavior**

Document:

```text
hitTestMeasureDetailed({ clientX, clientY })
→ HIT { renderEpoch, sourceId?, target: { partId, measureIndex } }
→ MISS { renderEpoch, sourceId?, reason }
```

State explicitly:

- “tap anywhere in a measure” means the exact validated `GraphicalMeasure.PositionAndShape` border region;
- measure whitespace is supported;
- page/inter-system whitespace is not guessed into a measure;
- ambiguity abstains;
- consumer canonical/playback mapping remains consumer-owned.

- [ ] **Step 2: Record the compatibility decision**

In `docs/VERSIONING.md`, document why contract stays `0.2.0`:

- additive concrete extension;
- base `ScoreRenderer` unchanged;
- existing semantics unchanged;
- consumers must feature-detect and pin exact renderer revision/runtime manifest.

- [ ] **Step 3: Extend testing matrix**

In `docs/TESTING.md`, add rows for:

- deterministic graphical measure ownership;
- measure whitespace;
- same-target overlap deduplication;
- ambiguity abstention;
- replacement epoch/geometry invalidation;
- Chromium 720/320;
- pinned WebKit 320;
- physical Safari still outside repository CI proof.

- [ ] **Step 4: Run documentation/source consistency checks through the normal suite**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add docs/PUBLIC-API.md docs/BROWSER-HOST.md docs/NOTE-INTERACTION.md docs/CONSUMER-INTEGRATION.md docs/MOBILE-SAFARI.md docs/TESTING.md docs/VERSIONING.md
git commit -m "docs: document deterministic measure hit-test"
```

---

### Task 6: Exact-head verification and human merge gate

**Files:**
- No intended production edits.
- Verification only unless a directly evidenced defect requires returning to the owning task.

**Interfaces:**
- Consumes: completed Task 1–5 branch.
- Produces: exact-head evidence package for separate human merge approval.

- [ ] **Step 1: Confirm changed surface against the approved spec**

Run:

```bash
git diff --name-status c6841ed51ea775534b0b199935267eeafa46a123...HEAD
git diff --stat c6841ed51ea775534b0b199935267eeafa46a123...HEAD
```

Expected scope only:

- adapter/browser-host runtime bridge;
- focused tests/fixtures;
- reconciled docs;
- no `packages/contracts/src/index.ts`;
- no Student App/OMR/editor/playback/Render files.

- [ ] **Step 2: Run the complete repository verification suite on exact HEAD**

Run:

```bash
npm run check
npm run test:browser
npm run test:webkit
npm run test:headless
```

Expected: all commands exit 0.

- [ ] **Step 3: Verify exact-head invariants**

Confirm with source/diff inspection:

- `SCORE_RENDERER_CONTRACT_VERSION === "0.2.0"`;
- OSMD remains exact `2.1.2`;
- Playwright remains exact `1.62.1`;
- no new runtime dependency;
- no nearest-measure/note inference;
- no pointer listener added;
- runtime output originates from generator source;
- detailed measure result exposes no DOM/OSMD/geometry object;
- existing NOTE/REST test suites remain green.

- [ ] **Step 4: Perform independent whole-branch review**

Use Codex Engineering Guardrails code-verification against:

- approved spec;
- this plan;
- exact branch diff;
- exact-head test evidence.

Result must be one of PASS/PARTIAL/FAIL/INCONCLUSIVE with material findings listed before any merge request.

- [ ] **Step 5: Prepare completion report without merging**

Required report fields:

```text
COMPLETED: SES-38 deterministic measure hit-test implementation
RESULT: <exact behavior/result>
VERIFICATION: <commands + Chromium/WebKit/headless evidence>
NOTION: <updated Gate/verification record>
LINEAR: <SES-38 status/evidence>
RENDER: UNCHANGED
BLOCKERS: <none or exact blocker>
NEXT: Human merge approval for SES-38
NEXT START CONDITION: Explicit merge approval
```

Stop here. Do not merge without separate explicit human approval.

---

## Post-Merge Verification Sequence

This sequence is intentionally **not executed before merge approval**.

After an explicitly approved merge:

1. resolve exact new `main` SHA;
2. confirm SES-38 commits are ancestors of `main`;
3. run/inspect required `foundation` status on exact main;
4. re-run or verify the required repository gates on exact main as allowed by the execution environment;
5. record exact-main PASS in Notion and Linear;
6. mark SES-38 complete only after exact-main evidence is green;
7. remove SES-38 as blocker of SES-27;
8. hand control back to SES-27 Student integration.

No Student App implementation begins inside SES-38.
