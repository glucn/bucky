import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup } from "../../src/services/protectedProfiles";

test("packaged same-ticker holding setup and selected-currency transactions persist after restart", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic market-aware setup passphrase";
  const unlock = async (page: Page) => {
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
  };
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase }); await setup.confirm(pending.setupId, pending.recoverySecret);
    let page = await app.launch();
    expect(await page.evaluate(async () => { try { await (window as any).electron.ipcRenderer.invoke("create-market-holding", {}); return "allowed"; } catch (error) { return String(error); } })).toMatch(/locked/i);
    await unlock(page);
    const invoke = (channel: string, params: unknown) => page.evaluate(({ channel, params }) => (window as any).electron.ipcRenderer.invoke(channel, params), { channel, params });
    const portfolio = await invoke("create-investment-portfolio", { name: "Cross-listed book", currency: "CAD" }); expect(portfolio.success).toBe(true);
    const portfolioId = portfolio.group.id, cadId = portfolio.tradeCashAccount.id;
    const usd = await invoke("add-trade-cash-account", { portfolioId, currency: "USD" }); expect(usd.success).toBe(true);
    const usdId = usd.account.id;
    for (const [accountId, displayAmount] of [[cadId, 1000], [usdId, 500]] as const) {
      await page.evaluate((input) => (window as any).electron.setOpeningBalance({ ...input, asOfDate: "2026-01-01" }), { accountId, displayAmount });
    }
    const portfolioPage = async () => {
      await page.evaluate((id) => { window.location.hash = `/investments/${id}`; }, portfolioId);
      await expect(page.getByTestId("add-holding-button")).toBeVisible();
    };
    const create = async (market: string, cashId: string, method: string) => {
      await portfolioPage(); await page.getByTestId("add-holding-button").click();
      const dialog = page.getByTestId("new-holding-dialog");
      await dialog.getByLabel("Ticker", { exact: true }).fill("ABC"); await dialog.getByLabel("Market", { exact: true }).fill(market);
      await dialog.getByLabel("Cash account", { exact: true }).selectOption(cashId); await dialog.getByLabel("Cost basis method", { exact: true }).selectOption(method);
      await page.screenshot({ path: test.info().outputPath(`holding-setup-${market}.png`), fullPage: true });
      await dialog.getByRole("button", { name: "Create holding", exact: true }).click();
      await expect(dialog).toHaveCount(0); await expect(page).toHaveURL(/\/holding\/[^/]+$/);
      return page.url().split("/holding/")[1];
    };
    const firstId = await create("TSX", cadId, "FIFO");
    const secondId = await create("NASDAQ", usdId, "AVERAGE_COST"); expect(firstId).not.toBe(secondId);
    let accounts = await invoke("get-portfolio-accounts", portfolioId);
    expect(accounts.accounts.securities).toHaveLength(2);
    for (const account of accounts.accounts.securities) {
      expect(account.investmentProperties).toMatchObject({ quantity: 0, hasCompleteActivityHistory: true });
      expect(await invoke("get-account-balance", account.id)).toEqual({ success: true, balance: 0 });
    }
    const record = async (type: string, holding: string | null, cashId: string, amount: number, price?: number) => {
      await portfolioPage(); await page.getByRole("button", { name: "Buy Security", exact: true }).click();
      const dialog = page.getByTestId("transaction-entry-dialog");
      await dialog.getByLabel("Transaction Type", { exact: true }).selectOption(type);
      if (holding) await dialog.getByLabel("Holding", { exact: true }).selectOption(holding);
      await dialog.getByLabel("Cash account", { exact: true }).selectOption(cashId);
      await dialog.getByLabel("Date *", { exact: true }).fill(type === "buy" ? "2026-01-02" : "2026-01-03");
      if (price !== undefined) {
        await dialog.getByLabel("Quantity *", { exact: true }).fill(String(amount)); await dialog.getByLabel("Price Per Share *", { exact: true }).fill(String(price));
      } else await dialog.getByLabel("Amount *", { exact: true }).fill(String(amount));
      await dialog.getByRole("button", { name: "Record Transaction", exact: true }).click(); await expect(dialog).toHaveCount(0);
    };
    await record("buy", firstId, cadId, 10, 10); await record("buy", secondId, usdId, 2, 20);
    await record("sell", secondId, usdId, 1, 30); await record("dividend", firstId, cadId, 5);
    await record("fee", null, usdId, 2); await record("interest", null, usdId, 3);
    await portfolioPage(); await page.screenshot({ path: test.info().outputPath("cross-listed-holdings.png"), fullPage: true });
    await app.stop(); page = await app.launch(); await unlock(page);
    accounts = await invoke("get-portfolio-accounts", portfolioId);
    expect(accounts.accounts.securities.find((a: any) => a.id === firstId)).toMatchObject({ currency: "CAD", investmentProperties: { market: "TSX", quantity: 10, costBasisMethod: "FIFO" } });
    expect(accounts.accounts.securities.find((a: any) => a.id === secondId)).toMatchObject({ currency: "USD", investmentProperties: { market: "NASDAQ", quantity: 1, costBasisMethod: "AVERAGE_COST" } });
    expect((await invoke("get-position-details", { accountId: firstId })).position).toMatchObject({ quantity: 10, costBasis: 100 });
    expect((await invoke("get-position-details", { accountId: secondId })).position).toMatchObject({ quantity: 1, costBasis: 20 });
    expect(await invoke("get-account-balance", cadId)).toEqual({ success: true, balance: 905 });
    expect(await invoke("get-account-balance", usdId)).toEqual({ success: true, balance: 491 });
    await portfolioPage(); await expect(page.getByTestId(`position-${firstId}`)).toContainText("TSX"); await expect(page.getByTestId(`position-${secondId}`)).toContainText("NASDAQ");
  } catch (error) {
    await test.info().attach("packaged-holding-creation.log", { body: app.output(), contentType: "text/plain" });
    await test.info().attach("packaged-holding-state.json", { body: JSON.stringify(await app.diagnostics()), contentType: "application/json" }); throw error;
  } finally { await app.dispose(); }
});
