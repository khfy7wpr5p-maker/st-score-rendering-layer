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
  const first = createRenderer();
  const second = createRenderer({
    resolveNoteAtClientPoint() { return null; },
    resolveNoteAtClientPointDetailed() { return Object.freeze({ kind: "MISS", reason: "UNMAPPED_ELEMENT" }); },
  });
  const renderers = [first.renderer, second.renderer];
  let factoryIndex = 0;
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => renderers[factoryIndex++],
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
  assert.equal(first.calls.disposed, 1, "replacement disposes the renderer that owned the stale epoch");
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
