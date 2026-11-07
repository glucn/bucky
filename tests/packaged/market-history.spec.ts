import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup } from "../../src/services/protectedProfiles";

test("packaged first market assignment resolves old reports while dividend-only history prevents relabeling", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic market history passphrase";
  const unlock = async (page: Page) => {
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase); await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
  };
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase }); await setup.confirm(pending.setupId, pending.recoverySecret);
    let page = await app.launch(); await unlock(page);
    const invoke = (channel: string, params: unknown) => page.evaluate(({ channel, params }) => (window as any).electron.ipcRenderer.invoke(channel, params), { channel, params });
    const portfolio = await invoke("create-investment-portfolio", { name: "Assigned after posting", currency: "CAD" }); expect(portfolio.success).toBe(true);
    const portfolioId = portfolio.group.id, cashId = portfolio.tradeCashAccount.id;
    await page.evaluate((accountId) => (window as any).electron.setOpeningBalance({ accountId, displayAmount: 100, asOfDate: "2026-01-01" }), cashId);
    const common = { portfolioId, tickerSymbol: "ABC" };
    for (const [channel, input] of [
      ["record-buy", { ...common, quantity: 2, pricePerShare: 10, date: "2026-01-02" }],
      ["record-dividend", { ...common, amount: 2, date: "2026-01-03" }],
      ["record-sell", { ...common, quantity: 1, pricePerShare: 15, date: "2026-01-04" }],
    ] as const) expect((await invoke(channel, input)).success, channel).toBe(true);
    const accounts = await invoke("get-portfolio-accounts", portfolioId), holdingId = accounts.accounts.securities[0].id;
    const range = { portfolioId, startDate: "2026-01-01", endDate: "2026-01-04" };
    expect((await invoke("get-realized-gains", range)).gains[0]).toMatchObject({ market: null, recordedMarket: null, quantity: 1, realizedGain: 5 });
    await page.evaluate(({ portfolioId, holdingId }) => { window.location.hash = `/investments/${portfolioId}/holding/${holdingId}`; }, { portfolioId, holdingId });
    await page.getByTestId("security-price-controls-button").click();
    let dialog = page.getByTestId("security-price-dialog");
    await dialog.getByLabel("Market", { exact: true }).fill("TSX"); await dialog.getByRole("button", { name: "Save market", exact: true }).click();
    await expect(dialog.getByText("ABC · TSX · CAD", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    expect((await invoke("get-realized-gains", range)).gains[0]).toMatchObject({ market: "TSX", recordedMarket: null, quantity: 1, realizedGain: 5 });
    expect((await invoke("get-dividend-income", range)).income.rows[0]).toMatchObject({ market: "TSX", recordedMarket: null, amount: 2 });
    expect((await invoke("get-position-details", { accountId: holdingId, asOfDate: "2026-01-04" })).position).toMatchObject({ market: "TSX", quantity: 1, costBasis: 10, marketValue: null });
    expect(await invoke("get-account-balance", cashId)).toEqual({ success: true, balance: 97 });

    const empty = await invoke("create-market-holding", { portfolioId, tickerSymbol: "PAY", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: cashId, costBasisMethod: "FIFO" }); expect(empty.success).toBe(true);
    expect((await invoke("record-dividend", { portfolioId, tickerSymbol: "PAY", securityAccountId: empty.account.id, amount: 5, date: "2026-01-02" })).success).toBe(true);
    expect(await invoke("get-transactions", empty.account.id)).toEqual([]);
    await page.evaluate(({ portfolioId, id }) => { window.location.hash = `/investments/${portfolioId}/holding/${id}`; }, { portfolioId, id: empty.account.id });
    await page.getByTestId("security-price-controls-button").click(); dialog = page.getByTestId("security-price-dialog");
    await dialog.getByLabel("Market", { exact: true }).fill("TSXV"); await dialog.getByRole("button", { name: "Save market", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("history cannot be relabeled");
    await expect(dialog.getByRole("alert")).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath("dividend-only-market-history.png"), fullPage: true });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await app.stop(); page = await app.launch(); await unlock(page);
    const reopened = await invoke("get-portfolio-accounts", portfolioId);
    expect(reopened.accounts.securities.find((a: any) => a.id === empty.account.id)).toMatchObject({ investmentProperties: { market: "TSX", quantity: 0 } });
    expect((await invoke("get-realized-gains", range)).gains[0]).toMatchObject({ accountId: holdingId, market: "TSX", recordedMarket: null, realizedGain: 5 });
    expect((await invoke("get-dividend-income", range)).income.rows.find((r: any) => r.accountId === empty.account.id)).toMatchObject({ market: "TSX", recordedMarket: "TSX", amount: 5 });
    expect(await invoke("get-account-balance", cashId)).toEqual({ success: true, balance: 102 });
  } catch (error) {
    await test.info().attach("packaged-market-history.log", { body: app.output(), contentType: "text/plain" });
    await test.info().attach("packaged-market-history-state.json", { body: JSON.stringify(await app.diagnostics()), contentType: "application/json" }); throw error;
  } finally { await app.dispose(); }
});
