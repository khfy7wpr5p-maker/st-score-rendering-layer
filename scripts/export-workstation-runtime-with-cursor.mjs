import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { exportWorkstationRuntime } from "./export-workstation-runtime.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function injectCursorBridge(bootstrap) {
  const marker = `  async exportSvg() {\n    if (renderInFlight) {\n`;
  const insertion = `  async moveCursor(payload) {\n    if (renderInFlight) {\n      throw new BrowserScoreHostUnavailableError("Cursor movement is unavailable while rendering is in progress.");\n    }\n    if (activeHost === undefined) {\n      throw new BrowserScoreHostUnavailableError("A score must be rendered before cursor movement.");\n    }\n    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {\n      throw new TypeError("Score cursor payload must be an object.");\n    }\n    const partId = typeof payload.partId === "string" ? payload.partId.trim() : "";\n    if (!partId || partId.length > 128) {\n      throw new TypeError("Score cursor partId must be a non-empty bounded string.");\n    }\n    const measureIndex = payload.measureIndex;\n    if (!Number.isSafeInteger(measureIndex) || measureIndex < 0) {\n      throw new RangeError("Score cursor measureIndex must be a non-negative safe integer.");\n    }\n    return activeHost.moveCursor({ partId, measureIndex });\n  },\n`;

  const first = bootstrap.indexOf(marker);
  if (first < 0 || bootstrap.indexOf(marker, first + marker.length) >= 0) {
    throw new Error("Unable to locate the unique runtime host exportSvg marker for cursor bridge injection.");
  }
  return bootstrap.slice(0, first) + insertion + bootstrap.slice(first);
}

async function refreshManifestEntry(destinationRoot, relativePath) {
  const manifestPath = path.join(destinationRoot, "runtime-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const absolutePath = path.join(destinationRoot, relativePath);
  const content = await readFile(absolutePath);
  const info = await stat(absolutePath);
  if (!info.isFile()) throw new Error(`Runtime asset is not a regular file: ${relativePath}`);

  const nextEntry = {
    path: relativePath.replaceAll(path.sep, "/"),
    bytes: content.byteLength,
    sha256: sha256(content),
  };
  let replaced = false;
  manifest.files = manifest.files.map((entry) => {
    if (entry.path !== nextEntry.path) return entry;
    replaced = true;
    return nextEntry;
  });
  if (!replaced) throw new Error(`Runtime manifest entry is missing: ${nextEntry.path}`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export async function exportWorkstationRuntimeWithCursor(options = {}) {
  const result = await exportWorkstationRuntime(options);
  const bootstrapPath = path.join(result.destinationRoot, "workstation-bootstrap.mjs");
  const bootstrap = await readFile(bootstrapPath, "utf8");
  const nextBootstrap = injectCursorBridge(bootstrap);
  await writeFile(bootstrapPath, nextBootstrap, "utf8");
  const manifest = await refreshManifestEntry(result.destinationRoot, "workstation-bootstrap.mjs");
  return Object.freeze({ destinationRoot: result.destinationRoot, manifest });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputName = process.argv[2] ?? "workstation-runtime";
  const result = await exportWorkstationRuntimeWithCursor({ outputName });
  console.log(`Workstation runtime exported with cursor bridge: ${path.relative(repoRoot, result.destinationRoot)}`);
  console.log(`Contract: ${result.manifest.scoreRendererContractVersion}`);
  console.log(`OSMD: ${result.manifest.vendor.opensheetmusicdisplay.version}`);
}
