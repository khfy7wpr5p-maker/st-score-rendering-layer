import assert from "node:assert/strict";
import test from "node:test";

import {
  BrowserScoreHost,
  BrowserScoreHostUnavailableError,
} from "../packages/browser-host/dist/index.js";

function container() {
  return { replaceChildren() {} };
}

function renderer({ failRender = false } = {}) {
  const target = Object.freeze({ partId: "P1", measureIndex: 0, noteIndex: 0 });
  return {
    id: "fake",
    capabilities: new Set(["musicxml-render", "svg-export"]),
    async load() {},
    async render() {
      if (failRender) throw new Error("synthetic replacement failure");
      return { rendererId: "fake", contractVersion: "0.2.0" };
    },
    async exportSvg() { return ["<svg/>"]; },
    resolveNoteAtClientPoint() { return target; },
    resolveNoteAtClientPointDetailed() { return Object.freeze({ kind: "HIT", target }); },
    async highlight() {},
    async clearHighlights() {},
    async moveCursor() {},
    async setPartVisible() {},
    async dispose() {},
  };
}

test("failed replacement invalidates prior detailed hit evidence and active epoch", async () => {
  const renderers = [renderer(), renderer({ failRender: true })];
  let index = 0;
  const host = new BrowserScoreHost(container(), {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => renderers[index++],
  });

  const firstRender = await host.renderMusicXml("<score-partwise/>", {}, "score-A");
  const staleEvidence = host.hitTestNoteDetailed({ clientX: 1, clientY: 1 });
  assert.equal(staleEvidence.renderEpoch, firstRender.renderEpoch);

  await assert.rejects(
    () => host.renderMusicXml("<score-partwise version=\"4.0\"/>", {}, "score-B"),
    /synthetic replacement failure/,
  );
  assert.throws(
    () => host.hitTestNoteDetailed({ clientX: 1, clientY: 1 }),
    BrowserScoreHostUnavailableError,
  );
});

test("invalid replacement input and dispose invalidate current detailed hit access", async () => {
  const host = new BrowserScoreHost(container(), {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => renderer(),
  });
  await host.renderMusicXml("<score-partwise/>");
  await assert.rejects(() => host.renderMusicXml(""));
  assert.throws(
    () => host.hitTestNoteDetailed({ clientX: 1, clientY: 1 }),
    BrowserScoreHostUnavailableError,
  );

  const secondHost = new BrowserScoreHost(container(), {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => renderer(),
  });
  await secondHost.renderMusicXml("<score-partwise/>");
  await secondHost.dispose();
  assert.throws(
    () => secondHost.hitTestNoteDetailed({ clientX: 1, clientY: 1 }),
    /disposed/,
  );
});
