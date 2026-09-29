import assert from "node:assert/strict";
import test from "node:test";

import { OsmdRenderer } from "../packages/adapter-osmd/dist/index.js";
import {
  BrowserScoreHost,
  BrowserScoreHostUnavailableError,
} from "../packages/browser-host/dist/index.js";

function node(name, parentElement = null) {
  const attrs = new Map();
  const classes = new Set();
  const children = [];
  const value = {
    name,
    parentElement,
    children,
    classList: {
      add(v) { classes.add(v); },
      remove(v) { classes.delete(v); },
      contains(v) { return classes.has(v); },
    },
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.get(k) ?? null; },
    removeAttribute(k) { attrs.delete(k); },
    appendChild(child) {
      child.parentElement = value;
      children.push(child);
      return child;
    },
    remove() {
      if (value.parentElement?.children) {
        const index = value.parentElement.children.indexOf(value);
        if (index >= 0) value.parentElement.children.splice(index, 1);
      }
      value.parentElement = null;
    },
  };
  if (parentElement?.children) parentElement.children.push(value);
  return value;
}

function measureHarness({ duplicatePageId = false } = {}) {
  const styles = [];
  const container = node("container");
  const page = node("page", container);
  page.id = "osmdSvgPage1";
  page.outerHTML = '<svg id="osmdSvgPage1"></svg>';
  const duplicate = duplicatePageId ? node("duplicate-page", container) : null;
  if (duplicate) {
    duplicate.id = "osmdSvgPage1";
    duplicate.outerHTML = '<svg id="osmdSvgPage1"></svg>';
  }
  const pages = duplicate ? [page, duplicate] : [page];

  const document = {
    defaultView: { Element: Object },
    createElement() {
      return {
        textContent: "",
        setAttribute() {},
        getAttribute() { return null; },
      };
    },
    createElementNS(_namespace, tagName) {
      const created = node(tagName);
      created.ownerDocument = document;
      return created;
    },
  };
  container.ownerDocument = document;
  page.ownerDocument = document;
  if (duplicate) duplicate.ownerDocument = document;

  container.querySelector = (selector) =>
    selector === 'style[data-st-score-highlight-style]' ? styles[0] ?? null : null;
  container.querySelectorAll = (selector) => {
    if (selector === "svg") return pages;
    const match = /^\[id="(osmdSvgPage-?\d+)"\]$/.exec(selector);
    return match ? pages.filter((candidate) => candidate.id === match[1]) : [];
  };
  container.prepend = (item) => styles.unshift(item);
  container.replaceChildren = () => {};

  const measure = {
    staffEntries: [],
    PositionAndShape: {
      AbsolutePosition: { x: 0, y: 0 },
      BorderLeft: 10,
      BorderRight: 20,
      BorderTop: 5,
      BorderBottom: 15,
    },
    ParentMusicSystem: { Parent: { PageNumber: 1 } },
  };
  const engine = {
    Sheet: {
      Instruments: [{ IdString: "P1", Visible: true, Staves: [{ idInMusicSheet: 0 }] }],
      SourceMeasures: [{}],
    },
    graphic: { measureList: [[measure]] },
    async load() {},
    setOptions() {},
    render() {},
    updateGraphic() {},
  };
  return { renderer: new OsmdRenderer(container, () => engine), page };
}

test("SES-106 OSMD measure highlight draws a reversible measure-level overlay without recoloring notes", async () => {
  const { renderer, page } = measureHarness();
  await renderer.load({ kind: "musicxml", content: "<score-partwise/>" });
  await renderer.render({ autoResize: false, pageMode: "page" });

  await renderer.highlightMeasure({
    target: { partId: "P1", measureIndex: 0 },
    className: "correction-suspect",
  });

  const overlays = page.children.filter((child) => child.getAttribute?.("data-st-score-measure-highlight") === "true");
  assert.equal(overlays.length, 1);
  assert.equal(overlays[0].classList.contains("correction-suspect"), true);
  assert.equal(overlays[0].getAttribute("x"), "100");
  assert.equal(overlays[0].getAttribute("y"), "50");
  assert.equal(overlays[0].getAttribute("width"), "100");
  assert.equal(overlays[0].getAttribute("height"), "100");

  await renderer.clearHighlights();
  assert.equal(page.children.filter((child) => child.getAttribute?.("data-st-score-measure-highlight") === "true").length, 0);
});

test("SES-106 OSMD measure highlight fails closed when current page identity is ambiguous", async () => {
  const { renderer } = measureHarness({ duplicatePageId: true });
  await renderer.load({ kind: "musicxml", content: "<score-partwise/>" });
  await renderer.render({ autoResize: false, pageMode: "page" });
  await assert.rejects(
    () => renderer.highlightMeasure({ target: { partId: "P1", measureIndex: 0 } }),
    /geometry|page/i,
  );
});

function fakeBrowserRenderer({ includeMeasureHighlight = true } = {}) {
  const calls = [];
  const renderer = {
    id: "fake",
    capabilities: new Set(["musicxml-render", "svg-export", "note-highlight"]),
    async load() {},
    async render() { return { rendererId: "fake", contractVersion: "0.2.0" }; },
    async exportSvg() { return ["<svg></svg>"]; },
    async highlight() {},
    async clearHighlights() {},
    async moveCursor() {},
    async setPartVisible() {},
    async dispose() {},
  };
  if (includeMeasureHighlight) renderer.highlightMeasure = async (payload) => { calls.push(payload); };
  return { renderer, calls };
}

test("SES-106 BrowserScoreHost exposes additive measure highlight and fails closed when unavailable", async () => {
  const container = { replaceChildren() {} };
  const supported = fakeBrowserRenderer();
  const host = new BrowserScoreHost(container, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => supported.renderer,
  });
  await host.renderMusicXml("<score-partwise/>");
  await host.highlightMeasure({
    target: { partId: "P1", measureIndex: 0 },
    className: "correction-suspect",
  });
  assert.deepEqual(supported.calls, [{
    target: { partId: "P1", measureIndex: 0 },
    className: "correction-suspect",
  }]);

  const unsupported = fakeBrowserRenderer({ includeMeasureHighlight: false });
  const noCapabilityHost = new BrowserScoreHost({ replaceChildren() {} }, {
    expectedContractVersion: "0.2.0",
    rendererFactory: () => unsupported.renderer,
  });
  await noCapabilityHost.renderMusicXml("<score-partwise/>");
  await assert.rejects(
    () => noCapabilityHost.highlightMeasure({ target: { partId: "P1", measureIndex: 0 } }),
    BrowserScoreHostUnavailableError,
  );
});
