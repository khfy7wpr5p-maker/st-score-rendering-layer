import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  SCORE_RENDERER_CONTRACT_VERSION,
  type ScoreHighlight,
  type ScoreMeasureRef,
  type ScorePartRef,
  type ScoreRenderOptions,
  type ScoreRenderResult,
  type ScoreRenderer,
  type ScoreRendererCapability,
  type ScoreSource,
} from "@st/score-renderer-contracts";
import { validateScoreSource } from "@st/score-renderer-core";

export type OsmdHeadlessRenderRequest = Readonly<{
  source: ScoreSource;
  options: ScoreRenderOptions;
}>;

export type OsmdHeadlessHost = (
  request: OsmdHeadlessRenderRequest,
) => readonly string[] | Promise<readonly string[]>;

export type OsmdHeadlessRendererOptions = Readonly<{
  host?: OsmdHeadlessHost;
  chromeExecutable?: string;
  timeoutMs?: number;
  noSandbox?: boolean;
}>;

const CAPABILITIES: ReadonlySet<ScoreRendererCapability> = new Set([
  "musicxml-render",
  "svg-export",
  "tablature",
  "headless",
]);
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_BROWSER_OUTPUT_BYTES = 32 * 1024 * 1024;

function safeJson(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Value cannot be serialized for the headless renderer.");
  }
  return serialized
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError(`timeoutMs must be an integer between 1000 and ${MAX_TIMEOUT_MS}.`);
  }
  return timeoutMs;
}

