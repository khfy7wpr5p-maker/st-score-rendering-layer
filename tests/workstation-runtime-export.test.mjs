import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { exportWorkstationRuntime } from "../scripts/export-workstation-runtime.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputName = "workstation-runtime-test";
const outputRoot = path.join(repoRoot, "dist", outputName);

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(outputRoot, relativePath), "utf8"));
}

test("Workstation runtime export is local, integrity-described, and vendor-contained", async () => {
  await rm(outputRoot, { recursive: true, force: true });
  try {
    const revision = "0123456789abcdef0123456789abcdef01234567";
    const result = await exportWorkstationRuntime({ outputName, sourceRevision: revision });
    assert.equal(result.destinationRoot, outputRoot);

    const manifest = await readJson("runtime-manifest.json");
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.rendererSourceRevision, revision);
    assert.equal(manifest.scoreRendererContractVersion, "0.2.0");
    assert.equal(manifest.vendor.opensheetmusicdisplay.version, "2.1.2");
    assert.equal(manifest.vendor.opensheetmusicdisplay.license, "BSD-3-Clause");
    assert.ok(manifest.files.length >= 10);

    const paths = new Set(manifest.files.map((entry) => entry.path));
    for (const required of [
      "index.html",
      "workstation-bootstrap.mjs",
      "modules/contracts.js",
      "modules/renderer-core.js",
      "modules/adapter-osmd.js",
      "modules/browser-host.js",
      "modules/osmd-module-shim.mjs",
      "vendor/opensheetmusicdisplay.min.js",
      "licenses/opensheetmusicdisplay-BSD-3-Clause.txt",
      "THIRD_PARTY_NOTICES.md",
    ]) {
      assert.ok(paths.has(required), `missing runtime asset ${required}`);
    }

    for (const entry of manifest.files) {
      assert.match(entry.sha256, /^[0-9a-f]{64}$/);
      assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes > 0);
    }

    const html = await readFile(path.join(outputRoot, "index.html"), "utf8");
    assert.match(html, /connect-src 'none'/);
    assert.doesNotMatch(html, /https?:\/\//i);
    assert.match(html, /vendor\/opensheetmusicdisplay\.min\.js/);

    const bootstrap = await readFile(path.join(outputRoot, "workstation-bootstrap.mjs"), "utf8");
    assert.match(bootstrap, /__ST_WORKSTATION_SCORE_SHELL__/);
    assert.match(bootstrap, /__ST_SCORE_RENDER_HOST__/);
    assert.match(bootstrap, /st-score-host-ready/);
    assert.doesNotMatch(bootstrap, /fetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//i);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("Workstation runtime export rejects unsafe output names and malformed revisions", async () => {
  await assert.rejects(
    () => exportWorkstationRuntime({ outputName: "../escape" }),
    /simple bounded directory name/,
  );
  await assert.rejects(
    () => exportWorkstationRuntime({ outputName: "workstation-runtime-bad-revision", sourceRevision: "main" }),
    /40-character lowercase Git SHA/,
  );
});
