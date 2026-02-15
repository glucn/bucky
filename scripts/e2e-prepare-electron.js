const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

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
  },
  stdio: "ignore",
});

const startedAt = Date.now();

const interval = setInterval(() => {
  if (checkReady()) {
    ensureHotUpdateArtifacts();
    clearInterval(interval);
    if (!child.killed) {
      child.kill("SIGTERM");
    }
    process.exit(0);
  }

  if (Date.now() - startedAt > timeoutMs) {
    clearInterval(interval);
    if (!child.killed) {
      child.kill("SIGTERM");
    }
    console.error("Timed out preparing Electron bundles for E2E.");
    process.exit(1);
  }
}, 1000);

child.on("exit", (code) => {
  if (checkReady()) {
    ensureHotUpdateArtifacts();
    clearInterval(interval);
    process.exit(0);
    return;
  }

  if (code !== 0) {
    clearInterval(interval);
    console.error(`dev:electron exited early with code ${code}`);
    process.exit(1);
  }
});
