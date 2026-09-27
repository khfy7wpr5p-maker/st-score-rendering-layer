import assert from "node:assert/strict";
import test from "node:test";

import {
  BrowserScoreHost,
  BrowserScoreHostUnavailableError,
} from "../packages/browser-host/dist/index.js";

function createContainer() {
  return {
    cleared: 0,
    replaceChildren() { this.cleared += 1; },
  };
}

function createRenderer(overrides = {}) {
  const calls = { highlights: [], clearHighlights: 0, disposed: 0 };
  const target = Object.freeze({ partId: "P1", measureIndex: 0, noteIndex: 1, voice: 2 });
  const renderer = {
    id: "fake",
    capabilities: new Set(["musicxml-render", "svg-export", "note-highlight"]),
    async load() {},
    async render() { return { rendererId: "fake", contractVersion: "0.2.0" }; },
    async exportSvg() { return ["<svg></svg>"]; },
    resolveNoteAtClientPoint() { return target; },
    resolveNoteAtClientPointDetailed() { return Object.freeze({ kind: "HIT", target }); },
    resolveMeasureAtClientPointDetailed() {
      return Object.freeze({ kind: "HIT", target: Object.freeze({ partId: "P1", measureIndex: 0 }) });
    },
    async highlight(value) { calls.highlights.push(value); },
    async clearHighlights() { calls.clearHighlights += 1; },
    async moveCursor() {},
    async setPartVisible() {},
    async dispose() { calls.disposed += 1; },
    ...overrides,
  };
  return { calls, renderer };
}

test("BrowserScoreHost exposes exact note hit-test and epoch-bound detailed evidence without canonical assumptions", async () => {
  const container = createContainer();
  const { renderer, calls } = createRenderer();
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => renderer,
  });
  const renderResult = await host.renderMusicXml("<score-partwise/>", {}, "score-A");

  assert.equal(typeof renderResult.renderEpoch, "string");
  assert.equal(renderResult.sourceId, "score-A");
  assert.deepEqual(host.hitTestNote({ clientX: 10, clientY: 20 }), {
    partId: "P1",
    measureIndex: 0,
    noteIndex: 1,
    voice: 2,
  });
  assert.deepEqual(host.hitTestNoteDetailed({ clientX: 10, clientY: 20 }), {
    kind: "HIT",
    renderEpoch: renderResult.renderEpoch,
    sourceId: "score-A",
    target: {
      partId: "P1",
      measureIndex: 0,
      noteIndex: 1,
      voice: 2,
    },
  });
  await host.highlight({
    target: { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 2 },
    className: "teacher-focus",
  });
  assert.equal(calls.highlights.length, 1);
  await host.clearHighlights();
  assert.equal(calls.clearHighlights, 1);
});

test("BrowserScoreHost advances render epoch and makes prior detailed evidence stale by comparison", async () => {
  const container = createContainer();
  let activeSourceId = null;
  const first = createRenderer({
    async load(source) { activeSourceId = source.sourceId ?? null; },
    resolveNoteAtClientPoint() {
      return activeSourceId === "score-B"
        ? null
        : { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 2 };
    },
    resolveNoteAtClientPointDetailed() {
      return activeSourceId === "score-B"
        ? Object.freeze({ kind: "MISS", reason: "UNMAPPED_ELEMENT" })
        : Object.freeze({
            kind: "HIT",
            target: { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 2 },
          });
    },
  });
  let factoryCalls = 0;
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => {
      factoryCalls += 1;
      return first.renderer;
    },
  });

  const firstRender = await host.renderMusicXml("<score-partwise/>", {}, "score-A");
  const firstEvidence = host.hitTestNoteDetailed({ clientX: 1, clientY: 1 });
  assert.equal(firstEvidence.renderEpoch, firstRender.renderEpoch);

  const secondRender = await host.renderMusicXml("<score-partwise version=\"4.0\"/>", {}, "score-B");
  assert.notEqual(secondRender.renderEpoch, firstRender.renderEpoch);
  assert.notEqual(firstEvidence.renderEpoch, secondRender.renderEpoch, "stored evidence can be rejected after replacement render");
  assert.deepEqual(host.hitTestNoteDetailed({ clientX: 1, clientY: 1 }), {
    kind: "MISS",
    renderEpoch: secondRender.renderEpoch,
    sourceId: "score-B",
    reason: "UNMAPPED_ELEMENT",
  });
  assert.equal(factoryCalls, 1, "replacement keeps the initialized renderer warm");
  assert.equal(first.calls.disposed, 0, "valid replacement does not dispose the warm renderer");
});

test("BrowserScoreHost detailed evidence normalizes bounded data and rejects malformed renderer results", async () => {
  const container = createContainer();
  const { renderer } = createRenderer({
    resolveNoteAtClientPointDetailed() {
      return { kind: "HIT", target: { partId: "P1", measureIndex: 0, noteIndex: 0 }, leakedDom: {} };
    },
  });
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => renderer,
  });
  await host.renderMusicXml("<score-partwise/>");
  assert.throws(
    () => host.hitTestNoteDetailed({ clientX: 1, clientY: 1 }),
    /unsupported field 'leakedDom'/,
  );
});

