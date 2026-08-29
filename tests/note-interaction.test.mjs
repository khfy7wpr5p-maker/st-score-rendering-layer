import assert from "node:assert/strict";
import test from "node:test";

import { OsmdRenderer } from "../packages/adapter-osmd/dist/index.js";

function createElement(name, parentElement = null) {
  const classes = new Set();
  const attrs = new Map();
  return {
    name,
    parentElement,
    classList: {
      add(value) { classes.add(value); },
      remove(value) { classes.delete(value); },
      contains(value) { return classes.has(value); },
    },
    setAttribute(key, value) { attrs.set(key, value); },
    removeAttribute(key) { attrs.delete(key); },
    getAttribute(key) { return attrs.get(key) ?? null; },
  };
}

function graphicalNote(element, { rest = false } = {}) {
  return {
    vfnoteIndex: 0,
    sourceNote: { isRest() { return rest; } },
    getSVGGElement() { return element; },
    getNoteheadSVGs() { return [element]; },
  };
}

function createInteractionHarness({ ambiguousChord = false, includeRest = false } = {}) {
  let hitElement = null;
  const styleNodes = [];
  const container = createElement("container");
  const document = {
    defaultView: { Element: Object },
    elementFromPoint() { return hitElement; },
    createElement() {
      const attrs = new Map();
      return {
        textContent: "",
        setAttribute(name, value) { attrs.set(name, value); },
        getAttribute(name) { return attrs.get(name) ?? null; },
      };
    },
  };
  container.ownerDocument = document;
  container.querySelector = (selector) => selector === "style[data-st-score-highlight-style]" ? styleNodes[0] ?? null : null;
  container.querySelectorAll = (selector) => selector === "svg" ? [{ outerHTML: "<svg></svg>" }] : [];
  container.prepend = (node) => styleNodes.unshift(node);
  container.replaceChildren = () => {};

  const p1v1n0 = createElement("p1-v1-n0", container);
  const p1v1n1 = ambiguousChord ? p1v1n0 : createElement("p1-v1-n1", container);
  const p1v2n0 = createElement("p1-v2-n0", container);
  const p1staff2v1n2 = createElement("p1-staff2-v1-n2", container);
  const p2v1n0 = createElement("p2-v1-n0", container);
  const restElement = createElement("rest", container);
  const whitespace = createElement("whitespace", container);
  const outside = createElement("outside", null);

  const voice1Notes = [graphicalNote(p1v1n0), graphicalNote(p1v1n1)];
  if (includeRest) voice1Notes.push(graphicalNote(restElement, { rest: true }));
  const staff0 = {
    staffEntries: [
      { graphicalVoiceEntries: [{ parentVoiceEntry: { ParentVoice: { VoiceId: 1 } }, notes: voice1Notes }] },
      { graphicalVoiceEntries: [{ parentVoiceEntry: { ParentVoice: { VoiceId: 2 } }, notes: [graphicalNote(p1v2n0)] }] },
      { graphicalVoiceEntries: [] },
    ],
  };
  const staff1 = { staffEntries: [{ graphicalVoiceEntries: [{ parentVoiceEntry: { ParentVoice: { VoiceId: 1 } }, notes: [graphicalNote(p1staff2v1n2)] }] }] };
  const staff2 = { staffEntries: [{ graphicalVoiceEntries: [{ parentVoiceEntry: { ParentVoice: { VoiceId: 1 } }, notes: [graphicalNote(p2v1n0)] }] }] };

  const engine = {
    Sheet: {
      Instruments: [
        { IdString: "P1", Visible: true, Staves: [{ idInMusicSheet: 1 }, { idInMusicSheet: 0 }] },
        { IdString: "P2", Visible: true, Staves: [{ idInMusicSheet: 2 }] },
      ],
      SourceMeasures: [{}],
    },
    graphic: { measureList: [[staff0, staff1, staff2]] },
    async load() {}, setOptions() {}, render() {}, updateGraphic() {},
  };
  const renderer = new OsmdRenderer(container, () => engine);
  return {
    renderer, engine,
    elements: { p1v1n0, p1v1n1, p1v2n0, p1staff2v1n2, p2v1n0, restElement, whitespace, outside },
    hit(element) { hitElement = element; },
  };
}

async function renderHarness(harness) {
  await harness.renderer.load({ kind: "musicxml", content: "<score-partwise/>" });
  await harness.renderer.render({ autoResize: false });
}

