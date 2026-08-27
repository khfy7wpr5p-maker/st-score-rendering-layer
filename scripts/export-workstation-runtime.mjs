import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const distRoot = path.join(repoRoot, "dist");
const DEFAULT_OUTPUT_NAME = "workstation-runtime";
const OUTPUT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;

const copyPlan = Object.freeze([
  ["packages/contracts/dist/index.js", "modules/contracts.js"],
  ["packages/renderer-core/dist/index.js", "modules/renderer-core.js"],
  ["packages/adapter-osmd/dist/index.js", "modules/adapter-osmd.js"],
  ["packages/browser-host/dist/index.js", "modules/browser-host.js"],
  [
    "node_modules/opensheetmusicdisplay/build/opensheetmusicdisplay.min.js",
    "vendor/opensheetmusicdisplay.min.js",
  ],
  [
    "third_party/licenses/opensheetmusicdisplay-BSD-3-Clause.txt",
    "licenses/opensheetmusicdisplay-BSD-3-Clause.txt",
  ],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
]);

function outputDirectory(outputName = DEFAULT_OUTPUT_NAME) {
  if (!OUTPUT_NAME_PATTERN.test(outputName) || outputName === "." || outputName === "..") {
    throw new TypeError("Runtime output name must be a simple bounded directory name.");
  }
  return path.join(distRoot, outputName);
}

function normalizeRevision(value) {
  if (value === undefined || value === "") return "local";
  const revision = String(value).toLowerCase();
  if (!REVISION_PATTERN.test(revision)) {
    throw new TypeError("Renderer source revision must be a 40-character lowercase Git SHA.");
  }
  return revision;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

async function requireRegularFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const info = await stat(absolutePath);
  if (!info.isFile()) {
    throw new Error(`Required runtime input is not a regular file: ${relativePath}`);
  }
  return absolutePath;
}