test("BrowserScoreHost fails closed when hit-test, detailed hit-test or highlight capability is unavailable", async () => {
  const noHitContainer = createContainer();
  const { renderer: noHitRenderer } = createRenderer();
  delete noHitRenderer.resolveNoteAtClientPoint;
  const noHitHost = new BrowserScoreHost(noHitContainer, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => noHitRenderer,
  });
  await noHitHost.renderMusicXml("<score-partwise/>");
  assert.throws(
    () => noHitHost.hitTestNote({ clientX: 1, clientY: 1 }),
    BrowserScoreHostUnavailableError,
  );
  assert.throws(
    () => noHitHost.hitTestNoteDetailed({ clientX: 1, clientY: 1 }),
    BrowserScoreHostUnavailableError,
  );

  const noDetailedContainer = createContainer();
  const { renderer: noDetailedRenderer } = createRenderer();
  delete noDetailedRenderer.resolveNoteAtClientPointDetailed;
  const noDetailedHost = new BrowserScoreHost(noDetailedContainer, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => noDetailedRenderer,
  });
  await noDetailedHost.renderMusicXml("<score-partwise/>");
  assert.deepEqual(noDetailedHost.hitTestNote({ clientX: 1, clientY: 1 }), {
    partId: "P1", measureIndex: 0, noteIndex: 1, voice: 2,
  });
  assert.throws(
    () => noDetailedHost.hitTestNoteDetailed({ clientX: 1, clientY: 1 }),
    /detailed note hit-test capability/,
  );

  const noHighlightContainer = createContainer();
  const { renderer: noHighlightRenderer } = createRenderer({
    capabilities: new Set(["musicxml-render", "svg-export"]),
  });
  const noHighlightHost = new BrowserScoreHost(noHighlightContainer, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => noHighlightRenderer,
  });
  await noHighlightHost.renderMusicXml("<score-partwise/>");
  await assert.rejects(
    () => noHighlightHost.highlight({ target: { partId: "P1", measureIndex: 0, noteIndex: 0 } }),
    BrowserScoreHostUnavailableError,
  );
});

test("BrowserScoreHost interaction rejects malformed coordinates, render-in-flight use and disposed use", async () => {
  const container = createContainer();
  let releaseLoad;
  const loadGate = new Promise((resolve) => { releaseLoad = resolve; });
  const { renderer } = createRenderer({ async load() { await loadGate; } });
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => renderer,
  });

  const renderPromise = host.renderMusicXml("<score-partwise/>");
  assert.throws(
    () => host.hitTestNote({ clientX: 1, clientY: 1 }),
    /unavailable while rendering is in progress/,
  );
  assert.throws(
    () => host.hitTestNoteDetailed({ clientX: 1, clientY: 1 }),
    /unavailable while rendering is in progress/,
  );
  releaseLoad();
  await renderPromise;

  assert.throws(
    () => host.hitTestNote({ clientX: Number.NaN, clientY: 1 }),
    /finite numbers/,
  );
  assert.throws(
    () => host.hitTestNoteDetailed({ clientX: 1, clientY: Number.POSITIVE_INFINITY }),
    /finite numbers/,
  );
  await host.dispose();
  assert.throws(
    () => host.hitTestNote({ clientX: 1, clientY: 1 }),
    /disposed/,
  );
  assert.throws(
    () => host.hitTestNoteDetailed({ clientX: 1, clientY: 1 }),
    /disposed/,
  );
  await assert.rejects(
    () => host.clearHighlights(),
    /disposed/,
  );
});


test("BrowserScoreHost measure hit-test binds valid HIT and MISS evidence to the active render epoch", async () => {
  const container = createContainer();
  let measureResult = Object.freeze({
    kind: "HIT",
    target: Object.freeze({ partId: "P1", measureIndex: 3 }),
  });
  const { renderer } = createRenderer({
    resolveMeasureAtClientPointDetailed() { return measureResult; },
  });
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => renderer,
  });

  const firstRender = await host.renderMusicXml("<score-partwise/>", {}, "score-A");
  assert.deepEqual(host.hitTestMeasureDetailed({ clientX: 10, clientY: 20 }), {
    kind: "HIT",
    renderEpoch: firstRender.renderEpoch,
    sourceId: "score-A",
    target: { partId: "P1", measureIndex: 3 },
  });

  for (const reason of [
    "NO_ELEMENT_AT_POINT",
    "OUTSIDE_RENDER_CONTAINER",
    "UNMAPPED_ELEMENT",
    "NO_MEASURE_OWNER",
    "AMBIGUOUS_OWNERSHIP",
    "MEASURE_GEOMETRY_UNAVAILABLE",
  ]) {
    measureResult = Object.freeze({ kind: "MISS", reason });
    assert.deepEqual(host.hitTestMeasureDetailed({ clientX: 10, clientY: 20 }), {
      kind: "MISS",
      renderEpoch: firstRender.renderEpoch,
      sourceId: "score-A",
      reason,
    });
  }
});

