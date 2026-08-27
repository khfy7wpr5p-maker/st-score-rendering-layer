import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAX_MUSICXML_BYTES, InvalidScoreSourceError, RendererRegistry, validateScoreSource } from "../packages/renderer-core/dist/index.js";

test("validateScoreSource accepts in-memory MusicXML", () => {
  assert.doesNotThrow(() => validateScoreSource({ kind: "musicxml", content: "<score-partwise/>" }));
});
test("validateScoreSource rejects empty content", () => {
  assert.throws(() => validateScoreSource({ kind: "musicxml", content: "  " }), InvalidScoreSourceError);
});
test("validateScoreSource rejects NUL bytes", () => {
  assert.throws(() => validateScoreSource({ kind: "musicxml", content: "<score>\u0000</score>" }), InvalidScoreSourceError);
});
test("validateScoreSource enforces a byte limit", () => {
  const content = "x".repeat(DEFAULT_MAX_MUSICXML_BYTES + 1);
  assert.throws(() => validateScoreSource({ kind: "musicxml", content }), InvalidScoreSourceError);
});
test("RendererRegistry rejects duplicate renderer ids", () => {
  const registry = new RendererRegistry();
  const renderer = {
    id: "fake", capabilities: new Set(), load: async () => {},
    render: async () => ({ rendererId: "fake", contractVersion: "0.1.0" }), exportSvg: async () => [],
    highlight: async () => {}, clearHighlights: async () => {}, moveCursor: async () => {},
    setPartVisible: async () => {}, dispose: async () => {},
  };
  registry.register(renderer);
  assert.throws(() => registry.register(renderer), /already registered/);
});
