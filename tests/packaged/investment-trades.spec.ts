import { test, expect } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup } from "../../src/services/protectedProfiles";

test("packaged CAD trades balance fees, reject overselling, and preserve cash and lots after restart", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic investment acceptance passphrase";
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase });
    await setup.confirm(pending.setupId, pending.recoverySecret);
    let page = await app.launch();
    const unlock = async () => {
      await page.getByLabel("Passphrase", { exact: true }).fill(passphrase);
      await page.getByRole("button", { name: "Unlock", exact: true }).click();
      await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
    };
    await unlock();
    const portfolio = await page.evaluate(() => (window as any).electron.ipcRenderer.invoke("create-investment-portfolio", { name: "Synthetic CAD portfolio", currency: "CAD" }));
    expect(portfolio.success).toBe(true);
    await page.evaluate((id) => (window as any).electron.setOpeningBalance({ accountId: id, displayAmount: 1000, asOfDate: "2026-01-01" }), portfolio.tradeCashAccount.id);
    const input = { portfolioId: portfolio.group.id, tickerSymbol: "ABC.TO", quantity: 10, pricePerShare: 10, fee: 1, date: "2026-01-02" };
    const buy = await page.evaluate((params) => (window as any).electron.ipcRenderer.invoke("record-buy", params), input);
    expect(buy.success).toBe(true);
    expect(buy.entry.lines.every((line: any) => line.currency === "CAD")).toBe(true);
    expect(buy.entry.lines.reduce((sum: number, line: any) => sum + line.amount, 0)).toBeCloseTo(0, 10);
    const sell = await page.evaluate((params) => (window as any).electron.ipcRenderer.invoke("record-sell", params), { ...input, quantity: 5, pricePerShare: 12, date: "2026-01-03" });
    expect(sell.success).toBe(true);
    expect(sell.entry.lines.reduce((sum: number, line: any) => sum + line.amount, 0)).toBeCloseTo(0, 10);
    const refused = await page.evaluate((params) => (window as any).electron.ipcRenderer.invoke("record-sell", params), { ...input, quantity: 6, date: "2026-01-04" });
    expect(refused).toMatchObject({ success: false, error: expect.stringMatching(/insufficient shares/i) });
    await app.stop(); page = await app.launch(); await unlock();
    const accounts = await page.evaluate((id) => (window as any).electron.ipcRenderer.invoke("get-portfolio-accounts", id), portfolio.group.id);
    expect(accounts.success).toBe(true);
    expect(accounts.accounts.securities).toHaveLength(1);
    const security = accounts.accounts.securities[0];
    expect(security).toMatchObject({ currency: "CAD", investmentProperties: { quantity: 5 } });
    expect(JSON.parse(security.investmentProperties.lots)).toEqual([expect.objectContaining({ quantity: 5, amount: 50.5 })]);
    expect(await page.evaluate((id) => (window as any).electron.ipcRenderer.invoke("get-account-balance", id), portfolio.tradeCashAccount.id)).toEqual({ success: true, balance: 958 });
    expect(await page.evaluate((id) => (window as any).electron.ipcRenderer.invoke("get-account-balance", id), security.id)).toEqual({ success: true, balance: 50.5 });
  } catch (error) {
    await test.info().attach("packaged-investment-trades.log", { body: app.output(), contentType: "text/plain" }); throw error;
  } finally { await app.dispose(); }
});