function resolveChrome(explicitExecutable: string | undefined): string {
  const candidates = [
    explicitExecutable,
    process.env.CHROME_BIN,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8", timeout: 5_000 });
    if (probe.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium executable is available for headless rendering.");
}

function buildFixtureHtml(source: ScoreSource, options: ScoreRenderOptions, osmdBundleUrl: string): string {
  const renderOptions = {
    autoResize: false,
    backend: "svg",
    drawTitle: options.drawTitle ?? true,
    drawComposer: options.drawComposer ?? true,
    pageFormat: options.pageMode === "page" ? "A4 P" : "Endless",
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' file:; style-src 'unsafe-inline'; img-src data:; font-src data: file:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'" />
  <title>ST headless score render</title>
  <style>html,body{margin:0;padding:0}#score{width:960px}</style>
</head>
<body>
  <div id="score"></div>
  <div id="status" data-render-pass="false"></div>
  <script src="${escapeHtmlAttribute(osmdBundleUrl)}"></script>
  <script>
    const xml = ${safeJson(source.content)};
    const renderOptions = ${safeJson(renderOptions)};
    (async () => {
      const status = document.getElementById("status");
      try {
        const OpenSheetMusicDisplay = window.opensheetmusicdisplay?.OpenSheetMusicDisplay;
        if (!OpenSheetMusicDisplay) throw new Error("OSMD browser global is unavailable");
        const osmd = new OpenSheetMusicDisplay("score", renderOptions);
        await osmd.load(xml);
        osmd.render();
        const pages = [...document.querySelectorAll("#score svg")].map((svg) => svg.outerHTML);
        if (pages.length === 0) throw new Error("OSMD produced no SVG pages");
        status.dataset.renderPayload = encodeURIComponent(JSON.stringify(pages));
        status.dataset.renderPass = "true";
      } catch (error) {
        status.dataset.renderError = encodeURIComponent(String(error?.message ?? error));
        status.dataset.renderPass = "false";
      }
    })();
  </script>
</body>
</html>`;
}

function extractPayload(dom: string): readonly string[] {
  if (!dom.includes('data-render-pass="true"')) {
    const error = /data-render-error="([^"]*)"/.exec(dom)?.[1];
    const detail = error ? decodeURIComponent(error) : "headless browser did not report success";
    throw new Error(`OSMD headless render failed: ${detail}.`);
  }
  const encoded = /data-render-payload="([^"]+)"/.exec(dom)?.[1];
  if (!encoded) throw new Error("OSMD headless render produced no serialized SVG payload.");
  const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((page) => typeof page !== "string" || !page.includes("<svg"))) {
    throw new Error("OSMD headless SVG payload is invalid.");
  }
  return Object.freeze([...parsed] as string[]);
}

export function renderWithChrome(
  request: OsmdHeadlessRenderRequest,
  runtime: Omit<OsmdHeadlessRendererOptions, "host"> = {},
): readonly string[] {
  validateScoreSource(request.source);
  const timeoutMs = resolveTimeout(runtime.timeoutMs);
  const chrome = resolveChrome(runtime.chromeExecutable);
  const require = createRequire(import.meta.url);
  const osmdBundlePath = require.resolve("opensheetmusicdisplay");
  const osmdBundleUrl = pathToFileURL(osmdBundlePath).href;
  const directory = mkdtempSync(join(tmpdir(), "st-score-headless-"));
  const fixturePath = join(directory, "render.html");

  try {
    writeFileSync(fixturePath, buildFixtureHtml(request.source, request.options, osmdBundleUrl), {
      encoding: "utf8",
      mode: 0o600,
    });
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-first-run",
      "--allow-file-access-from-files",
      "--virtual-time-budget=10000",
      "--dump-dom",
    ];
    if (runtime.noSandbox === true) args.push("--no-sandbox");
    args.push(pathToFileURL(fixturePath).href);

    const result = spawnSync(chrome, args, {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: MAX_BROWSER_OUTPUT_BYTES,
    });
    if (result.error) throw new Error(`Chrome failed to execute: ${result.error.message}`);
    if (result.status !== 0) {
      const stderr = result.stderr?.slice(-4_000) ?? "";
      throw new Error(`Chrome exited with status ${String(result.status)}. ${stderr}`.trim());
    }
    return extractPayload(result.stdout ?? "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function digestSvgPages(svgPages: readonly string[]): string {
  if (svgPages.length === 0) throw new Error("At least one SVG page is required for a visual digest.");
  const hash = createHash("sha256");
  svgPages.forEach((page, index) => {
    if (!page.includes("<svg")) throw new Error(`SVG page ${index} is invalid.`);
    hash.update(String(index));
    hash.update("\0");
    hash.update(page.replace(/\r\n?/g, "\n"));
    hash.update("\0");
  });
  return hash.digest("hex");
}

export class OsmdHeadlessRenderer implements ScoreRenderer {
  readonly id = "osmd-headless";
  readonly capabilities = CAPABILITIES;
  readonly #host: OsmdHeadlessHost;
  #source: ScoreSource | undefined;
  #svgPages: readonly string[] | undefined;

  constructor(options: OsmdHeadlessRendererOptions = {}) {
    const runtime = {
      ...(options.chromeExecutable === undefined ? {} : { chromeExecutable: options.chromeExecutable }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.noSandbox === undefined ? {} : { noSandbox: options.noSandbox }),
    };
    this.#host = options.host ?? ((request) => renderWithChrome(request, runtime));
  }

  async load(source: ScoreSource): Promise<void> {
    validateScoreSource(source);
    this.#source = source;
    this.#svgPages = undefined;
  }

  async render(options: ScoreRenderOptions = {}): Promise<ScoreRenderResult> {
    if (!this.#source) throw new Error("A MusicXML score must be loaded before render().");
    const pages = await this.#host({ source: this.#source, options });
    if (pages.length === 0 || pages.some((page) => !page.includes("<svg"))) {
      throw new Error("The headless host returned an invalid SVG result.");
    }
    this.#svgPages = Object.freeze([...pages]);
    return { rendererId: this.id, contractVersion: SCORE_RENDERER_CONTRACT_VERSION };
  }

  async exportSvg(): Promise<readonly string[]> {
    if (!this.#svgPages) throw new Error("A score must be rendered before exportSvg().");
    return [...this.#svgPages];
  }

  async highlight(_highlight: ScoreHighlight): Promise<void> {
    throw new Error("note-highlight is not supported by the headless renderer.");
  }

  async clearHighlights(): Promise<void> {
    throw new Error("note-highlight is not supported by the headless renderer.");
  }

  async moveCursor(_target: ScoreMeasureRef): Promise<void> {
    throw new Error("cursor is not supported by the headless renderer.");
  }

  async setPartVisible(_part: ScorePartRef, _visible: boolean): Promise<void> {
    throw new Error("part-visibility is not supported by the headless renderer.");
  }

  async dispose(): Promise<void> {
    this.#source = undefined;
    this.#svgPages = undefined;
  }
}
