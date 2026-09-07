import { test, expect, chromium, type Browser } from "@playwright/test";
import { spawn, type ChildProcess } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import net from "net";

const executable = path.resolve("out/Bucky-darwin-arm64/Bucky.app/Contents/MacOS/Bucky");

test("packaged app initializes and preserves personal data without a dev server or repository cwd", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-packaged-"));
  let child: ChildProcess | undefined;
  let browser: Browser | undefined;
  let output = "";
  const isRunning = () => child && child.exitCode === null && child.signalCode === null;
  const launch = async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as net.AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    output = "";
    child = spawn(executable, [`--user-data-dir=${directory}`, `--remote-debugging-port=${port}`], {
      cwd: directory,
      // Installed-app mode must win over development variables inherited from a shell.
      env: { ...process.env, NODE_ENV: "test", VITEST: "true", ELECTRON_IS_DEV: "1" },
    });
    child.stdout?.on("data", (chunk) => { output += chunk; });
    child.stderr?.on("data", (chunk) => { output += chunk; });
    let launchError: Error | undefined;
    child.on("error", (error) => { launchError = error; });
    await expect.poll(async () => {
      if (launchError) throw launchError;
      if (!isRunning()) throw new Error(`Packaged app exited: ${output}`);
      try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; }
      catch { return false; }
    }, { timeout: 30_000 }).toBe(true);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    await expect.poll(() => context.pages().length).toBeGreaterThan(0);
    const page = context.pages()[0];
    await page.getByText("Bucky", { exact: true }).waitFor({ timeout: 10_000 });
    expect(page.url()).toMatch(/^file:/);
    await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
    return page;
  };
  const stop = async () => {
    if (!isRunning()) return;
    const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
    // The application handles SIGTERM through app.quit(), including DB disconnect.
    child!.kill("SIGTERM");
    await Promise.race([exited, new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Packaged app did not quit")), 5000))]);
    await browser?.close().catch(() => {});
    browser = undefined;
  };
  try {
    const page = await launch();
    const response = await page.evaluate(() => (window as any).electron.ipcRenderer.invoke("add-account", {
      name: "Packaged persistence check", type: "user", subtype: "asset", currency: "CAD",
    }));
    expect(response.success).toBe(true);
    await page.getByRole("link", { name: "Accounts", exact: true }).first().click();
    await expect(page.getByText("Packaged persistence check", { exact: true }).first()).toBeVisible();
    await stop();
    const reopened = await launch();
    const accounts = await reopened.evaluate(() => (window as any).electron.ipcRenderer.invoke("get-accounts"));
    expect(accounts.some((account: { name: string }) => account.name === "Packaged persistence check")).toBe(true);
    expect(await fs.stat(path.join(directory, "profiles/default/book.sqlite"))).toBeTruthy();
    await expect(fs.stat(path.join(directory, "prisma/test.db"))).rejects.toThrow();
    await stop();
  } catch (error) {
    await test.info().attach("packaged-startup.log", { body: output, contentType: "text/plain" });
    throw error;
  } finally {
    if (isRunning()) {
      const exited = new Promise<void>((resolve) => child!.once("exit", () => resolve()));
      child!.kill("SIGKILL");
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    await browser?.close().catch(() => {});
    await fs.rm(directory, { recursive: true, force: true });
  }
});
