import assert from "node:assert/strict";
import test from "node:test";

import { OsmdRenderer } from "../packages/adapter-osmd/dist/index.js";
import { BrowserScoreHost } from "../packages/browser-host/dist/index.js";

function createElement(name, parentElement = null) {
  return { name, parentElement, classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} };
}

function graphicalNote(element, { rest = false, group = element } = {}) {
  return {
    vfnoteIndex: 0,
    sourceNote: { isRest() { return rest; } },
    getSVGGElement() { return group; },
    getNoteheadSVGs() { return [element]; },
  };
}

function createAdapterHarness() {
  let hitStack = [];
  const container = createElement("container");
  const noteGroup = createElement("note-group", container);
  const noteElement = createElement("note", noteGroup);
  const restGroup = createElement("rest-group", container);
  const restElement = createElement("rest-child", restGroup);
  const whitespace = createElement("whitespace", container);
  const outside = createElement("outside");
  const document = {
    defaultView: { Element: Object },
    elementFromPoint() { return hitStack[0] ?? null; },
    elementsFromPoint() { return hitStack; },
    createElement() { return { setAttribute() {}, textContent: "" }; },
  };
  container.ownerDocument = document;
  container.querySelector = () => null;
  container.querySelectorAll = () => [{ outerHTML: "<svg/>" }];
  container.prepend = () => {};
  container.replaceChildren = () => {};

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
            notes: [
              graphicalNote(noteElement, { group: noteGroup }),
              graphicalNote(restElement, { rest: true, group: restGroup }),
            ],
          }],
        }],
      }]],
    },
    async load() {},
    setOptions() {},
    render() {},
    updateGraphic() {},
  };
  const renderer = new OsmdRenderer(container, () => engine);
  return {
    renderer,
    elements: { noteElement, noteGroup, restElement, restGroup, whitespace, outside },
    stack(...elements) { hitStack = elements; },
  };
}

async function renderAdapter(harness) {
  await harness.renderer.load({ kind: "musicxml", content: "<score-partwise></score-partwise>" });
  await harness.renderer.render({ autoResize: false });
}

test("generic rendered event hit-test returns first-class NOTE and REST targets", async () => {
  const harness = createAdapterHarness();
  await renderAdapter(harness);

  harness.stack(harness.elements.noteElement);
  assert.deepEqual(harness.renderer.resolveRenderedEventAtClientPointDetailed({ clientX: 10, clientY: 20 }), {
    kind: "HIT",
    target: { kind: "NOTE", partId: "P1", measureIndex: 0, eventIndex: 0, voice: 1 },
  });

  harness.stack(harness.elements.restElement);
  assert.deepEqual(harness.renderer.resolveRenderedEventAtClientPointDetailed({ clientX: 10, clientY: 20 }), {
    kind: "HIT",
    target: { kind: "REST", partId: "P1", measureIndex: 0, eventIndex: 1, voice: 1 },
  });

  assert.deepEqual(harness.renderer.resolveNoteAtClientPointDetailed({ clientX: 10, clientY: 20 }), {
    kind: "MISS",
    reason: "NO_NOTE_OWNER",
  });
});

test("topmost REST cannot fall through to a lower NOTE in the iOS hit stack", async () => {
  const harness = createAdapterHarness();
  await renderAdapter(harness);
  harness.stack(harness.elements.restElement, harness.elements.noteElement);
  assert.deepEqual(harness.renderer.resolveRenderedEventAtClientPointDetailed({ clientX: 5, clientY: 5 }), {
    kind: "HIT",
    target: { kind: "REST", partId: "P1", measureIndex: 0, eventIndex: 1, voice: 1 },
  });
  assert.deepEqual(harness.renderer.resolveNoteAtClientPointDetailed({ clientX: 5, clientY: 5 }), {
    kind: "MISS",
    reason: "NO_NOTE_OWNER",
  });
});

test("generic rendered event hit-test remains fail-closed for unmapped and outside elements", async () => {
  const harness = createAdapterHarness();
  await renderAdapter(harness);
  harness.stack(harness.elements.whitespace);
  assert.deepEqual(harness.renderer.resolveRenderedEventAtClientPointDetailed({ clientX: 1, clientY: 1 }), {
    kind: "MISS",
    reason: "UNMAPPED_ELEMENT",
  });
  harness.stack(harness.elements.outside);
  assert.deepEqual(harness.renderer.resolveRenderedEventAtClientPointDetailed({ clientX: 1, clientY: 1 }), {
    kind: "MISS",
    reason: "OUTSIDE_RENDER_CONTAINER",
  });
});

function hostContainer() {
  return { replaceChildren() {} };
}

function genericRenderer(result) {
  return {
    capabilities: new Set(["musicxml-render", "svg-export"]),
    async load() {},
    async render() { return { rendererId: "fake", contractVersion: "0.2.0" }; },
    async exportSvg() { return []; },
    async highlight() {},
    async clearHighlights() {},
    async moveCursor() {},
    async setPartVisible() {},
    async dispose() {},
    resolveRenderedEventAtClientPointDetailed() { return result; },
  };
}

test("BrowserScoreHost binds generic rendered event evidence to current renderEpoch/sourceId", async () => {
  const renderer = genericRenderer({
    kind: "HIT",
    target: { kind: "REST", partId: "P1", measureIndex: 0, eventIndex: 2, voice: 1 },
  });
  const host = new BrowserScoreHost(hostContainer(), {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => renderer,
  });
  const rendered = await host.renderMusicXml("<score-partwise></score-partwise>", {}, "source:rest-test");
  const hit = host.hitTestRenderedEventDetailed({ clientX: 4, clientY: 9 });
  assert.equal(hit.kind, "HIT");
  assert.equal(hit.renderEpoch, rendered.renderEpoch);
  assert.equal(hit.sourceId, "source:rest-test");
  assert.deepEqual(hit.target, { kind: "REST", partId: "P1", measureIndex: 0, eventIndex: 2, voice: 1 });
});

test("BrowserScoreHost rejects malformed generic target evidence instead of leaking renderer objects", async () => {
  const renderer = genericRenderer({
    kind: "HIT",
    target: { kind: "REST", partId: "P1", measureIndex: 0, eventIndex: 0, leakedDom: {} },
  });
  const host = new BrowserScoreHost(hostContainer(), {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => renderer,
  });
  await host.renderMusicXml("<score-partwise></score-partwise>");
  assert.throws(
    () => host.hitTestRenderedEventDetailed({ clientX: 0, clientY: 0 }),
    /unsupported field 'leakedDom'/i,
  );
});
