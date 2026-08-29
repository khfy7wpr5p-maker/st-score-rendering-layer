import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { exportWorkstationRuntime } from "./export-workstation-runtime.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function injectCursorAndInteractionBridge(bootstrap) {
  const hostMarker = `const runtimeHost = Object.freeze({\n`;
  const helpers = `const INTERACTION_PART_ID_MAX_LENGTH = 128;\nconst HIGHLIGHT_CLASS_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;\n\nfunction requirePlainInteractionObject(payload, label, allowedKeys) {\n  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {\n    throw new TypeError(\`\${label} must be an object.\`);\n  }\n  const prototype = Object.getPrototypeOf(payload);\n  if (prototype !== Object.prototype && prototype !== null) {\n    throw new TypeError(\`\${label} must be a plain object.\`);\n  }\n  for (const key of Object.keys(payload)) {\n    if (!allowedKeys.has(key)) throw new TypeError(\`\${label} contains unsupported field '\${key}'.\`);\n  }\n  return payload;\n}\n\nfunction requireScoreNoteRef(payload) {\n  const target = requirePlainInteractionObject(\n    payload,\n    "Score note target",\n    new Set(["partId", "measureIndex", "noteIndex", "voice"]),\n  );\n  if (typeof target.partId !== "string" || target.partId.length === 0 ||\n      target.partId.length > INTERACTION_PART_ID_MAX_LENGTH || target.partId !== target.partId.trim()) {\n    throw new TypeError("Score note partId must be a non-empty bounded string without surrounding whitespace.");\n  }\n  for (const key of ["measureIndex", "noteIndex"]) {\n    if (!Number.isSafeInteger(target[key]) || target[key] < 0) {\n      throw new RangeError(\`Score note \${key} must be a non-negative safe integer.\`);\n    }\n  }\n  if (target.voice !== undefined && (!Number.isSafeInteger(target.voice) || target.voice < 0)) {\n    throw new RangeError("Score note voice must be a non-negative safe integer when supplied.");\n  }\n  return target.voice === undefined\n    ? { partId: target.partId, measureIndex: target.measureIndex, noteIndex: target.noteIndex }\n    : { partId: target.partId, measureIndex: target.measureIndex, noteIndex: target.noteIndex, voice: target.voice };\n}\n\n`;
  const hostIndex = bootstrap.indexOf(hostMarker);
  if (hostIndex < 0 || bootstrap.indexOf(hostMarker, hostIndex + hostMarker.length) >= 0) {
    throw new Error("Unable to locate the unique runtime host marker for interaction helper injection.");
  }
  let next = bootstrap.slice(0, hostIndex) + helpers + bootstrap.slice(hostIndex);

  const marker = `  async exportSvg() {\n    if (renderInFlight) {\n`;
  const insertion = `  async moveCursor(payload) {\n    if (renderInFlight) {\n      throw new BrowserScoreHostUnavailableError("Cursor movement is unavailable while rendering is in progress.");\n    }\n    if (activeHost === undefined) {\n      throw new BrowserScoreHostUnavailableError("A score must be rendered before cursor movement.");\n    }\n    const cursor = requirePlainInteractionObject(\n      payload,\n      "Score cursor payload",\n      new Set(["partId", "measureIndex"]),\n    );\n    const partId = typeof cursor.partId === "string" ? cursor.partId : "";\n    if (!partId || partId.length > INTERACTION_PART_ID_MAX_LENGTH || partId !== partId.trim()) {\n      throw new TypeError("Score cursor partId must be a non-empty bounded string without surrounding whitespace.");\n    }\n    const measureIndex = cursor.measureIndex;\n    if (!Number.isSafeInteger(measureIndex) || measureIndex < 0) {\n      throw new RangeError("Score cursor measureIndex must be a non-negative safe integer.");\n    }\n    return activeHost.moveCursor({ partId, measureIndex });\n  },\n  hitTestNote(payload) {\n    if (renderInFlight) {\n      throw new BrowserScoreHostUnavailableError("Note hit-test is unavailable while rendering is in progress.");\n    }\n    if (activeHost === undefined) {\n      throw new BrowserScoreHostUnavailableError("A score must be rendered before note hit-test.");\n    }\n    const point = requirePlainInteractionObject(\n      payload,\n      "Score note hit-test payload",\n      new Set(["clientX", "clientY"]),\n    );\n    if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) {\n      throw new RangeError("Score note hit-test coordinates must be finite numbers.");\n    }\n    return activeHost.hitTestNote({ clientX: point.clientX, clientY: point.clientY });\n  },\n  async highlight(payload) {\n    if (renderInFlight) {\n      throw new BrowserScoreHostUnavailableError("Note highlight is unavailable while rendering is in progress.");\n    }\n    if (activeHost === undefined) {\n      throw new BrowserScoreHostUnavailableError("A score must be rendered before note highlight.");\n    }\n    const highlight = requirePlainInteractionObject(\n      payload,\n      "Score highlight payload",\n      new Set(["target", "className"]),\n    );\n    const target = requireScoreNoteRef(highlight.target);\n    if (highlight.className !== undefined &&\n        (typeof highlight.className !== "string" || !HIGHLIGHT_CLASS_PATTERN.test(highlight.className))) {\n      throw new TypeError("Score highlight className must be one safe CSS class token of at most 64 characters.");\n    }\n    return activeHost.highlight(\n      highlight.className === undefined ? { target } : { target, className: highlight.className },\n    );\n  },\n  async clearHighlights() {\n    if (renderInFlight) {\n      throw new BrowserScoreHostUnavailableError("Note highlight clearing is unavailable while rendering is in progress.");\n    }\n    if (activeHost === undefined) {\n      throw new BrowserScoreHostUnavailableError("A score must be rendered before note highlight clearing.");\n    }\n    return activeHost.clearHighlights();\n  },\n`;

  const first = next.indexOf(marker);
  if (first < 0 || next.indexOf(marker, first + marker.length) >= 0) {
    throw new Error("Unable to locate the unique runtime host exportSvg marker for interaction bridge injection.");
  }
  return next.slice(0, first) + insertion + next.slice(first);
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
  const nextBootstrap = injectCursorAndInteractionBridge(bootstrap);
  await writeFile(bootstrapPath, nextBootstrap, "utf8");
  const manifest = await refreshManifestEntry(result.destinationRoot, "workstation-bootstrap.mjs");
  return Object.freeze({ destinationRoot: result.destinationRoot, manifest });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputName = process.argv[2] ?? "workstation-runtime";
  const result = await exportWorkstationRuntimeWithCursor({ outputName });
  console.log(`Workstation runtime exported with cursor and note interaction bridge: ${path.relative(repoRoot, result.destinationRoot)}`);
  console.log(`Contract: ${result.manifest.scoreRendererContractVersion}`);
  console.log(`OSMD: ${result.manifest.vendor.opensheetmusicdisplay.version}`);
}
