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
    expect(await page.evaluate((entryId) => (window as any).electron.ipcRenderer.invoke("delete-transaction", entryId), buy.entry.id))
      .toMatchObject({ success: false, error: expect.stringMatching(/investment.*correction/i) });
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
    const historical = await page.evaluate((accountId) => (window as any).electron.ipcRenderer.invoke("get-position-details", { accountId, asOfDate: "2026-01-02" }), security.id);
    expect(historical).toMatchObject({ success: true, position: { quantity: 10, costBasis: 101 } });
  } catch (error) {
    await test.info().attach("packaged-investment-trades.log", { body: app.output(), contentType: "text/plain" }); throw error;
  } finally { await app.dispose(); }
});

test("packaged distributions and split preserve CAD cash, lot basis and disposal after restart", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic corporate action acceptance passphrase";
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
    const invoke = (channel: string, params: unknown) => page.evaluate(({ channel, params }) => (window as any).electron.ipcRenderer.invoke(channel, params), { channel, params });
    await unlock();
    const portfolio = await invoke("create-investment-portfolio", { name: "Synthetic corporate actions", currency: "CAD" });
    expect(portfolio.success).toBe(true);
    const portfolioId = portfolio.group.id, cashId = portfolio.tradeCashAccount.id;
    await page.evaluate((id) => (window as any).electron.setOpeningBalance({ accountId: id, displayAmount: 10000, asOfDate: "2026-01-01" }), cashId);
    const common = { portfolioId, tickerSymbol: "ABC.TO", date: "2026-01-02" };
    expect((await invoke("record-buy", { ...common, quantity: 10, pricePerShare: 100 })).success).toBe(true);
    const actions = [
      ["record-reinvested-dividend", { ...common, dividendAmount: 100, reinvestmentPrice: 50, recordAsIncome: true, date: "2026-01-03" }],
      ["record-dividend", { ...common, amount: 12, isReturnOfCapital: true, date: "2026-01-04" }],
      ["record-reinvested-dividend", { ...common, dividendAmount: 12, reinvestmentPrice: 50, recordAsIncome: false, date: "2026-01-05" }],
    ] as const;
    for (const [channel, params] of actions) {
      const result = await invoke(channel, params);
      expect(result.success, `${channel}: ${result.error || ""}`).toBe(true);
      expect(result.entry.lines.every((line: any) => line.currency === "CAD")).toBe(true);
      expect(result.entry.lines.reduce((sum: number, line: any) => sum + line.amount, 0)).toBeCloseTo(0, 10);
    }
    const accounts = await invoke("get-portfolio-accounts", portfolioId), securityId = accounts.accounts.securities[0].id;
    expect((await invoke("record-stock-split", { accountId: securityId, splitRatio: 2, date: "2026-01-06" })).success).toBe(true);
    await app.stop(); page = await app.launch(); await unlock();
    const reopened = await invoke("get-portfolio-accounts", portfolioId), security = reopened.accounts.securities[0];
    expect(security.investmentProperties.quantity).toBeCloseTo(24.48, 10);
    expect(JSON.parse(security.investmentProperties.lots).map((lot: any) => lot.amount)).toEqual([980, 96, 12]);
    expect(await invoke("get-account-balance", securityId)).toEqual({ success: true, balance: 1088 });
    expect(await invoke("get-account-balance", cashId)).toEqual({ success: true, balance: 9012 });
    expect((await invoke("record-sell", { ...common, quantity: security.investmentProperties.quantity, pricePerShare: 100, date: "2026-01-07" })).success).toBe(true);
    expect(await invoke("get-account-balance", securityId)).toEqual({ success: true, balance: 0 });
    expect(await invoke("get-account-balance", cashId)).toEqual({ success: true, balance: 11460 });
    for (const [asOfDate, quantity, costBasis] of [
      ["2026-01-03", 12, 1100], ["2026-01-04", 12, 1088], ["2026-01-05", 12.24, 1088], ["2026-01-06", 24.48, 1088],
    ] as const) {
      const historical = await invoke("get-position-details", { accountId: securityId, asOfDate });
      expect(historical.success).toBe(true);
      expect(historical.position.quantity).toBeCloseTo(quantity, 10);
      expect(historical.position.costBasis).toBe(costBasis);
    }
  } catch (error) {
    await test.info().attach("packaged-distributions.log", { body: app.output(), contentType: "text/plain" }); throw error;
  } finally { await app.dispose(); }
});