async function copyRuntimeFile(sourceRelative, destinationRoot, destinationRelative) {
  const source = await requireRegularFile(sourceRelative);
  const destination = path.join(destinationRoot, destinationRelative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function osmdShimSource() {
  return `const OpenSheetMusicDisplay = globalThis.opensheetmusicdisplay?.OpenSheetMusicDisplay;\n\nif (OpenSheetMusicDisplay === undefined) {\n  throw new Error("OSMD browser global is unavailable inside the renderer-owned runtime.");\n}\n\nexport { OpenSheetMusicDisplay };\nexport default { OpenSheetMusicDisplay };\n`;
}

function bootstrapSource() {
  return `import { SCORE_RENDERER_CONTRACT_VERSION } from "@st/score-renderer-contracts";\nimport {\n  BrowserScoreHost,\n  BrowserScoreHostUnavailableError,\n  ScoreRendererContractVersionMismatchError,\n} from "@st/score-renderer-browser-host";\n\nconst root = document.getElementById("st-score-root");\nif (!(root instanceof HTMLElement)) {\n  throw new Error("ST score runtime root is unavailable.");\n}\n\nconst host = new BrowserScoreHost(root, {\n  expectedContractVersion: SCORE_RENDERER_CONTRACT_VERSION,\n});\n\nfunction requirePayload(payload) {\n  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {\n    throw new TypeError("Score render payload must be an object.");\n  }\n  if (payload.contractVersion !== SCORE_RENDERER_CONTRACT_VERSION) {\n    throw new ScoreRendererContractVersionMismatchError(\n      String(payload.contractVersion ?? ""),\n      SCORE_RENDERER_CONTRACT_VERSION,\n    );\n  }\n  if (typeof payload.musicxml !== "string") {\n    throw new TypeError("Score render payload must contain MusicXML text.");\n  }\n  if (payload.pageMode !== "continuous" && payload.pageMode !== "page") {\n    throw new TypeError("Score render pageMode must be continuous or page.");\n  }\n  for (const key of ["autoResize", "drawTitle", "drawComposer"]) {\n    if (typeof payload[key] !== "boolean") {\n      throw new TypeError(\`Score render \${key} must be boolean.\`);\n    }\n  }\n  const ticket = String(payload.ticket ?? "");\n  if (!/^[1-9][0-9]{0,18}$/.test(ticket)) {\n    throw new TypeError("Score render ticket must be a positive bounded decimal identifier.");\n  }\n  return {\n    musicxml: payload.musicxml,\n    ticket,\n    options: {\n      pageMode: payload.pageMode,\n      autoResize: payload.autoResize,\n      drawTitle: payload.drawTitle,\n      drawComposer: payload.drawComposer,\n    },\n  };\n}\n\nfunction mapErrorStatus(error) {\n  if (error instanceof ScoreRendererContractVersionMismatchError) return "contract_version_mismatch";\n  if (error instanceof BrowserScoreHostUnavailableError) return "unavailable";\n  if (error instanceof TypeError) return "invalid_request";\n  if (error instanceof RangeError) {\n    const message = String(error.message ?? "").toLowerCase();\n    return message.includes("size") || message.includes("bytes") || message.includes("limit")\n      ? "resource_limit_exceeded"\n      : "invalid_request";\n  }\n  return "adapter_error";\n}\n\nconst runtimeHost = Object.freeze({\n  async renderMusicXml(payload) {\n    const request = requirePayload(payload);\n    return host.renderMusicXml(\n      request.musicxml,\n      request.options,\n      \`workstation:\${request.ticket}\`,\n    );\n  },\n  async exportSvg() {\n    return host.exportSvg();\n  },\n  async dispose() {\n    return host.dispose();\n  },\n});\n\nglobalThis.__ST_SCORE_RENDER_HOST__ = runtimeHost;\n\nconst nativeBackend = globalThis.__JUCE__?.backend;\nconst emitNative = (event, payload) => {\n  if (nativeBackend && typeof nativeBackend.emitEvent === "function") {\n    nativeBackend.emitEvent(event, payload);\n  }\n};\n\nglobalThis.__ST_WORKSTATION_SCORE_SHELL__ = Object.freeze({\n  render(payload) {\n    const ticket = String(payload?.ticket ?? "");\n    Promise.resolve(runtimeHost.renderMusicXml(payload))\n      .then(() => emitNative("st-score-render-result", { ticket, status: "success" }))\n      .catch((error) => emitNative("st-score-render-result", { ticket, status: mapErrorStatus(error) }));\n  },\n});\n\nconst readyDetail = Object.freeze({ contractVersion: SCORE_RENDERER_CONTRACT_VERSION });\ndocument.documentElement.dataset.stScoreRuntimeReady = "true";\nwindow.dispatchEvent(new CustomEvent("st-score-render-host-ready", { detail: readyDetail }));\nemitNative("st-score-host-ready", readyDetail);\n`;
}

function indexHtmlSource() {
  return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>ST Score Runtime</title>\n  <style>html,body,#st-score-root{margin:0;width:100%;height:100%;overflow:auto}</style>\n  <script src="./vendor/opensheetmusicdisplay.min.js"></script>\n  <script type="importmap">\n  {\n    "imports": {\n      "@st/score-renderer-contracts": "./modules/contracts.js",\n      "@st/score-renderer-core": "./modules/renderer-core.js",\n      "@st/score-renderer-osmd": "./modules/adapter-osmd.js",\n      "@st/score-renderer-browser-host": "./modules/browser-host.js",\n      "opensheetmusicdisplay": "./modules/osmd-module-shim.mjs"\n    }\n  }\n  </script>\n</head>\n<body>\n  <div id="st-score-root" role="region" aria-label="Score viewer"></div>\n  <script type="module" src="./workstation-bootstrap.mjs"></script>\n</body>\n</html>\n`;
}

async function manifestFileEntry(destinationRoot, relativePath) {
  const content = await readFile(path.join(destinationRoot, relativePath));
  return Object.freeze({
    path: relativePath.replaceAll(path.sep, "/"),
    bytes: content.byteLength,
    sha256: sha256(content),
  });
}

export async function exportWorkstationRuntime({
  outputName = DEFAULT_OUTPUT_NAME,
  sourceRevision = process.env.ST_SCORE_RENDERER_SOURCE_REVISION ?? process.env.GITHUB_SHA,
} = {}) {
  const destinationRoot = outputDirectory(outputName);
  const revision = normalizeRevision(sourceRevision);

  await rm(destinationRoot, { recursive: true, force: true });
  await mkdir(destinationRoot, { recursive: true });

  for (const [source, destination] of copyPlan) {
    await copyRuntimeFile(source, destinationRoot, destination);
  }

  await mkdir(path.join(destinationRoot, "modules"), { recursive: true });
  await writeFile(path.join(destinationRoot, "modules/osmd-module-shim.mjs"), osmdShimSource(), "utf8");
  await writeFile(path.join(destinationRoot, "workstation-bootstrap.mjs"), bootstrapSource(), "utf8");
  await writeFile(path.join(destinationRoot, "index.html"), indexHtmlSource(), "utf8");

  const contractsPackage = await readJson("packages/contracts/package.json");
  const corePackage = await readJson("packages/renderer-core/package.json");
  const osmdAdapterPackage = await readJson("packages/adapter-osmd/package.json");
  const browserHostPackage = await readJson("packages/browser-host/package.json");
  const osmdPackage = await readJson("node_modules/opensheetmusicdisplay/package.json");
  const contractsJs = await readFile(path.join(destinationRoot, "modules/contracts.js"), "utf8");
  const contractMatch = contractsJs.match(/SCORE_RENDERER_CONTRACT_VERSION\s*=\s*["']([^"']+)["']/);
  if (contractMatch === null) {
    throw new Error("Unable to resolve the ST score renderer contract version from built output.");
  }

  const runtimeFiles = [
    ...copyPlan.map(([, destination]) => destination),
    "modules/osmd-module-shim.mjs",
    "workstation-bootstrap.mjs",
    "index.html",
  ];
  const files = [];
  for (const relativePath of runtimeFiles.sort()) {
    files.push(await manifestFileEntry(destinationRoot, relativePath));
  }

  const manifest = Object.freeze({
    schemaVersion: 1,
    rendererSourceRevision: revision,
    scoreRendererContractVersion: contractMatch[1],
    packages: Object.freeze({
      contracts: contractsPackage.version,
      rendererCore: corePackage.version,
      osmdAdapter: osmdAdapterPackage.version,
      browserHost: browserHostPackage.version,
    }),
    vendor: Object.freeze({
      opensheetmusicdisplay: Object.freeze({
        version: osmdPackage.version,
        license: "BSD-3-Clause",
        licenseFile: "licenses/opensheetmusicdisplay-BSD-3-Clause.txt",
      }),
    }),
    files: Object.freeze(files),
  });

  await writeFile(
    path.join(destinationRoot, "runtime-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return Object.freeze({ destinationRoot, manifest });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputName = process.argv[2] ?? DEFAULT_OUTPUT_NAME;
  const result = await exportWorkstationRuntime({ outputName });
  console.log(`Workstation runtime exported: ${path.relative(repoRoot, result.destinationRoot)}`);
  console.log(`Contract: ${result.manifest.scoreRendererContractVersion}`);
  console.log(`OSMD: ${result.manifest.vendor.opensheetmusicdisplay.version}`);
}