test("note hit-test follows deterministic part/staff/voice/chord traversal", async () => {
  const harness = createInteractionHarness();
  await renderHarness(harness);
  const cases = [
    [harness.elements.p1v1n0, { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 }],
    [harness.elements.p1v1n1, { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 1 }],
    [harness.elements.p1v2n0, { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 2 }],
    [harness.elements.p1staff2v1n2, { partId: "P1", measureIndex: 0, noteIndex: 2, voice: 1 }],
    [harness.elements.p2v1n0, { partId: "P2", measureIndex: 0, noteIndex: 0, voice: 1 }],
  ];
  for (const [element, expected] of cases) {
    harness.hit(element);
    assert.deepEqual(harness.renderer.resolveNoteAtClientPoint({ clientX: 10, clientY: 20 }), expected);
  }
  harness.hit(harness.elements.whitespace);
  assert.equal(harness.renderer.resolveNoteAtClientPoint({ clientX: 10, clientY: 20 }), null);
  harness.hit(harness.elements.outside);
  assert.equal(harness.renderer.resolveNoteAtClientPoint({ clientX: 10, clientY: 20 }), null);
  harness.hit(null);
  assert.equal(harness.renderer.resolveNoteAtClientPoint({ clientX: 10, clientY: 20 }), null);
});

test("same render and repeated render preserve the same ScoreNoteRef", async () => {
  const harness = createInteractionHarness();
  await renderHarness(harness);
  harness.hit(harness.elements.p1staff2v1n2);
  const first = harness.renderer.resolveNoteAtClientPoint({ clientX: 1, clientY: 1 });
  assert.deepEqual(harness.renderer.resolveNoteAtClientPoint({ clientX: 1, clientY: 1 }), first);
  assert.equal(Object.isFrozen(first), true);
  await harness.renderer.render({ autoResize: false });
  assert.deepEqual(harness.renderer.resolveNoteAtClientPoint({ clientX: 1, clientY: 1 }), first);
});

test("duplicate exact notehead ownership fails closed instead of choosing first chord note", async () => {
  const harness = createInteractionHarness({ ambiguousChord: true });
  await renderHarness(harness);
  harness.hit(harness.elements.p1v1n0);
  assert.equal(harness.renderer.resolveNoteAtClientPoint({ clientX: 5, clientY: 5 }), null);
});

test("rests are excluded from exact notehead interaction", async () => {
  const harness = createInteractionHarness({ includeRest: true });
  await renderHarness(harness);
  harness.hit(harness.elements.restElement);
  assert.equal(harness.renderer.resolveNoteAtClientPoint({ clientX: 5, clientY: 5 }), null);
  assert.throws(
    () => harness.renderer.resolveRenderedNoteElement({ partId: "P1", measureIndex: 0, noteIndex: 2, voice: 1 }),
    /rest.*no notehead interaction target/i,
  );
});

test("hit-test never guesses nearest notes and rejects non-finite coordinates", async () => {
  const harness = createInteractionHarness();
  await renderHarness(harness);
  harness.hit(harness.elements.whitespace);
  assert.equal(harness.renderer.resolveNoteAtClientPoint({ clientX: 100, clientY: 100 }), null);
  assert.throws(() => harness.renderer.resolveNoteAtClientPoint({ clientX: Number.NaN, clientY: 0 }), /finite number/);
  assert.throws(() => harness.renderer.resolveNoteAtClientPoint({ clientX: 0, clientY: Number.POSITIVE_INFINITY }), /finite number/);
});

test("highlight targets the exact locator and clear removes only renderer-owned state", async () => {
  const harness = createInteractionHarness();
  await renderHarness(harness);
  const target = { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 1 };
  harness.elements.p1v1n1.classList.add("consumer-owned");
  await harness.renderer.highlight({ target, className: "teacher-focus" });
  assert.equal(harness.elements.p1v1n1.classList.contains("teacher-focus"), true);
  assert.equal(harness.elements.p1v1n1.classList.contains("consumer-owned"), true);
  assert.equal(harness.elements.p1v1n0.classList.contains("teacher-focus"), false);
  await harness.renderer.clearHighlights();
  assert.equal(harness.elements.p1v1n1.classList.contains("teacher-focus"), false);
  assert.equal(harness.elements.p1v1n1.classList.contains("consumer-owned"), true);
});

test("rerender drops stale DOM hit-test ownership", async () => {
  const harness = createInteractionHarness();
  await renderHarness(harness);
  const oldElement = harness.elements.p1v1n0;
  const freshElement = createElement("fresh-note", oldElement.parentElement);
  harness.engine.graphic.measureList[0][0].staffEntries[0].graphicalVoiceEntries[0].notes = [graphicalNote(freshElement)];
  await harness.renderer.render({ autoResize: false });
  harness.hit(oldElement);
  assert.equal(harness.renderer.resolveNoteAtClientPoint({ clientX: 1, clientY: 1 }), null);
  harness.hit(freshElement);
  assert.deepEqual(harness.renderer.resolveNoteAtClientPoint({ clientX: 1, clientY: 1 }), { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 });
});
