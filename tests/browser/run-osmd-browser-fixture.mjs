import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixtures = [
  "osmd-browser-fixture.html",
  "osmd-interaction-fixture.html",
  "osmd-tablature-fixture.html",
  "osmd-accessibility-fixture.html",
  "osmd-browser-host-fixture.html",
  "workstation-runtime-export-fixture.html",
];

const candidates = [
  process.env.CHROME_BIN,
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
].filter(Boolean);

let chrome;
for (const candidate of candidates) {
  const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
  if (probe.status === 0) {
    chrome = candidate;
    break;
  }
}

if (!chrome) {
  console.error("Browser gate failed closed: no supported Chrome/Chromium executable found.");
  process.exit(1);
}

for (const fixture of fixtures) {
  const fixturePath = path.join(repoRoot, "tests/browser", fixture);
  const result = spawnSync(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--allow-file-access-from-files",
      "--virtual-time-budget=10000",
      "--dump-dom",
      pathToFileURL(fixturePath).href,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 45000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  if (result.error) {
    console.error(`${fixture} failed to execute Chrome:`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${fixture} Chrome exit code:`, result.status);
    console.error(result.stderr?.slice(-4000) ?? "");
    process.exit(1);
  }

  const dom = result.stdout ?? "";
  if (!dom.includes('data-render-pass="true"') || !dom.includes("<svg")) {
    console.error(`${fixture} failed: browser capability evidence was not produced.`);
    console.error(dom.slice(-6000));
    process.exit(1);
  }
  console.log(`Browser fixture PASS: ${fixture}`);
}

console.log(`Browser gates PASS using ${chrome}`);
