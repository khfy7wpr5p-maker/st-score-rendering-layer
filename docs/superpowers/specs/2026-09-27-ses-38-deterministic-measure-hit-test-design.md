# SES-38 — Deterministic Measure Hit-Test Design

Date: 2026-09-27  
Repository: `khfy7wpr5p-maker/st-score-rendering-layer`  
Baseline main: `c6841ed51ea775534b0b199935267eeafa46a123`  
Parent consumer work: Linear SES-27  
Scope: renderer prerequisite only

## 1. Intent

Provide one additive renderer-side presentation contract that resolves a fresh browser client point to a deterministic rendered measure locator:

```ts
Readonly<{
  partId: string;
  measureIndex: number;
}>
```

The consumer can then decide whether that current-render presentation locator maps to its own canonical score/playback state. The renderer does not start playback, mutate source state, own pointer/touch listeners, or infer identity from pitch, duration, nearest-note, nearest-measure, or arbitrary distance.

Success means “tap anywhere in the graphical measure region” can be implemented by SES-27 without consumer-side SVG/DOM scraping.

## 2. Confirmed current architecture

Fresh-read baseline confirms:

- `OsmdRenderer` already owns deterministic NOTE/REST DOM ownership indexes.
- Browser hit tests use fresh `clientX/clientY`, structured HIT/MISS results, and fail closed on ambiguous ownership.
- `BrowserScoreHost` binds detailed hit evidence to the current opaque `renderEpoch` and bounded optional `sourceId`.
- replacement render invalidates prior presentation evidence;
- generic browser runtime is generated from the reviewed Workstation bootstrap path;
- `ScoreRenderer` base contract does not currently require hit-test methods;
- OSMD is exact-pinned to `2.1.2`; OSMD 2.1.2 declares VexFlow `^1.2.93`, and this repository does not commit a root lockfile.

Upstream OSMD 2.1.2 evidence used by this design:

- every `GraphicalMeasure` has `PositionAndShape: BoundingBox`;
- a graphical measure is attached to a `ParentMusicSystem`, whose parent exposes `GraphicalMusicPage.PageNumber`;
- OSMD graphical coordinates use 10 VexFlow/SVG units per OSMD unit;
- VexFlow `1.2.93`—the minimum version declared by OSMD 2.1.2—implements SVG zoom through the SVG `viewBox`; because the resolved VexFlow dependency is not exact-pinned here, implementation must validate the live SVG transform behavior rather than depend on a resolved package-version assumption.

## 3. Alternatives considered

### A. Renderer-owned graphical-measure geometry index — selected

Build a bounded index from OSMD `GraphicalMeasure.PositionAndShape`, keyed by page plus `partId + measureIndex`. At hit time, map the live browser client point through the current renderer-owned SVG page into OSMD units, then evaluate exact graphical measure rectangles.

Advantages:

- based on OSMD’s layout authority rather than proximity inference;
- supports whitespace inside a measure;
- no consumer-visible DOM selectors;
- no invisible interaction overlay;
- scroll/zoom stay browser-resolved;
- multi-staff regions that map to the same logical presentation target can safely collapse.

### B. Invisible SVG measure overlays — rejected

Transparent rectangles could make whitespace directly hittable, but they would mutate rendered SVG, alter export/visual hashes, risk stacking/pointer behavior, and add lifecycle cleanup complexity. The renderer does not need to change the rendered document to answer a query.

### C. DOM ancestry / selector scraping — rejected

DOM ancestry works for rendered symbols but not reliable measure whitespace. Selector structure is a vendor detail and cannot define measure identity for a consumer contract.

## 4. Public additive shape

No new required `ScoreRenderer` method is introduced.

Adapter extension:

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

resolveMeasureAtClientPointDetailed(
  point: OsmdClientPoint
): OsmdMeasureHitDetailedResult;
```

Browser host extension:

```ts
export type BrowserMeasureHitTargetRef = Readonly<{
  partId: string;
  measureIndex: number;
}>;

export type BrowserMeasureHitDetailedResult =
  | Readonly<{
      kind: "HIT";
      renderEpoch: BrowserRenderEpoch;
      sourceId?: string;
      target: BrowserMeasureHitTargetRef;
    }>
  | Readonly<{
      kind: "MISS";
      renderEpoch: BrowserRenderEpoch;
      sourceId?: string;
      reason: BrowserMeasureHitMissReason;
    }>;

hitTestMeasureDetailed(point: BrowserNoteHitPoint):
  BrowserMeasureHitDetailedResult;
