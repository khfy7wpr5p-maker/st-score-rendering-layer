import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SCORE_RENDERER_CONTRACT_VERSION } from "../packages/contracts/dist/index.js";
import {
  BrowserScoreHost,
  BrowserScoreHostUnavailableError,
  ScoreRendererContractVersionMismatchError,
} from "../packages/browser-host/dist/index.js";

class FakeContainer {
  clearCount = 0;

  replaceChildren() {
    this.clearCount += 1;
  }
}

class FakeRenderer {
  constructor({ contractVersion = SCORE_RENDERER_CONTRACT_VERSION, capabilities, failRender = false } = {}) {
    this.id = "fake";
    this.capabilities = capabilities ?? new Set(["musicxml-render", "svg-export"]);
    this.contractVersion = contractVersion;
    this.failRender = failRender;
    this.loadedSource = undefined;
    this.renderOptions = undefined;
    this.disposed = false;
  }

  async load(source) {
    this.loadedSource = source;
  }

  async render(options) {
    this.renderOptions = options;
    if (this.failRender) throw new Error("synthetic render failure");
    return { rendererId: this.id, contractVersion: this.contractVersion };
  }

  async exportSvg() {
    return ["<svg data-fake=\"true\"></svg>"];
  }

  async highlight() {}
  async clearHighlights() {}
  async moveCursor() {}
  async setPartVisible() {}

  async dispose() {
    this.disposed = true;
  }
}

test("browser host rejects runtime contract mismatch before renderer creation", () => {
  const container = new FakeContainer();
  let factoryCalls = 0;

  assert.throws(
    () => new BrowserScoreHost(container, {
      expectedContractVersion: "0.1.0",
      rendererFactory: () => {
        factoryCalls += 1;
        return new FakeRenderer();
      },
    }),
    ScoreRendererContractVersionMismatchError,
  );
  assert.equal(factoryCalls, 0);
});

test("browser host renders bounded in-memory MusicXML through an ST renderer", async () => {
  const container = new FakeContainer();
  const renderers = [];
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: SCORE_RENDERER_CONTRACT_VERSION,
    rendererFactory: () => {
      const renderer = new FakeRenderer();
      renderers.push(renderer);
      return renderer;
    },
  });

  const result = await host.renderMusicXml(
    "<score-partwise version=\"4.0\"></score-partwise>",
    { pageMode: "page", drawTitle: false },
    "score-A",
  );

  assert.equal(result.contractVersion, SCORE_RENDERER_CONTRACT_VERSION);
  assert.equal(renderers.length, 1);
  assert.deepEqual(renderers[0].loadedSource, {
    kind: "musicxml",
    content: "<score-partwise version=\"4.0\"></score-partwise>",
    sourceId: "score-A",
  });
  assert.deepEqual(renderers[0].renderOptions, { pageMode: "page", drawTitle: false });
  assert.deepEqual(await host.exportSvg(), ["<svg data-fake=\"true\"></svg>"]);

  await host.renderMusicXml("<score-partwise></score-partwise>");
  assert.equal(renderers.length, 2);
  assert.equal(renderers[0].disposed, true, "previous renderer is disposed before replacement");
  assert.ok(container.clearCount >= 2, "presentation container is cleared between render requests");
});

test("invalid MusicXML clears stale presentation without invoking a new renderer", async () => {
  const container = new FakeContainer();
  const renderers = [];
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: SCORE_RENDERER_CONTRACT_VERSION,
    rendererFactory: () => {
      const renderer = new FakeRenderer();
      renderers.push(renderer);
      return renderer;
    },
  });

  await host.renderMusicXml("<score-partwise></score-partwise>");
  const clearsBeforeFailure = container.clearCount;

  await assert.rejects(() => host.renderMusicXml(""));
  assert.equal(renderers.length, 1, "invalid source fails before renderer creation");
  assert.equal(renderers[0].disposed, true, "previous renderer is disposed after invalid replacement input");
  assert.ok(container.clearCount > clearsBeforeFailure, "stale presentation is cleared on validation failure");
  await assert.rejects(() => host.exportSvg(), BrowserScoreHostUnavailableError);
});

test("renderer contract mismatch after render fails closed", async () => {
  const container = new FakeContainer();
  const renderer = new FakeRenderer({ contractVersion: "9.9.9" });
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: SCORE_RENDERER_CONTRACT_VERSION,
    rendererFactory: () => renderer,
  });

  await assert.rejects(
    () => host.renderMusicXml("<score-partwise></score-partwise>"),
    ScoreRendererContractVersionMismatchError,
  );
  assert.equal(renderer.disposed, true);
  await assert.rejects(() => host.exportSvg(), BrowserScoreHostUnavailableError);
});

test("missing required renderer capabilities fail closed", async () => {
  const container = new FakeContainer();
  const renderer = new FakeRenderer({ capabilities: new Set(["musicxml-render"]) });
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: SCORE_RENDERER_CONTRACT_VERSION,
    rendererFactory: () => renderer,
  });

  await assert.rejects(
    () => host.renderMusicXml("<score-partwise></score-partwise>"),
    BrowserScoreHostUnavailableError,
  );
  assert.equal(renderer.disposed, true);
});

test("disposed browser host cannot accept new rendering work", async () => {
  const host = new BrowserScoreHost(new FakeContainer(), {
    expectedContractVersion: SCORE_RENDERER_CONTRACT_VERSION,
    rendererFactory: () => new FakeRenderer(),
  });

  await host.dispose();
  await assert.rejects(
    () => host.renderMusicXml("<score-partwise></score-partwise>"),
    BrowserScoreHostUnavailableError,
  );
});

test("browser host source keeps vendor, network, and message transport outside its boundary", async () => {
  const [source, packageText] = await Promise.all([
    readFile(new URL("../packages/browser-host/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../packages/browser-host/package.json", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.equal(source.includes("opensheetmusicdisplay"), false);
  assert.equal(Object.hasOwn(packageJson.dependencies, "opensheetmusicdisplay"), false);
  assert.equal(/\bfetch\s*\(/.test(source), false);
  assert.equal(source.includes("XMLHttpRequest"), false);
  assert.equal(source.includes("WebSocket"), false);
  assert.equal(source.includes("postMessage"), false);
  assert.equal(source.includes("addEventListener(\"message\"") || source.includes("addEventListener('message'"), false);
});
