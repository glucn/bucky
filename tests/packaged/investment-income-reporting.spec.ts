import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup, readProtectedProfile } from "../../src/services/protectedProfiles";
import { unlockWithRecovery } from "../../src/services/profileKeys";
import { createEncryptedPrisma } from "../../src/services/encryptedDatabase";

test("packaged investment reports retain native facts and convert gains and income at posting-date FX after restart", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic income reporting passphrase";
  const unlock = async (page: Page) => {
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase); await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
  };
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase }); await setup.confirm(pending.setupId, pending.recoverySecret);
    let page = await app.launch(); await unlock(page);
    const invoke = (channel: string, params: unknown) => page.evaluate(({ channel, params }) => (window as any).electron.ipcRenderer.invoke(channel, params), { channel, params });
    const portfolio = await invoke("create-investment-portfolio", { name: "Income ledger", currency: "CAD" }); expect(portfolio.success).toBe(true);
    const portfolioId = portfolio.group.id;
    const usd = await invoke("add-trade-cash-account", { portfolioId, currency: "USD" }); expect(usd.success).toBe(true);
    const holding = await invoke("create-market-holding", { portfolioId, tickerSymbol: "ABC", market: "NASDAQ", quoteCurrency: "USD", tradeCashAccountId: usd.account.id, costBasisMethod: "FIFO" }); expect(holding.success).toBe(true);
    const portfolioPage = async () => {
      await page.evaluate(() => { window.location.hash = "/accounts"; });
      await expect(page.getByRole("heading", { name: "Your Accounts", exact: true })).toBeVisible();
      await page.evaluate((id) => { window.location.hash = `/investments/${id}`; }, portfolioId);
      await expect(page.getByRole("heading", { name: "Income ledger", exact: true })).toBeVisible();
    };
    await portfolioPage();
    await expect(page.getByText("Realized Gain/Loss", { exact: true }).locator("..")).toContainText("CA$0.00");
    const common = { portfolioId, tickerSymbol: "ABC", securityAccountId: holding.account.id };
    for (const [channel, input] of [
      ["record-buy", { ...common, quantity: 2, pricePerShare: 20, date: "2026-01-02" }],
      ["record-sell", { ...common, quantity: 1, pricePerShare: 30, fee: 1, date: "2026-01-03", description: "Custom disposal note" }],
      ["record-dividend", { ...common, amount: 4, date: "2026-01-03", description: "Custom income note" }],
      ["record-interest", { portfolioId, tradeCashAccountId: usd.account.id, amount: 3, date: "2026-01-03" }],
      ["record-fee", { portfolioId, tradeCashAccountId: usd.account.id, amount: 2, description: "Custody", date: "2026-01-03" }],
    ] as const) expect((await invoke(channel, input)).success, channel).toBe(true);
    await portfolioPage();
    await expect(page.getByText("Realized Gain/Loss", { exact: true }).locator("..")).toContainText("N/A");
    await expect(page.getByText("Dividend Income", { exact: true }).locator("..")).toContainText("N/A");
    await expect(page.getByText("Dividend Income", { exact: true }).locator("..")).toContainText(/USD\s*4\.00/);
    await app.stop();
    const profile = await readProtectedProfile(app.directory), key = unlockWithRecovery(profile.envelope, pending.recoverySecret, "default"), fixture = createEncryptedPrisma(profile.databaseFile, key);
    try {
      await fixture.fxDailyRate.createMany({ data: [
        { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-03", rate: 1.5 },
        { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-04", rate: 9 },
      ] });
    } finally { await fixture.$disconnect(); key.fill(0); }
    page = await app.launch(); await unlock(page); await portfolioPage();
    const card = page.getByText("Realized Gain/Loss", { exact: true }).locator("..");
    await expect(card).toContainText("13.50"); await expect(card).not.toContainText("9.00");
    await expect(page.getByText("Dividend Income", { exact: true }).locator("..")).toContainText("6.00");
    const gains = await invoke("get-realized-gains", { portfolioId, startDate: "2026-01-01", endDate: "2026-01-03" });
    expect(gains.gains[0]).toMatchObject({ currency: "USD", baseCurrency: "CAD", realizedGain: 9, realizedGainBase: 13.5, saleProceeds: 29, quantity: 1 });
    await page.evaluate((id) => { window.location.hash = `/investments/${id}/reports`; }, portfolioId);
    await page.locator('input[type="date"]').nth(0).fill("2026-01-01"); await page.locator('input[type="date"]').nth(1).fill("2026-01-03");
    const row = page.getByRole("row").filter({ hasText: "NASDAQ" });
    await expect(row).toContainText(/USD\s*20\.00/); await expect(row).toContainText(/USD\s*29\.00/);
    await expect(row).toContainText(/USD\s*9\.00/); await expect(row).toContainText(/CAD\s*13\.50/);
    await expect(row).toContainText("1/3/2026");
    const income = page.getByText("Income", { exact: true }).locator("..");
    await expect(income).toContainText("10.50"); await expect(income).toContainText(/USD\s*4\.00/); await expect(income).toContainText(/USD\s*3\.00/);
    await page.screenshot({ path: test.info().outputPath("investment-native-and-base-income.png"), fullPage: true });
  } catch (error) {
    await test.info().attach("packaged-income-reporting.log", { body: app.output(), contentType: "text/plain" });
    await test.info().attach("packaged-income-state.json", { body: JSON.stringify(await app.diagnostics()), contentType: "application/json" }); throw error;
  } finally { await app.dispose(); }
});
