import { test, expect } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup, readProtectedProfile } from "../../src/services/protectedProfiles";
import { unlockWithRecovery } from "../../src/services/profileKeys";
import { createEncryptedPrisma } from "../../src/services/encryptedDatabase";

for (const malformed of [false, true]) test(`packaged authenticated book requires explicit currency when ${malformed ? "invalid" : "missing"} and preserves existing postings`, async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic incomplete book passphrase";
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase }); await setup.confirm(pending.setupId, pending.recoverySecret);
    const profile = await readProtectedProfile(app.directory), key = unlockWithRecovery(profile.envelope, pending.recoverySecret, "default");
    const fixture = createEncryptedPrisma(profile.databaseFile, key);
    let accountId: string;
    try {
      const cash = await fixture.account.findFirstOrThrow({ where: { name: "Cash" } }); accountId = cash.id;
      const equity = await fixture.account.findFirstOrThrow({ where: { name: "Opening Balances" } });
      await fixture.journalEntry.create({ data: { date: "2026-09-01", lines: { create: [
        { accountId, amount: 345.67, currency: "CAD" }, { accountId: equity.id, amount: -345.67, currency: "CAD" },
      ] } } });
      await fixture.appSetting.deleteMany({ where: { key: "baseCurrency" } });
      if (malformed) await fixture.appSetting.create({ data: { key: "baseCurrency", jsonValue: '"unsupported"' } });
    } finally { await fixture.$disconnect(); key.fill(0); }
    const page = await app.launch();
    expect(await page.evaluate(async () => {
      try { await (window as any).electron.bookSetup.getState(); return "unexpected success"; } catch (error) { return String(error); }
    })).toMatch(/locked/i);
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Choose your book's base currency" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Accounts", exact: true })).toHaveCount(0);
    expect(await page.evaluate(async () => {
      try { await (window as any).electron.ipcRenderer.invoke("get-accounts"); return "unexpected success"; } catch (error) { return String(error); }
    })).toMatch(/base currency/i);
    expect(await page.evaluate(async () => {
      try { await (window as any).electron.bookSetup.complete({ baseCurrency: "EUR", unexpected: true }); return false; } catch { return true; }
    })).toBe(true);
    await expect(page.getByRole("button", { name: "Save base currency" })).toBeDisabled();
    await page.screenshot({ path: test.info().outputPath("required-book-currency.png"), fullPage: true });
    await page.getByLabel("Base currency").selectOption("EUR");
    await page.getByRole("button", { name: "Save base currency" }).click();
    await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
    expect(await page.evaluate((id) => (window as any).electron.ipcRenderer.invoke("get-account-balance", id), accountId!)).toEqual({ success: true, balance: 345.67 });
    const accounts = await page.evaluate(() => (window as any).electron.ipcRenderer.invoke("get-accounts", true));
    expect(accounts.every((row: any) => row.currency === "CAD")).toBe(true);
    const state = await page.evaluate(() => (window as any).electron.getBaseCurrencyImpactState());
    expect(state).toMatchObject({ baseCurrency: "EUR", reconciliation: { targetBaseCurrency: "EUR", status: "pending" } });
    await app.stop(); const restarted = await app.launch();
    await restarted.getByLabel("Passphrase", { exact: true }).fill(passphrase);
    await restarted.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(restarted.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
    await expect(restarted.getByTestId("book-setup-page")).toHaveCount(0);
  } catch (error) {
    await test.info().attach("packaged-book-setup.log", { body: app.output(), contentType: "text/plain" }); throw error;
  } finally { await app.dispose(); }
});
