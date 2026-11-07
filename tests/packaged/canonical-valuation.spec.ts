import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup, readProtectedProfile } from "../../src/services/protectedProfiles";
import { unlockWithRecovery } from "../../src/services/profileKeys";
import { createEncryptedPrisma } from "../../src/services/encryptedDatabase";

test("packaged canonical quotes, missing values and same-ticker holding actions survive restart", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic canonical valuation passphrase";
  const unlock = async (page: Page) => {
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
  };
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase }); await setup.confirm(pending.setupId, pending.recoverySecret);
    let page = await app.launch(); await unlock(page);
    const portfolio = await page.evaluate(() => (window as any).electron.ipcRenderer.invoke("create-investment-portfolio", { name: "Canonical book", currency: "CAD" }));
    expect(portfolio.success).toBe(true);
    const portfolioId = portfolio.group.id;
    await page.evaluate((accountId) => (window as any).electron.setOpeningBalance({ accountId, displayAmount: 1000, asOfDate: "2026-01-01" }), portfolio.tradeCashAccount.id);
    expect((await page.evaluate((portfolioId) => (window as any).electron.ipcRenderer.invoke("record-buy", { portfolioId, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2026-01-02" }), portfolioId)).success).toBe(true);
    const accounts = await page.evaluate((id) => (window as any).electron.ipcRenderer.invoke("get-portfolio-accounts", id), portfolioId);
    const firstId = accounts.accounts.securities[0].id;
    expect((await page.evaluate((accountId) => (window as any).electron.ipcRenderer.invoke("get-position-details", { accountId }), firstId)).position.marketValue).toBeNull();
    await app.stop();
    const profile = await readProtectedProfile(app.directory), key = unlockWithRecovery(profile.envelope, pending.recoverySecret, "default");
    const fixture = createEncryptedPrisma(profile.databaseFile, key);
    let secondId: string;
    try {
      await fixture.investmentProperties.update({ where: { accountId: firstId }, data: { market: "TSX" } });
      await fixture.securityMetadata.createMany({ data: [
        { ticker: "ABC", market: "TSX", quoteCurrency: "CAD" },
        { ticker: "ABC", market: "NASDAQ", quoteCurrency: "USD" },
      ] });
      const second = await fixture.account.create({ data: { name: "ABC US", type: "user", subtype: "asset", currency: "USD", groupId: portfolioId,
        investmentProperties: { create: { tickerSymbol: "ABC", market: "NASDAQ", quantity: 0, costBasisMethod: "FIFO", lots: "[]", hasCompleteActivityHistory: true } } } }); secondId = second.id;
      await fixture.securityDailyPrice.createMany({ data: [
        { ticker: "ABC", market: "TSX", marketDate: "2026-01-02", close: 12.3456789, priceBasis: "raw", barStatus: "complete", source: "manual" },
        { ticker: "ABC", market: "TSX", marketDate: "2026-01-03", close: 999 },
        { ticker: "ABC", market: "NASDAQ", marketDate: "2026-01-02", close: 100, priceBasis: "raw", barStatus: "complete", source: "manual" },
      ] });
      await fixture.securityPriceHistory.create({ data: { tickerSymbol: "ABC", date: "2026-01-02", price: 999 } });
    } finally { await fixture.$disconnect(); key.fill(0); }
    page = await app.launch(); await unlock(page);
    const usd = await page.evaluate((portfolioId) => (window as any).electron.ipcRenderer.invoke("add-trade-cash-account", { portfolioId, currency: "USD" }), portfolioId);
    expect(usd.success).toBe(true);
    await page.evaluate((accountId) => (window as any).electron.setOpeningBalance({ accountId, displayAmount: 500, asOfDate: "2026-01-01" }), usd.account.id);
    expect(await page.evaluate((accountId) => (window as any).electron.ipcRenderer.invoke("get-position-details", { accountId }), firstId)).toMatchObject({ success: true, position: { marketPrice: 12.3456789, marketValue: 123.46, market: "TSX" } });
    await page.evaluate((id) => { window.location.hash = `/investments/${id}`; }, portfolioId);
    await expect(page.getByTestId(`position-${firstId}`)).toContainText("TSX");
    await page.getByTestId(`position-${secondId!}`).click();
    await expect(page).toHaveURL(new RegExp(`/holding/${secondId!}$`));
    await expect(page.getByText("NASDAQ · Close as of 2026-01-02")).toBeVisible();
    await page.getByRole("button", { name: "Buy", exact: true }).click();
    await page.getByPlaceholder("0.00", { exact: true }).nth(0).fill("1");
    await page.getByPlaceholder("0.00", { exact: true }).nth(1).fill("100");
    await page.locator('input[type="date"]').fill("2026-01-04");
    await page.getByRole("button", { name: "Record Transaction", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Record Transaction", exact: true })).toHaveCount(0);
    const positions = await page.evaluate((portfolioId) => (window as any).electron.ipcRenderer.invoke("get-all-positions", { portfolioId }), portfolioId);
    expect(positions.positions.find((position: any) => position.accountId === secondId!)).toMatchObject({ quantity: 1, marketValue: 100, market: "NASDAQ" });
    expect(positions.positions.find((position: any) => position.accountId === firstId)).toMatchObject({ quantity: 10, marketValue: 123.46 });
    const transactionRow = page.getByRole("row").filter({ hasText: "Buy 1 shares of ABC @ 100" });
    await expect(transactionRow).toContainText(/USD\s*100\.00/);
    await expect(transactionRow).not.toContainText("CA$");
    const dates = await page.evaluate(() => {
      const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const now = new Date(), future = new Date(now); future.setDate(future.getDate() + 1);
      return { today: day(now), future: day(future) };
    });
    expect((await page.evaluate((input) => (window as any).electron.ipcRenderer.invoke("record-buy", input), {
      portfolioId, tickerSymbol: "ABC", securityAccountId: secondId!, quantity: 1, pricePerShare: 100, date: dates.future,
    })).success).toBe(true);
    expect(await page.evaluate((id) => (window as any).electron.ipcRenderer.invoke("get-account-balance", id), usd.account.id)).toEqual({ success: true, balance: 400 });
    expect((await page.evaluate((accountId) => (window as any).electron.ipcRenderer.invoke("get-position-details", { accountId }), secondId!)).position.quantity).toBe(1);
    expect((await page.evaluate((input) => (window as any).electron.ipcRenderer.invoke("get-position-details", input), { accountId: secondId!, asOfDate: dates.future })).position.quantity).toBe(2);
    await page.getByRole("button", { name: "Buy", exact: true }).click();
    await expect(page.locator('input[type="date"]')).toHaveValue(dates.today);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.screenshot({ path: test.info().outputPath("canonical-position.png"), fullPage: true });
  } catch (error) { await test.info().attach("canonical-valuation.log", { body: app.output(), contentType: "text/plain" }); throw error; }
  finally { await app.dispose(); }
});
