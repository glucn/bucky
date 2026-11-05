const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { preparationState } = require("./e2e-preparation-state");
const { developmentServer } = require("../src/shared/developmentServer");
const preparationPort = developmentServer({ BUCKY_DEV_PORT: String(developmentServer().port + 2) }).port;

const root = process.cwd();
const mainBundle = path.join(root, ".webpack", "main", "index.js");
const rendererDir = path.join(root, ".webpack", "renderer");
const preloadBundle = path.join(rendererDir, "main_window", "preload.js");
const timeoutMs = 120000;

const checkReady = () => fs.existsSync(mainBundle) && fs.existsSync(preloadBundle);

const ensureHotUpdateArtifacts = () => {
  const preloadSource = fs.readFileSync(preloadBundle, "utf8");
  const match = preloadSource.match(/__webpack_require__\.h=\(\)=>\"([a-f0-9]+)\"/);
  if (!match) {
    return;
  }

  const hash = match[1];
  const targetJson = path.join(rendererDir, `main_window.${hash}.hot-update.json`);
  const targetJs = path.join(rendererDir, `main_window.${hash}.hot-update.js`);

  if (!fs.existsSync(targetJson)) {
    fs.writeFileSync(targetJson, JSON.stringify({ h: hash, c: { main_window: true } }));
  }

  if (!fs.existsSync(targetJs)) {
    fs.writeFileSync(targetJs, 'self["webpackHotUpdatemain_window"]("main_window", {});');
  }
};

const child = spawn("npm", ["run", "start"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "test",
    VITEST: "true",
    PLAYWRIGHT_TEST: "1",
    PLAYWRIGHT_PREPARE_ONLY: "1",
    // Playwright must never mistake Forge's temporary renderer for the real test server.
    BUCKY_DEV_PORT: String(preparationPort),
  },
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
});

const startedAt = Date.now();
const state = preparationState(checkReady);
let prepared = false, failure = "", diagnostics = "";
const stopOwnedProcess = (signal = "SIGTERM") => {
  try { if (process.platform === "win32") child.kill(signal); else process.kill(-child.pid, signal); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
};
child.stdout.on("data", (chunk) => { state.observe(chunk); diagnostics = (diagnostics + chunk).slice(-8192); });
child.stderr.on("data", (chunk) => { diagnostics = (diagnostics + chunk).slice(-8192); });

const interval = setInterval(() => {
  if (!prepared && state.ready()) {
    ensureHotUpdateArtifacts();
    prepared = true;
    stopOwnedProcess();
  }

  if (Date.now() - startedAt > timeoutMs) {
    failure = "Timed out preparing fresh Electron bundles for E2E.";
    stopOwnedProcess("SIGKILL");
  }
}, 1000);

child.on("close", () => {
  clearInterval(interval);
  if (!failure && state.ready()) {
    ensureHotUpdateArtifacts();
    process.exit(0);
    return;
  }
  console.error(failure || "Electron preparation exited before a fresh prepared launch.");
  console.error(diagnostics);
  process.exit(1);
});
child.on("error", (error) => { failure = `Electron preparation could not start: ${error.message}`; });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { failure = "Electron preparation canceled"; stopOwnedProcess(); });
