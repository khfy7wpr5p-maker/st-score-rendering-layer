import test from "node:test";
import assert from "node:assert/strict";
import { ScoreAccessibilityBridge } from "../packages/accessibility/dist/index.js";

function createElement(initial = {}) {
  const attrs = new Map(Object.entries(initial));
  return {
    focusCount: 0,
    hasAttribute(name) { return attrs.has(name); },
    getAttribute(name) { return attrs.get(name) ?? null; },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    removeAttribute(name) { attrs.delete(name); },
    focus() { this.focusCount += 1; },
  };
}

const note0 = { partId: "P1", measureIndex: 0, noteIndex: 0, voice: 1 };
const note1 = { partId: "P1", measureIndex: 0, noteIndex: 1, voice: 1 };

test("R7 accessibility bridge applies ST semantic labels and ordered focus", () => {
  const first = createElement();
  const second = createElement();
  const bridge = new ScoreAccessibilityBridge((target) => target.noteIndex === 0 ? first : second);

  const result = bridge.apply([
    { target: note0, label: "Do dörtlük, birinci ölçü" },
    { target: note1, label: "Re dörtlük, birinci ölçü" },
  ]);

  assert.deepEqual(result, { count: 2 });
  assert.equal(bridge.size, 2);
  assert.equal(first.getAttribute("aria-label"), "Do dörtlük, birinci ölçü");
  assert.equal(first.getAttribute("role"), "img");
  assert.equal(first.getAttribute("tabindex"), "0");
  assert.equal(first.getAttribute("data-st-score-a11y"), "true");

  assert.equal(bridge.focusNext(), true);
  assert.equal(first.focusCount, 1);
  assert.equal(bridge.focusNext(), true);
  assert.equal(second.focusCount, 1);
  assert.equal(bridge.focusNext(), false);
  assert.equal(bridge.focusPrevious(), true);
  assert.equal(first.focusCount, 2);
  bridge.focus(note1);
  assert.equal(second.focusCount, 2);
});

test("R7 accessibility bridge is transactional when a rendered target is missing", () => {
  const first = createElement({ "aria-label": "existing" });
  const bridge = new ScoreAccessibilityBridge((target) => target.noteIndex === 0 ? first : undefined);

  assert.throws(
    () => bridge.apply([
      { target: note0, label: "Do" },
      { target: note1, label: "Re" },
    ]),
    /could not be resolved/,
  );
  assert.equal(first.getAttribute("aria-label"), "existing");
  assert.equal(first.getAttribute("data-st-score-a11y"), null);
  assert.equal(bridge.size, 0);
});

test("R7 accessibility bridge rejects duplicate targets, shared DOM targets and unsafe labels", () => {
  const element = createElement();
  const bridge = new ScoreAccessibilityBridge(() => element);

  assert.throws(
    () => bridge.apply([
      { target: note0, label: "Do" },
      { target: note0, label: "Do again" },
    ]),
    /Duplicate accessibility target/,
  );
  assert.throws(
    () => bridge.apply([
      { target: note0, label: "Do" },
      { target: note1, label: "Re" },
    ]),
    /same rendered element/,
  );
  assert.throws(
    () => bridge.apply([{ target: note0, label: "bad\nlabel" }]),
    /control characters/,
  );
});

test("R7 accessibility clear restores pre-existing DOM accessibility state exactly", () => {
  const element = createElement({
    "aria-label": "original label",
    role: "graphics-symbol",
    tabindex: "5",
    "data-st-score-a11y": "consumer-owned",
  });
  const bridge = new ScoreAccessibilityBridge(() => element);

  bridge.apply([{ target: note0, label: "Temporary ST label", focusable: false }]);
  assert.equal(element.getAttribute("aria-label"), "Temporary ST label");
  assert.equal(element.getAttribute("role"), "img");
  assert.equal(element.getAttribute("tabindex"), "-1");
  assert.equal(element.getAttribute("data-st-score-a11y"), "true");

  bridge.clear();
  assert.equal(element.getAttribute("aria-label"), "original label");
  assert.equal(element.getAttribute("role"), "graphics-symbol");
  assert.equal(element.getAttribute("tabindex"), "5");
  assert.equal(element.getAttribute("data-st-score-a11y"), "consumer-owned");
  assert.equal(bridge.size, 0);
});

test("R7 accessibility bridge bounds semantic-map size", () => {
  const bridge = new ScoreAccessibilityBridge(() => createElement(), { maxEntries: 1 });
  assert.throws(
    () => bridge.apply([
      { target: note0, label: "Do" },
      { target: note1, label: "Re" },
    ]),
    /exceeds the configured 1-target limit/,
  );
});
