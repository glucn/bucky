import { chromium, expect, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import net from "net";

export async function personalAppHarness() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-packaged-"));
  let child: ChildProcess | undefined;
  let browser: Browser | undefined;
  let output = "";
  const running = () => child && child.exitCode === null && child.signalCode === null;
  async function pageAfter(previous?: Page) {
    let page: Page | undefined;
    await expect.poll(() => {
      page = browser?.contexts().flatMap((context) => context.pages()).find((candidate) => candidate !== previous && !candidate.isClosed());
      return Boolean(page);
    }).toBe(true);
    await page!.getByTestId("security-screen").waitFor({ timeout: 15_000 });
    return page!;
  }
  return {
    directory,
    output: () => output,
    async diagnostics() {
      return Promise.all((browser?.contexts().flatMap((context) => context.pages()) ?? []).map(async (page) => ({
        url: page.url(), closed: page.isClosed(),
        body: await page.locator("body").innerText({ timeout: 1000 }).catch(String),
        security: await page.evaluate(() => (window as any).electron.security.getState()).catch(String),
      })));
    },
    pageAfter,
    async launch() {
      const server = net.createServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const port = (server.address() as net.AddressInfo).port;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      child = spawn(path.resolve("out/Bucky-darwin-arm64/Bucky.app/Contents/MacOS/Bucky"),
        [`--user-data-dir=${directory}`, `--remote-debugging-port=${port}`], { cwd: directory,
          env: { ...process.env, NODE_ENV: "test", VITEST: "true", ELECTRON_IS_DEV: "1", PLAYWRIGHT_TEST: "1",
            BUCKY_DEV_PORT: "https://invalid-development-override.example" } });
      child.stdout?.on("data", (chunk) => { output += chunk; });
      child.stderr?.on("data", (chunk) => { output += chunk; });
      let error: Error | undefined;
      child.on("error", (reason) => { error = reason; });
      await expect.poll(async () => {
        if (error) throw error;
        if (!running()) throw new Error(`Packaged app exited: ${output}`);
        try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; }
      }, { timeout: 30_000 }).toBe(true);
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      const observe = (page: Page) => {
        page.on("close", () => { output += "\nRenderer closed"; });
        page.on("crash", () => { output += "\nRenderer crashed"; });
        page.on("pageerror", (error) => { output += `\nRenderer error: ${error.message}`; });
        page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) output += `\nNavigation: ${frame.url()}`; });
      };
      for (const context of browser.contexts()) {
        context.pages().forEach(observe);
        context.on("page", observe);
      }
      return pageAfter();
    },
    async stop() {
      if (running()) {
        const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
        child!.kill("SIGTERM");
        await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("Packaged app did not quit")), 5000))]);
      }
      await browser?.close().catch(() => {}); browser = undefined;
    },
    async dispose() {
      if (running()) {
        const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
        child!.kill("SIGKILL");
        await exited;
      }
      await browser?.close().catch(() => {});
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}
