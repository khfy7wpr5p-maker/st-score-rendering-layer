import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { exportWorkstationRuntimeWithCursor } from "../scripts/export-workstation-runtime-with-cursor.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputName = "workstation-runtime-cursor-test";
const outputRoot = path.join(repoRoot, "dist", outputName);

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

test("runtime host exposes only a bounded measure cursor bridge", async () => {
  await rm(outputRoot, { recursive: true, force: true });
  try {
    const result = await exportWorkstationRuntimeWithCursor({
      outputName,
      sourceRevision: "0123456789abcdef0123456789abcdef01234567",
    });
    const bootstrapPath = path.join(outputRoot, "workstation-bootstrap.mjs");
    const bootstrap = await readFile(bootstrapPath, "utf8");
    assert.match(bootstrap, /async moveCursor\(payload\)/);
    assert.match(bootstrap, /activeHost\.moveCursor\(\{ partId, measureIndex \}\)/);
    assert.match(bootstrap, /partId\.length > 128/);
    assert.match(bootstrap, /Number\.isSafeInteger\(measureIndex\)/);
    assert.match(bootstrap, /rendering is in progress/);
    assert.doesNotMatch(bootstrap, /graphic\.measureList|opensheetmusicdisplay/i);

    const manifestPath = path.join(outputRoot, "runtime-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.scoreRendererContractVersion, "0.2.0");
    const entry = manifest.files.find((item) => item.path === "workstation-bootstrap.mjs");
    assert.ok(entry);
    const bootstrapBytes = await readFile(bootstrapPath);
    assert.equal(entry.bytes, bootstrapBytes.byteLength);
    assert.equal(entry.sha256, sha256(bootstrapBytes));
    assert.equal(result.manifest.files.find((item) => item.path === "workstation-bootstrap.mjs")?.sha256, entry.sha256);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
