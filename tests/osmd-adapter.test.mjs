import test from "node:test";
import assert from "node:assert/strict";
import { OsmdRenderer } from "../packages/adapter-osmd/dist/index.js";

function createDomElement() {
  const classes = new Set();
  const attrs = new Map();
  return {
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      contains(value) { return classes.has(value); },
    },
    setAttribute(name, value) { attrs.set(name, value); },
    removeAttribute(name) { attrs.delete(name); },
    getAttribute(name) { return attrs.get(name) ?? null; },
  };
}

function createHarness() {
  const calls = {
    loaded: [], options: [], renders: 0, replaced: 0, prepended: 0,
    cursorReset: 0, cursorShow: 0, nextMeasure: 0, updateGraphic: 0,
  };
  const noteElement = createDomElement();
  const note = { getSVGGElement() { return noteElement; } };
  const graphicalMeasure = {
    staffEntries: [{
      graphicalVoiceEntries: [{
        parentVoiceEntry: { ParentVoice: { VoiceId: 1 } },
        notes: [note],
      }],
    }],
  };
  const cursor = {
    iterator: { CurrentMeasureIndex: 0 },
    reset() { calls.cursorReset += 1; this.iterator.CurrentMeasureIndex = 0; },
    show() { calls.cursorShow += 1; },
    next() { this.iterator.CurrentMeasureIndex += 1; },
    nextMeasure() { calls.nextMeasure += 1; this.iterator.CurrentMeasureIndex += 1; },
  };
  const instruments = [
    { IdString: "P1", Visible: true, Staves: [{ idInMusicSheet: 0 }] },
    { IdString: "P2", Visible: true, Staves: [{ idInMusicSheet: 1 }] },
  ];
  const engine = {
    cursor,
    Sheet: { Instruments: instruments, SourceMeasures: [{}, {}] },
    graphic: { measureList: [[graphicalMeasure, graphicalMeasure], [graphicalMeasure, graphicalMeasure]] },
    async load(content) { calls.loaded.push(content); },
    setOptions(options) { calls.options.push(options); },
    render() { calls.renders += 1; },
    updateGraphic() { calls.updateGraphic += 1; },
  };
  const styleNodes = [];
  const container = {
    ownerDocument: {
      createElement() {
        const attrs = new Map();
        return {
          textContent: "",
          setAttribute(name, value) { attrs.set(name, value); },
          getAttribute(name) { return attrs.get(name) ?? null; },
        };
      },
    },
    querySelector(selector) {
      if (selector === "style[data-st-score-highlight-style]") return styleNodes[0] ?? null;
      return null;
    },
    querySelectorAll(selector) {
      return selector === "svg" ? [{ outerHTML: "<svg id=\"a\"></svg>" }] : [];
    },
    prepend(node) { styleNodes.unshift(node); calls.prepended += 1; },
    replaceChildren() { calls.replaced += 1; },
  };
  const renderer = new OsmdRenderer(container, () => engine);
  return { calls, cursor, engine, instruments, noteElement, renderer };
}

async function loadAndRender(renderer) {
  await renderer.load({ kind: "musicxml", content: "<score-partwise/>" });
  return renderer.render();
}

test("OSMD adapter exposes only capabilities proven through R5", () => {
  const { renderer } = createHarness();
  for (const capability of ["musicxml-render", "svg-export", "cursor", "note-highlight", "part-visibility", "tablature"]) {
    assert.equal(renderer.capabilities.has(capability), true);
  }
  assert.equal(renderer.capabilities.has("headless"), false);
});

test("OSMD adapter maps render options after load", async () => {
  const { renderer, calls } = createHarness();
  await renderer.load({ kind: "musicxml", content: "<score-partwise/>" });
  const result = await renderer.render({ pageMode: "page", drawTitle: false });
  assert.equal(calls.loaded[0], "<score-partwise/>");
  assert.equal(calls.renders, 1);
  assert.equal(calls.options[0].pageFormat, "A4 P");
  assert.equal(calls.options[0].drawTitle, false);
  assert.deepEqual(result, { rendererId: "osmd", contractVersion: "0.2.0" });
});

test("OSMD adapter refuses render before load", async () => {
  const { renderer } = createHarness();
  await assert.rejects(() => renderer.render(), /must be loaded/);
});

test("R4 cursor moves to a validated measure", async () => {
  const { renderer, cursor, calls } = createHarness();
  await loadAndRender(renderer);
  await renderer.moveCursor({ partId: "P1", measureIndex: 1 });
  assert.equal(cursor.iterator.CurrentMeasureIndex, 1);
  assert.equal(calls.cursorReset, 1);
  assert.equal(calls.cursorShow, 1);
  assert.equal(calls.nextMeasure, 1);
  await assert.rejects(() => renderer.moveCursor({ partId: "P1", measureIndex: 2 }), /outside the loaded score/);
});

test("R4 highlight adds and clears a safe SVG marker without changing source colors", async () => {
  const { renderer, noteElement, calls } = createHarness();
  await loadAndRender(renderer);
  await renderer.highlight({ target: { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 } });
  assert.equal(noteElement.classList.contains("st-score-highlight"), true);
  assert.equal(noteElement.getAttribute("data-st-score-highlight"), "true");
  assert.equal(calls.prepended, 1);
  await renderer.clearHighlights();
  assert.equal(noteElement.classList.contains("st-score-highlight"), false);
  assert.equal(noteElement.getAttribute("data-st-score-highlight"), null);
});

test("R4 highlight rejects unsafe class names and unresolved notes", async () => {
  const { renderer } = createHarness();
  await loadAndRender(renderer);
  await assert.rejects(
    () => renderer.highlight({ target: { partId: "P1", measureIndex: 0, noteIndex: 0 }, className: "bad class" }),
    /safe CSS class token/,
  );
  await assert.rejects(
    () => renderer.highlight({ target: { partId: "P1", measureIndex: 0, noteIndex: 99 } }),
    /was not found/,
  );
});

test("R4 part visibility uses stable Instrument.IdString and rebuilds the graphic", async () => {
  const { renderer, instruments, calls } = createHarness();
  await loadAndRender(renderer);
  await renderer.setPartVisible({ partId: "P2" }, false);
  assert.equal(instruments[1].Visible, false);
  assert.equal(calls.updateGraphic, 1);
  assert.equal(calls.renders, 2);
  await assert.rejects(() => renderer.setPartVisible({ partId: "missing" }, false), /was not found/);
});

test("OSMD adapter exports SVG and disposes target", async () => {
  const { renderer, calls } = createHarness();
  assert.deepEqual(await renderer.exportSvg(), ["<svg id=\"a\"></svg>"]);
  await renderer.dispose();
  assert.equal(calls.replaced, 1);
});
