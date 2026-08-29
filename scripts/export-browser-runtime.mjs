import { createHash } from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { exportWorkstationRuntimeWithCursor } from "./export-workstation-runtime-with-cursor.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_OUTPUT_NAME = "browser-runtime";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function browserBootstrapSource(workstationBootstrap) {
  const nativeStart = workstationBootstrap.indexOf("const nativeBackend = globalThis.__JUCE__?.backend;");
  const nativeEndMarker = 'emitNative("st-score-host-ready", readyDetail);\n';
  const nativeEnd = workstationBootstrap.indexOf(nativeEndMarker, nativeStart);
  if (nativeStart < 0 || nativeEnd < 0) {
    throw new Error("Unable to locate the Workstation-native bridge in the generated runtime bootstrap.");
  }

  const readyBridge = `const readyDetail = Object.freeze({ contractVersion: SCORE_RENDERER_CONTRACT_VERSION });\ndocument.documentElement.dataset.stScoreRuntimeReady = "true";\nwindow.dispatchEvent(new CustomEvent("st-score-render-host-ready", { detail: readyDetail }));\n`;

  return workstationBootstrap.slice(0, nativeStart) + readyBridge + workstationBootstrap.slice(nativeEnd + nativeEndMarker.length);
}

async function manifestEntry(destinationRoot, relativePath) {
  const absolutePath = path.join(destinationRoot, relativePath);
  const info = await stat(absolutePath);
  if (!info.isFile()) throw new Error(`Browser runtime asset is not a regular file: ${relativePath}`);
  const content = await readFile(absolutePath);
  return {
    path: relativePath.replaceAll(path.sep, "/"),
    bytes: content.byteLength,
    sha256: sha256(content),
  };
}

export async function exportBrowserRuntime({
  outputName = DEFAULT_OUTPUT_NAME,
  sourceRevision = process.env.ST_SCORE_RENDERER_SOURCE_REVISION ?? process.env.GITHUB_SHA,
} = {}) {
  const result = await exportWorkstationRuntimeWithCursor({ outputName, sourceRevision });
  const workstationBootstrapPath = path.join(result.destinationRoot, "workstation-bootstrap.mjs");
  const browserBootstrapPath = path.join(result.destinationRoot, "browser-bootstrap.mjs");
  const bootstrap = await readFile(workstationBootstrapPath, "utf8");
  await writeFile(browserBootstrapPath, browserBootstrapSource(bootstrap), "utf8");
  await rename(workstationBootstrapPath, `${workstationBootstrapPath}.removed`);

  const indexPath = path.join(result.destinationRoot, "index.html");
  const indexHtml = await readFile(indexPath, "utf8");
  const nextIndex = indexHtml.replace("./workstation-bootstrap.mjs", "./browser-bootstrap.mjs");
  if (nextIndex === indexHtml || nextIndex.includes("workstation-bootstrap.mjs")) {
    throw new Error("Unable to replace the Workstation bootstrap reference in the browser runtime index.");
  }
  await writeFile(indexPath, nextIndex, "utf8");

  const manifestPath = path.join(result.destinationRoot, "runtime-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const filePaths = manifest.files
    .map((entry) => entry.path)
    .filter((entryPath) => entryPath !== "workstation-bootstrap.mjs")
    .concat("browser-bootstrap.mjs")
    .sort();
  const files = [];
  for (const relativePath of filePaths) files.push(await manifestEntry(result.destinationRoot, relativePath));

  const nextManifest = {
    ...manifest,
    runtimeTarget: "browser",
    files,
  };
  await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");

  return Object.freeze({ destinationRoot: result.destinationRoot, manifest: Object.freeze(nextManifest) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputName = process.argv[2] ?? DEFAULT_OUTPUT_NAME;
  const result = await exportBrowserRuntime({ outputName });
  console.log(`Browser runtime exported: ${path.relative(repoRoot, result.destinationRoot)}`);
  console.log(`Contract: ${result.manifest.scoreRendererContractVersion}`);
  console.log(`OSMD: ${result.manifest.vendor.opensheetmusicdisplay.version}`);
}
