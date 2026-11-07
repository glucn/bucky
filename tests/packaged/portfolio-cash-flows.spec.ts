import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup, readProtectedProfile } from "../../src/services/protectedProfiles";
import { unlockWithRecovery } from "../../src/services/profileKeys";
import { createEncryptedPrisma } from "../../src/services/encryptedDatabase";

test("packaged cash-flow reports retain native funding, exclude internal FX and convert each date after restart", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic cash flow passphrase";
  const unlock = async (page: Page) => {
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase); await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
  };
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase }); await setup.confirm(pending.setupId, pending.recoverySecret);
    let page = await app.launch(); await unlock(page);
    const invoke = (channel: string, params: unknown) => page.evaluate(({ channel, params }) => (window as any).electron.ipcRenderer.invoke(channel, params), { channel, params });
    const portfolio = await invoke("create-investment-portfolio", { name: "Flow ledger", currency: "CAD" }); expect(portfolio.success).toBe(true);
    const portfolioId = portfolio.group.id, cadId = portfolio.tradeCashAccount.id;
    const usd = await invoke("add-trade-cash-account", { portfolioId, currency: "USD" }); expect(usd.success).toBe(true);
    const outside = await invoke("add-account", { name: "USD checking", type: "user", currency: "USD" }); expect(outside.success).toBe(true);
    await page.evaluate((accountId) => (window as any).electron.setOpeningBalance({ accountId, displayAmount: 50, asOfDate: "2026-01-01" }), cadId);
    for (const [fromAccountId, toAccountId, amount, date] of [
      [outside.account.id, usd.account.id, 100, "2026-01-02"], [usd.account.id, outside.account.id, 10, "2026-01-03"],
    ] as const) expect((await invoke("add-transaction", { fromAccountId, toAccountId, amount, date, transactionType: "transfer" })).skipped).toBe(false);
    expect((await invoke("add-transaction", { fromAccountId: usd.account.id, toAccountId: cadId, amountFrom: 10, amountTo: 15, exchangeRate: 1.5, date: "2026-01-03", type: "currency_transfer" })).skipped).toBe(false);
    expect((await invoke("update-account", { id: usd.account.id, name: "Broker USD settlement" })).success).toBe(true);
    const range = { portfolioId, startDate: "2026-01-01", endDate: "2026-01-03" };
    const missing = await invoke("get-portfolio-performance", range); expect(missing.success).toBe(true);
    expect(missing.performance).toMatchObject({ deposits: null, withdrawals: null, cashFlows: { depositsByCurrency: { CAD: 50, USD: 100 }, withdrawalsByCurrency: { USD: 10 } } });
    expect(missing.performance.cashFlows.rows).toHaveLength(3);
    const report = async () => {
      await page.evaluate((id) => { window.location.hash = `/investments/${id}/reports`; }, portfolioId);
      await page.locator('input[type="date"]').nth(0).fill(range.startDate); await page.locator('input[type="date"]').nth(1).fill(range.endDate);
      await expect(page.getByTestId("portfolio-cash-flows")).toBeVisible();
    };
    await report();
    let flows = page.getByTestId("portfolio-cash-flows");
    await expect(flows.getByText("Deposits", { exact: true }).locator("..")).toContainText("N/A");
    await expect(flows).toContainText(/USD\s*100\.00/);
    await app.stop();
    const profile = await readProtectedProfile(app.directory), key = unlockWithRecovery(profile.envelope, pending.recoverySecret, "default"), fixture = createEncryptedPrisma(profile.databaseFile, key);
    try { await fixture.fxDailyRate.createMany({ data: [
      { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-01", rate: 1.5 },
      { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-03", rate: 2 },
      { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-04", rate: 9 },
    ] }); } finally { await fixture.$disconnect(); key.fill(0); }
    page = await app.launch(); await unlock(page); await report(); flows = page.getByTestId("portfolio-cash-flows");
    const result = await invoke("get-portfolio-performance", range); expect(result.success).toBe(true);
    expect(result.performance).toMatchObject({ deposits: 200, withdrawals: 20 }); expect(result.performance.cashFlows.rows).toHaveLength(3);
    await expect(flows.getByText("Deposits", { exact: true }).locator("..")).toContainText(/CAD\s*200\.00/);
    await expect(flows.getByText("Withdrawals", { exact: true }).locator("..")).toContainText(/CAD\s*20\.00/);
    const withdrawal = flows.getByRole("row").filter({ hasText: "Withdrawal" });
    await expect(withdrawal).toContainText("Broker USD settlement"); await expect(withdrawal).toContainText("1/3/2026");
    await expect(withdrawal).toContainText(/USD\s*-?10\.00/); await expect(withdrawal).toContainText(/CAD\s*-?20\.00/);
    await page.screenshot({ path: test.info().outputPath("portfolio-cash-flow-report.png"), fullPage: true });
  } catch (error) {
    await test.info().attach("packaged-cash-flows.log", { body: app.output(), contentType: "text/plain" }); throw error;
  } finally { await app.dispose(); }
});
