import assert from "node:assert/strict";
import test from "node:test";

import { SCORE_RENDERER_CONTRACT_VERSION } from "../packages/contracts/dist/index.js";
import {
  BrowserScoreHost,
  BrowserScoreHostUnavailableError,
} from "../packages/browser-host/dist/index.js";

class FakeContainer {
  replaceChildren() {}
}

class CursorRenderer {
  constructor({ capabilities = new Set(["musicxml-render", "svg-export", "cursor"]) } = {}) {
    this.id = "cursor-fake";
    this.capabilities = capabilities;
    this.moves = [];
  }

  async load() {}
  async render() {
    return { rendererId: this.id, contractVersion: SCORE_RENDERER_CONTRACT_VERSION };
  }
  async exportSvg() { return ["<svg></svg>"]; }
  async highlight() {}
  async clearHighlights() {}
  async moveCursor(target) { this.moves.push(target); }
  async setPartVisible() {}
  async dispose() {}
}

function createHost(renderer) {
  return new BrowserScoreHost(new FakeContainer(), {
    expectedContractVersion: SCORE_RENDERER_CONTRACT_VERSION,
    rendererFactory: () => renderer,
  });
}

test("browser host delegates measure cursor only after a successful render", async () => {
  const renderer = new CursorRenderer();
  const host = createHost(renderer);

  await assert.rejects(
    () => host.moveCursor({ partId: "P1", measureIndex: 0 }),
    BrowserScoreHostUnavailableError,
  );

  await host.renderMusicXml("<score-partwise></score-partwise>");
  const target = Object.freeze({ partId: "P1", measureIndex: 3 });
  await host.moveCursor(target);

  assert.deepEqual(renderer.moves, [target]);
});

test("browser host fails closed when renderer lacks cursor capability", async () => {
  const renderer = new CursorRenderer({
    capabilities: new Set(["musicxml-render", "svg-export"]),
  });
  const host = createHost(renderer);

  await host.renderMusicXml("<score-partwise></score-partwise>");
  await assert.rejects(
    () => host.moveCursor({ partId: "P1", measureIndex: 0 }),
    BrowserScoreHostUnavailableError,
  );
  assert.deepEqual(renderer.moves, []);
});

test("disposed browser host rejects cursor movement", async () => {
  const renderer = new CursorRenderer();
  const host = createHost(renderer);

  await host.renderMusicXml("<score-partwise></score-partwise>");
  await host.dispose();
  await assert.rejects(
    () => host.moveCursor({ partId: "P1", measureIndex: 0 }),
    BrowserScoreHostUnavailableError,
  );
});
