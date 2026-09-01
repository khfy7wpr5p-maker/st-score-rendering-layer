import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { webkit } from "playwright";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixtures = [
  "osmd-browser-fixture.html",
  "osmd-note-interaction-fixture.html",
];

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".xml", "application/xml; charset=utf-8"],
  [".musicxml", "application/xml; charset=utf-8"],
]);

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl ?? "/", "http://127.0.0.1").pathname);
  const relative = pathname.replace(/^\/+/, "");
  const resolved = path.resolve(repoRoot, relative);
  if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error("request escaped repository root");
  }
  return resolved;
}

const server = createServer(async (request, response) => {
  try {
    const requestedPath = resolveRequestPath(request.url);
    const info = await stat(requestedPath);
    if (!info.isFile()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.setHeader("Content-Type", contentTypes.get(path.extname(requestedPath)) ?? "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    createReadStream(requestedPath).pipe(response);
  } catch {
    response.writeHead(404).end("not found");
  }
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
if (address === null || typeof address === "string") {
  server.close();
  throw new Error("WebKit fixture server did not expose a TCP port.");
}

const baseUrl = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await webkit.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 500 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });

  for (const fixture of fixtures) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(`${baseUrl}/tests/browser/${fixture}`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return status?.dataset.renderPass === "true" || status?.textContent?.includes("FAIL") === true;
    }, null, { timeout: 30_000 });

    const evidence = await page.evaluate(() => {
      const status = document.getElementById("status");
      return {
        renderPass: status?.dataset.renderPass ?? null,
        stage: status?.dataset.stage ?? null,
        renderError: status?.dataset.renderError ?? null,
        text: status?.textContent ?? null,
        svgCount: document.querySelectorAll("svg").length,
      };
    });

    if (evidence.renderPass !== "true" || evidence.svgCount < 1) {
      const diagnostics = consoleErrors.length === 0 ? "none" : consoleErrors.slice(-8).join(" | ");
      throw new Error(`${fixture} WebKit evidence failed: ${JSON.stringify(evidence)}; console=${diagnostics}`);
    }

    console.log(`WebKit fixture PASS: ${fixture} (stage=${evidence.stage ?? "unknown"}, svg=${evidence.svgCount})`);
    await page.close();
  }

  await context.close();
  console.log("WebKit feasibility gate PASS. This is WebKit engine evidence, not physical Safari acceptance.");
} finally {
  if (browser !== undefined) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
