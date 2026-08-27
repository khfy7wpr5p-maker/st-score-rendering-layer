import test from "node:test";
import assert from "node:assert/strict";
import { OsmdRenderer } from "../packages/adapter-osmd/dist/index.js";

function createHarness() {
  const calls = { loaded: [], options: [], renders: 0, replaced: 0 };
  const engine = {
    async load(content) { calls.loaded.push(content); },
    setOptions(options) { calls.options.push(options); },
    render() { calls.renders += 1; },
  };
  const container = {
    querySelectorAll() { return [{ outerHTML: "<svg id=\"a\"></svg>" }]; },
    replaceChildren() { calls.replaced += 1; },
  };
  const renderer = new OsmdRenderer(container, () => engine);
  return { calls, renderer };
}

test("OSMD adapter exposes only R2-tested capabilities", () => {
  const { renderer } = createHarness();
  assert.equal(renderer.capabilities.has("musicxml-render"), true);
  assert.equal(renderer.capabilities.has("svg-export"), true);
  assert.equal(renderer.capabilities.has("tablature"), false);
});

test("OSMD adapter maps render options after load", async () => {
  const { renderer, calls } = createHarness();
  await renderer.load({ kind: "musicxml", content: "<score-partwise/>" });
  const result = await renderer.render({ pageMode: "page", drawTitle: false });
  assert.equal(calls.loaded[0], "<score-partwise/>");
  assert.equal(calls.renders, 1);
  assert.equal(calls.options[0].pageFormat, "A4 P");
  assert.equal(calls.options[0].drawTitle, false);
  assert.deepEqual(result, { rendererId: "osmd", contractVersion: "0.1.0" });
});

test("OSMD adapter refuses render before load", async () => {
  const { renderer } = createHarness();
  await assert.rejects(() => renderer.render(), /must be loaded/);
});

test("OSMD adapter exports SVG and disposes target", async () => {
  const { renderer, calls } = createHarness();
  assert.deepEqual(await renderer.exportSvg(), ["<svg id=\"a\"></svg>"]);
  await renderer.dispose();
  assert.equal(calls.replaced, 1);
});
