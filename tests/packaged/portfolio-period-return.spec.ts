import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup, readProtectedProfile } from "../../src/services/protectedProfiles";
import { unlockWithRecovery } from "../../src/services/profileKeys";
import { createEncryptedPrisma } from "../../src/services/encryptedDatabase";

test("packaged historical performance and allocation exclude later quotes and sales after restart", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic period return passphrase";
  const unlock = async (page: Page) => {
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
  };
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase }); await setup.confirm(pending.setupId, pending.recoverySecret);
    let page = await app.launch(); await unlock(page);
    const invoke = (channel: string, params: unknown) => page.evaluate(({ channel, params }) => (window as any).electron.ipcRenderer.invoke(channel, params), { channel, params });
    const portfolio = await invoke("create-investment-portfolio", { name: "Historical returns", currency: "CAD" }); expect(portfolio.success).toBe(true);
    const portfolioId = portfolio.group.id;
    const opening = await page.evaluate((accountId) => (window as any).electron.setOpeningBalance({ accountId, displayAmount: 100, asOfDate: "2025-12-30" }), portfolio.tradeCashAccount.id);
    expect(opening.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: portfolio.tradeCashAccount.id, amount: 100, currency: "CAD" })]));
    const holding = await invoke("create-market-holding", { portfolioId, tickerSymbol: "ABC", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" });
    expect(holding.success).toBe(true);
    expect((await invoke("record-buy", { portfolioId, securityAccountId: holding.account.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2025-12-31" })).success).toBe(true);
    expect((await invoke("record-sell", { portfolioId, securityAccountId: holding.account.id, tickerSymbol: "ABC", quantity: 5, pricePerShare: 99, date: "2026-01-04" })).success).toBe(true);
    await app.stop();
    const profile = await readProtectedProfile(app.directory), key = unlockWithRecovery(profile.envelope, pending.recoverySecret, "default"), fixture = createEncryptedPrisma(profile.databaseFile, key);
    try {
      await fixture.securityDailyPrice.createMany({ data: [
        { ticker: "ABC", market: "TSX", marketDate: "2025-12-31", close: 10, priceBasis: "raw", barStatus: "complete", source: "manual" },
        { ticker: "ABC", market: "TSX", marketDate: "2026-01-03", close: 12, priceBasis: "raw", barStatus: "complete", source: "manual" },
        { ticker: "ABC", market: "TSX", marketDate: "2026-01-04", close: 99, priceBasis: "raw", barStatus: "complete", source: "manual" },
      ] });
    } finally { await fixture.$disconnect(); key.fill(0); }
    page = await app.launch(); await unlock(page);
    await page.evaluate((id) => { window.location.hash = `/investments/${id}/reports`; }, portfolioId);
    await page.locator('input[type="date"]').nth(0).fill("2026-01-01");
    await page.locator('input[type="date"]').nth(1).fill("2026-01-03");
    await expect(page.getByText("Opening Value", { exact: true }).locator("..")).toContainText(/CAD\s*100\.00/);
    await expect(page.getByText("Closing Value", { exact: true }).locator("..")).toContainText(/CAD\s*120\.00/);
    const gain = page.getByText("Period Gain/Loss", { exact: true }).locator("..");
    await expect(gain).toContainText("CA$20.00"); await expect(gain).toContainText("20.00%");
    const allocation = page.getByRole("heading", { name: "Asset Allocation", exact: true }).locator("..");
    await expect(allocation).toContainText("1/3/2026"); await expect(allocation.getByRole("row").filter({ hasText: "ABC" })).toContainText("120.00");
    await expect(allocation.getByRole("row").filter({ hasText: "ABC" })).toContainText("100.00%");
    expect((await invoke("get-portfolio-performance", { portfolioId, startDate: "2026-01-01", endDate: "2026-01-03" })).performance).toMatchObject({ openingValue: 100, closingValue: 120, totalReturn: 20, totalReturnPercent: 20, realizedGains: 0 });
    await page.screenshot({ path: test.info().outputPath("historical-period-report.png"), fullPage: true });
  } catch (error) {
    await test.info().attach("packaged-period-return.log", { body: app.output(), contentType: "text/plain" }); throw error;
  } finally { await app.dispose(); }
});