```

Generic runtime extension:

```js
globalThis.__ST_SCORE_RENDER_HOST__.hitTestMeasureDetailed({
  clientX,
  clientY
})
```

No legacy/simple `hitTestMeasure()` is added in V1. The SES-27 consumer requires epoch-bound evidence, so a second non-epoch API would create unnecessary surface.

## 5. Measure-region definition

A V1 measure hit region is the validated **border rectangle** of one current OSMD `GraphicalMeasure.PositionAndShape`.

For a graphical measure:

```text
left   = AbsolutePosition.x + BorderLeft
right  = AbsolutePosition.x + BorderRight
top    = AbsolutePosition.y + BorderTop
bottom = AbsolutePosition.y + BorderBottom
```

Rules:

- use borders, not border margins;
- do not inflate the rectangle;
- do not add a hit radius;
- do not use nearest geometry;
- all values must be finite;
- `right > left` and `bottom > top` are required;
- the graphical measure must resolve to a current visible instrument staff, a non-negative source `measureIndex`, and a valid page number;
- invalid geometry is omitted from the active index;
- if bounded index construction cannot be trusted for the render, the measure-hit API fails closed with `MEASURE_GEOMETRY_UNAVAILABLE`; score rendering itself remains usable.

This definition intentionally covers notes, rests, stems/flags/dots that fall inside the graphical measure, and true staff/measure whitespace. It does not claim page margins, titles, inter-system whitespace, or arbitrary nearby SVG space as part of a measure.

## 6. Identity construction

The index is rebuilt after every successful render/updateGraphic path from current renderer-owned OSMD structures.

Traversal:

```text
Sheet.Instruments
→ visible instrument
→ instrument.Staves[idInMusicSheet]
→ graphic.measureList[measureIndex][staffId]
→ GraphicalMeasure
→ ParentMusicSystem.Parent.PageNumber
→ validated region
→ { partId: instrument.IdString, measureIndex }
```

Multiple staff regions belonging to the same instrument and measure may exist. They are separate physical regions but share the same target. Equal targets are deduplicated during hit resolution.

The index is reset on load, replacement render preparation, visibility mutation, failure, and dispose. It never survives as evidence for a later render generation.

## 7. Client-point projection

The consumer supplies only fresh `clientX/clientY`.

Resolution must respect current DOM stacking first:

1. reject non-finite coordinates;
2. call `elementFromPoint`; null → `NO_ELEMENT_AT_POINT`;
3. if the top element is outside the renderer-owned container → `OUTSIDE_RENDER_CONTAINER`;
4. locate the current renderer-owned SVG page containing that top element; if no owned SVG page is established → `UNMAPPED_ELEMENT`.

For the selected page:

- page association comes from current OSMD graphical page number and the SVG page owned by the same renderer container;
- browser client coordinates are converted to SVG user coordinates with the live SVG screen transform / inverse transform;
- SVG user coordinates are converted to OSMD units using OSMD 2.1.2’s 10 SVG user units per OSMD unit drawing convention;
- VexFlow SVG zoom must be left to its viewBox/browser transform; do not manually apply `window.scrollX`, `scrollY`, `devicePixelRatio`, cached offsets, or a proximity correction.

If the live SVG transform is absent, non-invertible, non-finite, or does not correspond to the indexed page, the API fails closed.

This projection is evaluated at hit time, not cached as client rectangles, so browser scrolling after render does not stale the coordinate mapping.

## 8. Ownership resolution

For the selected current SVG page and projected OSMD point:

1. collect every validated measure region containing the point;
2. map each region to `partId + measureIndex`;
3. deduplicate equal targets;
4. zero unique targets → `NO_MEASURE_OWNER`;
5. one unique target → HIT;
6. more than one different target → `AMBIGUOUS_OWNERSHIP`.

No tie-breaking order is allowed.

Therefore:

- two overlapping staves of the same part/measure may collapse to one HIT;
- different part or measure owners at the same physical point produce MISS;
- z-order does not select between conflicting measure owners;
- note/rest identity, pitch, duration, eventIndex, voice, or distance cannot resolve a measure ambiguity.

## 9. BrowserScoreHost boundary

`BrowserScoreHost.hitTestMeasureDetailed()` follows the existing detailed interaction pattern:

- strict finite point validation;
- renderer feature detection;
- unavailable while a render is in flight;
- unavailable before a successful active render;
- adapter output is normalized through strict plain-object validation;
- only `partId`, `measureIndex`, known kind/reason values are accepted;
- `partId` uses the existing bounded identifier policy;
- returned result is bound to the current `renderEpoch`;
- bounded `sourceId` is copied exactly as existing detailed hit evidence does.

The host never returns OSMD, SVG, DOM, bounding-box, page, or geometry objects.

## 10. Stale evidence

The adapter answers only from its current index. The host additionally binds the answer to its active epoch.

After a replacement render:

- the old adapter index is cleared/rebuilt;
- a successful replacement creates a new `renderEpoch`;
- evidence from the old epoch is stale even if `partId + measureIndex` happens to be equal;
- failed replacement or dispose leaves no active detailed hit evidence.

SES-27 must compare/retain current render evidence according to its own consumer rules; the renderer does not mutate consumer playback state.

## 11. Runtime generation

The generic browser runtime must be changed only through the canonical generated-runtime source path.

Expected source-level addition:

- add strict runtime payload validation for exact plain `{ clientX, clientY }`;
- forward to `activeHost.hitTestMeasureDetailed()`;
- preserve render-in-flight/no-active-host fail-closed behavior.

Then regenerate through the existing export scripts and verify manifest/provenance/integrity. Do not hand-edit generated runtime output.

The Student App vendored runtime is not changed in SES-38.

## 12. Compatibility decision

`SCORE_RENDERER_CONTRACT_VERSION` remains `0.2.0`.

Reason:

- base `ScoreRenderer` remains unchanged;
- existing NOTE/REST methods and semantics remain unchanged;
- the measure API is an additive concrete adapter/browser-host/runtime extension;
- no canonical/editor/playback authority is added.

Like `hitTestNoteDetailed()`, consumers requiring the new method must feature-detect it and pin/verify the exact renderer revision/runtime manifest. If implementation discovers that the base renderer protocol must change, work stops for a new compatibility decision before code proceeds.

## 13. TDD acceptance matrix

Implementation starts with RED tests demonstrating the missing behavior.

Required RED → GREEN coverage:

1. note point → containing measure HIT;
2. rest point → containing measure HIT;
3. stem/flag/dot/current graphical owner point → containing measure HIT when point is inside the measure region;
4. true measure whitespace → correct HIT;
5. outside measure but inside renderer SVG → MISS;
6. outside renderer → MISS;
7. same physical point with different measure/part owners → `AMBIGUOUS_OWNERSHIP`;
8. same-target multi-staff overlap deduplicates to one HIT;
9. malformed/non-finite client payload rejects;
10. malformed/non-finite/index geometry fails closed without inventing a target;
11. replacement render rebuilds geometry and old host epoch is stale;
12. current host result carries current `renderEpoch` and bounded `sourceId`;
13. scroll after render with fresh client coordinates still resolves correctly;
14. 720px Chromium fixture passes;
15. 320px Chromium fixture passes;
16. pinned Playwright WebKit fixture passes at 320px;
17. existing `hitTestNote*` and `hitTestRenderedEventDetailed` behavior remains unchanged;
18. runtime export exposes only the bounded new method and regenerated integrity evidence.

## 14. Expected implementation surface

The implementation plan may touch only the minimum justified surface:

- `packages/adapter-osmd/src/index.ts`;
- `packages/browser-host/src/index.ts`;
- canonical runtime bridge/export source;
- focused unit/browser/WebKit/runtime tests;
- docs required to describe the additive behavior.

`packages/contracts/src/index.ts` is expected to remain unchanged under this design.

No Student App, OMR, editor, playback, deployment, service, or domain files belong in this PR.

## 15. Documentation reconciliation

After implementation, reconcile at least:

- `docs/PUBLIC-API.md`;
- `docs/BROWSER-HOST.md`;
- `docs/NOTE-INTERACTION.md` or an explicit measure-interaction section;
- `docs/CONSUMER-INTEGRATION.md`;
- `docs/MOBILE-SAFARI.md`;
- `docs/TESTING.md`;
- `docs/VERSIONING.md` for the additive/no-bump decision.

The phrase “tap anywhere in a measure” must mean the exact validated graphical measure border region defined in this spec.

## 16. Explicit non-goals

SES-38 does not implement:

- Student App `ScoreFollowIndex`;
- `PlaybackPlan` changes;
- `playMeasureOnce`;
- automatic playback cursor coordination;
- active note/chord playback highlighting;
- TAB/Chord UI changes;
- editing;
- OMR;
- microphone/MIDI scoring;
- teacher/canonical source mutation;
- deployment or Render changes.

## 17. Gate result required

This document is the written design artifact for Human Gate 1.

No implementation plan and no production code may begin until the user explicitly approves this spec.
