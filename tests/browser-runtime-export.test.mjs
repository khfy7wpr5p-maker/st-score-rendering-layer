import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { exportBrowserRuntime } from "../scripts/export-browser-runtime.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputName = "browser-runtime-export-test";
const outputRoot = path.join(repoRoot, "dist", outputName);

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

test("browser runtime is consumer-neutral and exposes bounded presentation interactions", async () => {
  await rm(outputRoot, { recursive: true, force: true });
  try {
    const result = await exportBrowserRuntime({
      outputName,
      sourceRevision: "0123456789abcdef0123456789abcdef01234567",
    });

    const bootstrapPath = path.join(outputRoot, "browser-bootstrap.mjs");
    const bootstrap = await readFile(bootstrapPath, "utf8");
    assert.match(bootstrap, /globalThis\.__ST_SCORE_RENDER_HOST__ = runtimeHost/);
    assert.match(bootstrap, /async moveCursor\(payload\)/);
    assert.match(bootstrap, /activeHost\.moveCursor\(\{ partId, measureIndex \}\)/);
    assert.match(bootstrap, /hitTestNote\(payload\)/);
    assert.match(bootstrap, /activeHost\.hitTestNote/);
    assert.match(bootstrap, /hitTestNoteDetailed\(payload\)/);
    assert.match(bootstrap, /activeHost\.hitTestNoteDetailed/);
    assert.match(bootstrap, /Detailed score note hit-test payload/);
    assert.match(bootstrap, /async highlight\(payload\)/);
    assert.match(bootstrap, /activeHost\.highlight/);
    assert.match(bootstrap, /async clearHighlights\(\)/);
    assert.match(bootstrap, /activeHost\.clearHighlights\(\)/);
    assert.match(bootstrap, /Object\.getPrototypeOf\(payload\)/);
    assert.match(bootstrap, /contains unsupported field/);
    assert.match(bootstrap, /st-score-render-host-ready/);
    assert.doesNotMatch(bootstrap, /__JUCE__|__ST_WORKSTATION_SCORE_SHELL__|emitNative/);
    assert.doesNotMatch(bootstrap, /graphic\.measureList|opensheetmusicdisplay/i);

    const indexHtml = await readFile(path.join(outputRoot, "index.html"), "utf8");
    assert.match(indexHtml, /\.\/browser-bootstrap\.mjs/);
    assert.doesNotMatch(indexHtml, /workstation-bootstrap\.mjs/);
    assert.match(indexHtml, /connect-src 'none'/);

    await assert.rejects(access(path.join(outputRoot, "workstation-bootstrap.mjs")));

    const manifest = JSON.parse(await readFile(path.join(outputRoot, "runtime-manifest.json"), "utf8"));
    assert.equal(manifest.runtimeTarget, "browser");
    assert.equal(manifest.scoreRendererContractVersion, "0.2.0");
    assert.equal(manifest.vendor.opensheetmusicdisplay.version, "2.1.2");
    assert.equal(manifest.files.some((entry) => entry.path === "workstation-bootstrap.mjs"), false);
    assert.doesNotMatch(JSON.stringify(manifest), /playwright/i);
    const bootstrapEntry = manifest.files.find((entry) => entry.path === "browser-bootstrap.mjs");
    assert.ok(bootstrapEntry);
    const bootstrapBytes = await readFile(bootstrapPath);
    assert.equal(bootstrapEntry.bytes, bootstrapBytes.byteLength);
    assert.equal(bootstrapEntry.sha256, sha256(bootstrapBytes));
    assert.equal(result.manifest.runtimeTarget, "browser");
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test("browser runtime manifest is byte-deterministic for the same source revision", async () => {
  const revision = "fedcba9876543210fedcba9876543210fedcba98";
  const firstName = "browser-runtime-determinism-a";
  const secondName = "browser-runtime-determinism-b";
  const firstRoot = path.join(repoRoot, "dist", firstName);
  const secondRoot = path.join(repoRoot, "dist", secondName);
  await rm(firstRoot, { recursive: true, force: true });
  await rm(secondRoot, { recursive: true, force: true });
  try {
    const first = await exportBrowserRuntime({ outputName: firstName, sourceRevision: revision });
    const second = await exportBrowserRuntime({ outputName: secondName, sourceRevision: revision });
    const firstManifest = await readFile(path.join(firstRoot, "runtime-manifest.json"), "utf8");
    const secondManifest = await readFile(path.join(secondRoot, "runtime-manifest.json"), "utf8");

    assert.equal(firstManifest, secondManifest);
    assert.deepEqual(first.manifest, second.manifest);
    assert.doesNotMatch(firstManifest, /playwright/i);
    assert.equal(first.manifest.rendererSourceRevision, revision);
  } finally {
    await rm(firstRoot, { recursive: true, force: true });
    await rm(secondRoot, { recursive: true, force: true });
  }
});
