import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

import {
  exportWorkstationRuntimeWithCursor,
  isRealmSafePlainInteractionObject,
} from "../scripts/export-workstation-runtime-with-cursor.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputName = "workstation-runtime-cursor-test";
const outputRoot = path.join(repoRoot, "dist", outputName);

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

test("interaction plain-object guard accepts cross-realm records and rejects instances", () => {
  const crossRealm = vm.runInNewContext("({ clientX: 1, clientY: 2 })");
  const crossRealmNullPrototype = vm.runInNewContext(
    "Object.assign(Object.create(null), { clientX: 1, clientY: 2 })",
  );
  const crossRealmInstance = vm.runInNewContext(
    "new (class Point { constructor() { this.clientX = 1; this.clientY = 2; } })()",
  );

  assert.equal(isRealmSafePlainInteractionObject({ clientX: 1, clientY: 2 }), true);
  assert.equal(isRealmSafePlainInteractionObject(Object.create(null)), true);
  assert.equal(isRealmSafePlainInteractionObject(crossRealm), true);
  assert.equal(isRealmSafePlainInteractionObject(crossRealmNullPrototype), true);
  assert.equal(isRealmSafePlainInteractionObject(crossRealmInstance), false);
  assert.equal(isRealmSafePlainInteractionObject([]), false);
  assert.equal(isRealmSafePlainInteractionObject(null), false);
  assert.equal(isRealmSafePlainInteractionObject(new Date()), false);
});

test("runtime host exposes bounded cursor, legacy hit-test, detailed hit evidence and highlight bridges", async () => {
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
    assert.match(bootstrap, /hitTestNote\(payload\)/);
    assert.match(bootstrap, /activeHost\.hitTestNote\(\{ clientX: point\.clientX, clientY: point\.clientY \}\)/);
    assert.match(bootstrap, /hitTestNoteDetailed\(payload\)/);
    assert.match(bootstrap, /activeHost\.hitTestNoteDetailed\(\{ clientX: point\.clientX, clientY: point\.clientY \}\)/);
    assert.match(bootstrap, /Detailed score note hit-test payload/);
    assert.match(bootstrap, /async highlight\(payload\)/);
    assert.match(bootstrap, /activeHost\.highlight/);
    assert.match(bootstrap, /async clearHighlights\(\)/);
    assert.match(bootstrap, /activeHost\.clearHighlights\(\)/);
    assert.match(bootstrap, /function isRealmSafePlainInteractionObject\(payload\)/);
    assert.match(bootstrap, /Object\.getPrototypeOf\(prototype\) === null/);
    assert.match(bootstrap, /contains unsupported field/);
    assert.match(bootstrap, /INTERACTION_PART_ID_MAX_LENGTH = 128/);
    assert.match(bootstrap, /Number\.isFinite\(point\.clientX\)/);
    assert.match(bootstrap, /HIGHLIGHT_CLASS_PATTERN/);
    assert.match(bootstrap, /Number\.isSafeInteger\(target\[key\]\)/);
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
