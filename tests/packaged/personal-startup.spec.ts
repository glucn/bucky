import { test, expect, type Page } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { initializePersonalDatabase, openSqlite, querySql, closeSqlite } from "../../src/services/localDatabase";

const passphrase = "Synthetic packaged unlock passphrase 81c";
const sentinel = "Private packaged account 2d054f";
async function denied(page: Page, channel = "get-accounts") {
  return page.evaluate(async (name) => {
    try { await (window as any).electron.ipcRenderer.invoke(name); return "unexpected success"; }
    catch (error) { return String(error); }
  }, channel);
}
async function unlock(page: Page) {
  await page.getByLabel("Authentication method").selectOption("passphrase");
  await page.getByLabel("Passphrase", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
}
async function filesUnder(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(filename));
    else if (entry.isFile()) result.push(filename);
  }
  return result;
}

test("packaged setup, encrypted persistence, restart locking, and renderer revocation", async () => {
  const app = await personalAppHarness();
  try {
    const page = await app.launch();
    expect(page.url()).toMatch(/^file:/);
    await expect(page.getByRole("heading", { name: "Protect your new book" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("protected-setup.png") });
    expect(await denied(page)).toMatch(/locked/i);
    expect(await denied(page, "reset-all-data")).toMatch(/development-only/i);
    const book = path.join(app.directory, "profiles/default/book.sqlite");
    await expect(fs.stat(book)).rejects.toThrow();
    await page.getByLabel("Base currency").selectOption("CAD");
    await page.getByLabel("Authentication method").selectOption("passphrase");
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase);
    await page.getByLabel("Repeat passphrase").fill(passphrase);
    await page.getByRole("button", { name: "Create recovery code" }).click();
    const recovery = await page.getByTestId("recovery-code").innerText();
    await expect(fs.stat(book)).rejects.toThrow();
    await page.getByLabel("Re-enter saved recovery code").fill("wrong code");
    await page.getByRole("button", { name: "Confirm and create encrypted book" }).click();
    await expect(page.getByRole("alert")).toContainText("Unable to confirm recovery");
    await expect(fs.stat(book)).rejects.toThrow();
    await page.getByLabel("Re-enter saved recovery code").fill(recovery);
    await page.getByRole("button", { name: "Confirm and create encrypted book" }).click();
    await expect(page.getByRole("heading", { name: "Unlock Bucky" })).toBeVisible();
    expect(await denied(page)).toMatch(/locked/i);
    await unlock(page);
    const response = await page.evaluate((name) => (window as any).electron.ipcRenderer.invoke("add-account", {
      name, type: "user", subtype: "asset", currency: "CAD",
    }), sentinel);
    expect(response.success).toBe(true);
    await page.evaluate((accountId) => (window as any).electron.setOpeningBalance({ accountId, displayAmount: 246.8, asOfDate: "2026-09-01" }), response.account.id);
    expect(await page.evaluate(() => window.open("https://example.com") === null)).toBe(true);
    expect(await page.evaluate(() => {
      const script = document.createElement("script"); script.textContent = "document.body.dataset.unexpectedInline = 'executed'";
      document.body.appendChild(script); return document.body.dataset.unexpectedInline;
    })).toBeUndefined();
    expect(await page.evaluate(() => typeof (window as any).electron.ipcRenderer.on)).toBe("undefined");
    await page.evaluate(() => localStorage.setItem("private-session-marker", "must disappear"));
    await page.getByRole("button", { name: "Lock Bucky" }).click().catch(() => {});
    const locked = await app.pageAfter(page);
    expect(await denied(locked)).toMatch(/locked/i);
    expect(await locked.evaluate(() => localStorage.getItem("private-session-marker"))).toBeNull();
    expect(await locked.locator("body").innerText()).not.toContain(sentinel);
    await unlock(locked);
    expect(await locked.evaluate((id) => (window as any).electron.ipcRenderer.invoke("get-account-balance", id), response.account.id))
      .toEqual({ success: true, balance: 246.8 });
    await app.stop();
    const reopened = await app.launch();
    await expect(reopened.getByRole("heading", { name: "Unlock Bucky" })).toBeVisible();
    expect(await denied(reopened)).toMatch(/locked/i);
    await reopened.screenshot({ path: test.info().outputPath("locked-profile.png") });
    await reopened.getByLabel("Authentication method").selectOption("passphrase");
    await reopened.getByLabel("Passphrase", { exact: true }).fill("Incorrect synthetic passphrase");
    await reopened.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(reopened.getByRole("alert")).toContainText("Unable to unlock");
    expect(await denied(reopened)).toMatch(/locked/i);
    // Exercise the real retry delay, without disabling authentication for the fixture.
    await expect.poll(() => reopened.evaluate(async (secret) => {
      try { await (window as any).electron.security.unlock({ mode: "passphrase", passphrase: secret }); return true; }
      catch { return false; }
    }, passphrase), { intervals: [1200], timeout: 10_000 }).toBe(true);
    expect(await reopened.evaluate((id) => (window as any).electron.ipcRenderer.invoke("get-account-balance", id), response.account.id))
      .toEqual({ success: true, balance: 246.8 });
    const ordinary = await openSqlite(book);
    try { await expect(querySql(ordinary, "SELECT name FROM Account")).rejects.toThrow(); } finally { await closeSqlite(ordinary); }
    for (const filename of await filesUnder(app.directory)) {
      const bytes = await fs.readFile(filename);
      for (const privateValue of [sentinel, passphrase, recovery]) expect(bytes.includes(Buffer.from(privateValue)), filename).toBe(false);
    }
    expect(app.output()).not.toContain(sentinel);
    expect(app.output()).not.toContain(passphrase);
    expect(app.output()).not.toContain(recovery);
    await app.stop();
  } catch (error) {
    await test.info().attach("packaged-startup.log", { body: app.output(), contentType: "text/plain" });
    await test.info().attach("packaged-state.json", { body: JSON.stringify(await app.diagnostics(), null, 2), contentType: "application/json" });
    throw error;
  } finally { await app.dispose(); }
});

test("packaged startup preserves a legacy plaintext book and requires explicit recovery", async () => {
  const app = await personalAppHarness();
  try {
    const book = path.join(app.directory, "profiles/default/book.sqlite");
    await initializePersonalDatabase(book, path.resolve("prisma/migrations"));
    const before = await fs.readFile(book);
    const page = await app.launch();
    await expect(page.getByRole("heading", { name: "Recovery required" })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("plaintext");
    expect(await denied(page)).toMatch(/locked/i);
    expect(await fs.readFile(book)).toEqual(before);
    await app.stop();
    expect(await fs.readFile(book)).toEqual(before);
  } finally { await app.dispose(); }
});
