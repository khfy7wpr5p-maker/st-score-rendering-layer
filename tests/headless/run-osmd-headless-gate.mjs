import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  OsmdHeadlessRenderer,
  digestSvgPages,
} from "../../packages/adapter-osmd-headless/dist/index.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(directory, "r6-guitar-tab.musicxml");
const baselinePath = path.join(directory, "golden-r6.json");
const source = { kind: "musicxml", content: readFileSync(fixturePath, "utf8") };
const renderer = new OsmdHeadlessRenderer({ noSandbox: process.env.CI === "true" });

await renderer.load(source);
const firstResult = await renderer.render({ drawTitle: true, drawComposer: false, pageMode: "continuous" });
const firstPages = await renderer.exportSvg();
const firstDigest = digestSvgPages(firstPages);

const secondResult = await renderer.render({ drawTitle: true, drawComposer: false, pageMode: "continuous" });
const secondPages = await renderer.exportSvg();
const secondDigest = digestSvgPages(secondPages);

assert.deepEqual(firstResult, { rendererId: "osmd-headless", contractVersion: "0.2.0" });
assert.deepEqual(secondResult, firstResult);
assert.equal(firstDigest, secondDigest, "Headless SVG must be deterministic across repeated renders in the same runtime.");
assert.equal(firstPages.length, 1, "R6 fixture must render as exactly one SVG page.");
const rendered = firstPages.join("\n");
assert.match(rendered, /R6-GOLDEN/, "The committed fixture title must survive into headless SVG output.");
assert.match(rendered, />\s*7\s*</, "TAB fret 7 must render in headless SVG output.");
assert.match(rendered, />\s*12\s*</, "TAB fret 12 must render in headless SVG output.");

console.log(`R6_VISUAL_DIGEST=${firstDigest}`);

if (!existsSync(baselinePath)) {
  console.error("R6 visual baseline is intentionally missing. Capture the printed digest, review it, commit golden-r6.json, and rerun CI.");
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
assert.equal(baseline.fixture, "r6-guitar-tab.musicxml");
assert.equal(baseline.osmdVersion, "2.1.2");
assert.equal(baseline.digest, firstDigest, "R6 visual digest changed; review the SVG before updating the baseline.");

await renderer.dispose();
console.log("R6 headless + visual regression gate PASS");
