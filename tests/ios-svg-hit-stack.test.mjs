import assert from "node:assert/strict";
import test from "node:test";

import { OsmdRenderer } from "../packages/adapter-osmd/dist/index.js";

function element(name, parentElement = null) {
  return {
    name,
    parentElement,
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {},
    removeAttribute() {},
  };
}

function graphicalNote(notehead, group) {
  return {
    vfnoteIndex: 0,
    sourceNote: { isRest() { return false; } },
    getSVGGElement() { return group; },
    getNoteheadSVGs() { return [notehead]; },
  };
}

function createHarness() {
  let initial = null;
  let stack = [];
  const container = element("container");
  const document = {
    defaultView: { Element: Object },
    elementFromPoint() { return initial; },
    elementsFromPoint() { return stack; },
    createElement() { return { setAttribute() {}, textContent: "" }; },
  };
  container.ownerDocument = document;
  container.querySelector = () => null;
  container.querySelectorAll = () => [];
  container.prepend = () => {};
  container.replaceChildren = () => {};

  const overlay = element("ios-svg-overlay", container);
  const groupA = element("group-a", container);
  const noteA = element("note-a", groupA);
  const groupB = element("group-b", container);
  const noteB = element("note-b", groupB);

  const engine = {
    Sheet: {
      Instruments: [{ IdString: "P1", Visible: true, Staves: [{ idInMusicSheet: 0 }] }],
      SourceMeasures: [{}],
    },
    graphic: {
      measureList: [[{
        staffEntries: [{
          graphicalVoiceEntries: [{
            parentVoiceEntry: { ParentVoice: { VoiceId: 1 } },
            notes: [graphicalNote(noteA, groupA), graphicalNote(noteB, groupB)],
          }],
        }],
      }]],
    },
    async load() {},
    setOptions() {},
    render() {},
    updateGraphic() {},
  };

  return {
    renderer: new OsmdRenderer(container, () => engine),
    elements: { overlay, noteA, noteB },
    point(top, elements) {
      initial = top;
      stack = elements;
    },
  };
}

async function render(harness) {
  await harness.renderer.load({ kind: "musicxml", content: "<score-partwise/>" });
  await harness.renderer.render({ autoResize: false });
}

test("iOS-style unmapped top SVG element can expose one exact note owner lower in the same point stack", async () => {
  const harness = createHarness();
  await render(harness);
  harness.point(harness.elements.overlay, [harness.elements.overlay, harness.elements.noteA]);
  assert.deepEqual(harness.renderer.resolveNoteAtClientPointDetailed({ clientX: 10, clientY: 20 }), {
    kind: "HIT",
    target: { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 },
  });
});

test("hit stack never guesses when the same point exposes different exact note owners", async () => {
  const harness = createHarness();
  await render(harness);
  harness.point(harness.elements.overlay, [harness.elements.overlay, harness.elements.noteA, harness.elements.noteB]);
  assert.deepEqual(harness.renderer.resolveNoteAtClientPointDetailed({ clientX: 10, clientY: 20 }), {
    kind: "MISS",
    reason: "AMBIGUOUS_OWNERSHIP",
  });
});

test("hit stack remains fail-closed when every in-container element is unmapped", async () => {
  const harness = createHarness();
  await render(harness);
  harness.point(harness.elements.overlay, [harness.elements.overlay]);
  assert.deepEqual(harness.renderer.resolveNoteAtClientPointDetailed({ clientX: 10, clientY: 20 }), {
    kind: "MISS",
    reason: "UNMAPPED_ELEMENT",
  });
});
