import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup } from "../../src/services/protectedProfiles";

test("authenticated account edits preserve posted currency and survive restart", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic account currency passphrase";
  const unlock = async (page: Page) => {
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
  };
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase });
    await setup.confirm(pending.setupId, pending.recoverySecret);
    let page = await app.launch(); await unlock(page);
    const invoke = (channel: string, params: unknown) => page.evaluate(({ channel, params }) => (window as any).electron.ipcRenderer.invoke(channel, params), { channel, params });
    const created = await invoke("add-account", { name: "Statement bank", type: "user", currency: "CAD" });
    expect(created.success).toBe(true);
    const id = created.account.id;
    await page.evaluate((accountId) => (window as any).electron.setOpeningBalance({ accountId, displayAmount: 100, asOfDate: "2026-01-01" }), id);
    expect(await invoke("update-account", { id, name: "Wrong unit", currency: "USD" })).toMatchObject({ success: false, error: expect.stringMatching(/currency.*history/i) });
    expect(await invoke("get-account-balance", id)).toEqual({ success: true, balance: 100 });
    expect((await invoke("get-accounts", true)).find((a: any) => a.id === id)).toMatchObject({ name: "Statement bank", currency: "CAD" });
    expect(await invoke("update-account", { id, name: "Renamed bank", currency: "CAD" })).toMatchObject({ success: true });

    const portfolio = await invoke("create-investment-portfolio", { name: "Income only", currency: "CAD" });
    expect(portfolio.success).toBe(true);
    const holding = await invoke("create-market-holding", { portfolioId: portfolio.group.id, tickerSymbol: "PAY", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" });
    expect(holding.success).toBe(true);
    expect((await invoke("record-dividend", { portfolioId: portfolio.group.id, securityAccountId: holding.account.id, tickerSymbol: "PAY", amount: 5, date: "2026-01-02" })).success).toBe(true);
    expect(await invoke("get-transactions", holding.account.id)).toEqual([]);
    expect(await invoke("update-account", { id: holding.account.id, currency: "USD" })).toMatchObject({ success: false, error: expect.stringMatching(/currency.*history/i) });
    await app.stop(); page = await app.launch(); await unlock(page);
    expect((await invoke("get-accounts", true)).find((a: any) => a.id === id)).toMatchObject({ name: "Renamed bank", currency: "CAD" });
    expect(await invoke("get-account-balance", id)).toEqual({ success: true, balance: 100 });
    expect((await invoke("get-portfolio-accounts", portfolio.group.id)).accounts.securities[0]).toMatchObject({ currency: "CAD", investmentProperties: { quantity: 0, market: "TSX" } });
  } catch (error) {
    await test.info().attach("packaged-account-currency.log", { body: app.output(), contentType: "text/plain" });
    throw error;
  } finally { await app.dispose(); }
});
