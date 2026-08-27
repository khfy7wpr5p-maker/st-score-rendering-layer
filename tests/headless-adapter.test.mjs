import test from "node:test";
import assert from "node:assert/strict";
import {
  OsmdHeadlessRenderer,
  digestSvgPages,
} from "../packages/adapter-osmd-headless/dist/index.js";

const SOURCE = { kind: "musicxml", content: "<score-partwise/>" };

test("headless adapter exposes only proven non-interactive capabilities", () => {
  const renderer = new OsmdHeadlessRenderer({ host: () => ["<svg></svg>"] });
  for (const capability of ["musicxml-render", "svg-export", "tablature", "headless"]) {
    assert.equal(renderer.capabilities.has(capability), true);
  }
  for (const capability of ["cursor", "note-highlight", "part-visibility"]) {
    assert.equal(renderer.capabilities.has(capability), false);
  }
});

test("headless adapter validates load, delegates render and exports immutable copies", async () => {
  const requests = [];
  const renderer = new OsmdHeadlessRenderer({
    host(request) {
      requests.push(request);
      return ["<svg><text>7</text></svg>"];
    },
  });
  await renderer.load(SOURCE);
  const result = await renderer.render({ drawTitle: false, pageMode: "continuous" });
  assert.deepEqual(result, { rendererId: "osmd-headless", contractVersion: "0.2.0" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].source.content, SOURCE.content);
  assert.equal(requests[0].options.drawTitle, false);
  assert.deepEqual(await renderer.exportSvg(), ["<svg><text>7</text></svg>"]);
});

test("headless adapter fails closed before render and for interactive methods", async () => {
  const renderer = new OsmdHeadlessRenderer({ host: () => ["<svg></svg>"] });
  await assert.rejects(() => renderer.render(), /must be loaded/);
  await assert.rejects(() => renderer.exportSvg(), /must be rendered/);
  await renderer.load(SOURCE);
  await renderer.render();
  await assert.rejects(() => renderer.highlight({ target: { partId: "P1", measureIndex: 0, noteIndex: 0 } }), /not supported/);
  await assert.rejects(() => renderer.clearHighlights(), /not supported/);
  await assert.rejects(() => renderer.moveCursor({ partId: "P1", measureIndex: 0 }), /not supported/);
  await assert.rejects(() => renderer.setPartVisible({ partId: "P1" }, false), /not supported/);
});

test("visual digest is deterministic and change-sensitive", () => {
  const pages = ["<svg><text>R6</text></svg>"];
  assert.equal(digestSvgPages(pages), digestSvgPages([...pages]));
  assert.notEqual(digestSvgPages(pages), digestSvgPages(["<svg><text>R6x</text></svg>"]));
  assert.throws(() => digestSvgPages([]), /At least one SVG page/);
});
