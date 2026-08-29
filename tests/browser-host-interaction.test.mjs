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
  const renderer = {
    id: "fake",
    capabilities: new Set(["musicxml-render", "svg-export", "note-highlight"]),
    async load() {},
    async render() { return { rendererId: "fake", contractVersion: "0.2.0" }; },
    async exportSvg() { return ["<svg></svg>"]; },
    resolveNoteAtClientPoint() { return { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 2 }; },
    async highlight(value) { calls.highlights.push(value); },
    async clearHighlights() { calls.clearHighlights += 1; },
    async moveCursor() {},
    async setPartVisible() {},
    async dispose() { calls.disposed += 1; },
    ...overrides,
  };
  return { calls, renderer };
}

test("BrowserScoreHost exposes exact note hit-test and highlight without canonical assumptions", async () => {
  const container = createContainer();
  const { renderer, calls } = createRenderer();
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => renderer,
  });
  await host.renderMusicXml("<score-partwise/>");

  assert.deepEqual(host.hitTestNote({ clientX: 10, clientY: 20 }), {
    partId: "P1",
    measureIndex: 0,
    noteIndex: 1,
    voice: 2,
  });
  await host.highlight({
    target: { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 2 },
    className: "teacher-focus",
  });
  assert.equal(calls.highlights.length, 1);
  await host.clearHighlights();
  assert.equal(calls.clearHighlights, 1);
});

test("BrowserScoreHost fails closed when hit-test or highlight capability is unavailable", async () => {
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
  releaseLoad();
  await renderPromise;

  assert.throws(
    () => host.hitTestNote({ clientX: Number.NaN, clientY: 1 }),
    /finite numbers/,
  );
  await host.dispose();
  assert.throws(
    () => host.hitTestNote({ clientX: 1, clientY: 1 }),
    /disposed/,
  );
  await assert.rejects(
    () => host.clearHighlights(),
    /disposed/,
  );
});
