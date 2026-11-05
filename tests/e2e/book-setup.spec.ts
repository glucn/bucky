import { test, expect } from "@playwright/test";
import sqlite3 from "sqlite3";
import { launchApp, closeApp, getMainWindow, testDbPath } from "./helpers/importFlow";

async function counts(): Promise<{ accounts: number; groups: number; settings: number }> {
  const db = new sqlite3.Database(testDbPath, sqlite3.OPEN_READONLY);
  try { return await new Promise((resolve, reject) => db.get(
    "SELECT (SELECT COUNT(*) FROM Account) AS accounts, (SELECT COUNT(*) FROM AccountGroup) AS groups, (SELECT COUNT(*) FROM AppSetting) AS settings",
    (error, row) => error ? reject(error) : resolve(row as any))); }
  finally { await new Promise<void>((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
}

test("development factory reset stays unconfigured across restart and data reset retains chosen currency", async () => {
  let app = await launchApp();
  try {
    let page = await getMainWindow(app);
    await page.getByRole("combobox", { name: "Development reset mode" }).selectOption("factory");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reset development data" }).click();
    await expect(page.getByTestId("book-setup-page")).toBeVisible();
    expect(await counts()).toEqual({ accounts: 0, groups: 0, settings: 0 });
    await closeApp(app); app = await launchApp(); page = await getMainWindow(app, { configureCurrency: false });
    await expect(page.getByRole("heading", { name: "Choose your book's base currency" })).toBeVisible();
    expect(await counts()).toEqual({ accounts: 0, groups: 0, settings: 0 });
    await expect(page.getByRole("link", { name: "Accounts", exact: true })).toHaveCount(0);
    await page.getByLabel("Base currency").selectOption("CAD");
    await page.getByRole("button", { name: "Save base currency" }).click();
    await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
    await page.evaluate(() => window.electron.ipcRenderer.invoke("add-account", { name: "Synthetic reset sentinel", type: "user", subtype: "asset", currency: "CAD" }));
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reset development data" }).click();
    await expect.poll(async () => (await page.evaluate(() => window.electron.ipcRenderer.invoke("get-accounts", true)))
      .some((row: any) => row.name === "Synthetic reset sentinel")).toBe(false);
    await expect(page.getByTestId("book-setup-page")).toHaveCount(0);
    const state = await page.evaluate(() => window.electron.getBaseCurrencyImpactState());
    expect(state.baseCurrency).toBe("CAD"); expect(state.reconciliation).toBeNull();
    const accounts = await page.evaluate(() => window.electron.ipcRenderer.invoke("get-accounts", true));
    expect(accounts.length).toBeGreaterThan(0); expect(accounts.every((row: any) => row.currency === "CAD")).toBe(true);
  } finally { await closeApp(app); }
});