test("BrowserScoreHost measure hit-test strictly normalizes renderer payloads", async () => {
  const malformedCases = [
    {
      value: { kind: "HIT", target: { partId: "P1", measureIndex: 0 }, leakedDom: {} },
      message: /unsupported field 'leakedDom'/,
    },
    {
      value: { kind: "HIT", target: { partId: " P1", measureIndex: 0 } },
      message: /partId.*bounded string/i,
    },
    {
      value: { kind: "HIT", target: { partId: "P1", measureIndex: -1 } },
      message: /measureIndex.*non-negative safe integer/i,
    },
    {
      value: { kind: "MISS", reason: "NEAREST_MEASURE" },
      message: /unsupported miss reason/i,
    },
  ];

  for (const { value, message } of malformedCases) {
    const container = createContainer();
    const { renderer } = createRenderer({
      resolveMeasureAtClientPointDetailed() { return value; },
    });
    const host = new BrowserScoreHost(container, {
      expectedContractVersion: "0.2.0",
      rendererFactory: () => renderer,
    });
    await host.renderMusicXml("<score-partwise/>");
    assert.throws(
      () => host.hitTestMeasureDetailed({ clientX: 1, clientY: 1 }),
      message,
    );
  }
});

test("BrowserScoreHost measure hit-test fails closed before render, during render, without capability and after dispose", async () => {
  const beforeContainer = createContainer();
  const { renderer: beforeRenderer } = createRenderer();
  const beforeHost = new BrowserScoreHost(beforeContainer, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => beforeRenderer,
  });
  assert.throws(
    () => beforeHost.hitTestMeasureDetailed({ clientX: 1, clientY: 1 }),
    BrowserScoreHostUnavailableError,
  );

  let releaseLoad;
  const loadGate = new Promise((resolve) => { releaseLoad = resolve; });
  const inFlightContainer = createContainer();
  const { renderer: inFlightRenderer } = createRenderer({ async load() { await loadGate; } });
  const inFlightHost = new BrowserScoreHost(inFlightContainer, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => inFlightRenderer,
  });
  const renderPromise = inFlightHost.renderMusicXml("<score-partwise/>");
  assert.throws(
    () => inFlightHost.hitTestMeasureDetailed({ clientX: 1, clientY: 1 }),
    /unavailable while rendering is in progress/,
  );
  releaseLoad();
  await renderPromise;

  const noCapabilityContainer = createContainer();
  const { renderer: noCapabilityRenderer } = createRenderer();
  delete noCapabilityRenderer.resolveMeasureAtClientPointDetailed;
  const noCapabilityHost = new BrowserScoreHost(noCapabilityContainer, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => noCapabilityRenderer,
  });
  await noCapabilityHost.renderMusicXml("<score-partwise/>");
  assert.throws(
    () => noCapabilityHost.hitTestMeasureDetailed({ clientX: 1, clientY: 1 }),
    /measure hit-test capability/,
  );

  assert.throws(
    () => inFlightHost.hitTestMeasureDetailed({ clientX: Number.NaN, clientY: 1 }),
    /finite numbers/,
  );
  await inFlightHost.dispose();
  assert.throws(
    () => inFlightHost.hitTestMeasureDetailed({ clientX: 1, clientY: 1 }),
    /disposed/,
  );
});

test("BrowserScoreHost measure evidence advances with replacement render epochs", async () => {
  const container = createContainer();
  let sourceId = null;
  const { renderer } = createRenderer({
    async load(source) { sourceId = source.sourceId ?? null; },
    resolveMeasureAtClientPointDetailed() {
      return sourceId === "score-B"
        ? Object.freeze({ kind: "MISS", reason: "NO_MEASURE_OWNER" })
        : Object.freeze({ kind: "HIT", target: { partId: "P1", measureIndex: 0 } });
    },
  });
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => renderer,
  });

  const firstRender = await host.renderMusicXml("<score-partwise/>", {}, "score-A");
  const firstEvidence = host.hitTestMeasureDetailed({ clientX: 1, clientY: 1 });
  assert.equal(firstEvidence.renderEpoch, firstRender.renderEpoch);

  const secondRender = await host.renderMusicXml("<score-partwise version=\"4.0\"/>", {}, "score-B");
  assert.notEqual(secondRender.renderEpoch, firstRender.renderEpoch);
  assert.notEqual(firstEvidence.renderEpoch, secondRender.renderEpoch);
  assert.deepEqual(host.hitTestMeasureDetailed({ clientX: 1, clientY: 1 }), {
    kind: "MISS",
    renderEpoch: secondRender.renderEpoch,
    sourceId: "score-B",
    reason: "NO_MEASURE_OWNER",
  });
});
