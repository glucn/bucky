import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup, readProtectedProfile } from "../../src/services/protectedProfiles";
import { unlockWithRecovery } from "../../src/services/profileKeys";
import { createEncryptedPrisma } from "../../src/services/encryptedDatabase";

test("packaged quote currency review confirms missing units and refuses conflicting valuation and trades", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic quote currency passphrase";
  const unlock = async (page: Page) => {
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase); await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
  };
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase }); await setup.confirm(pending.setupId, pending.recoverySecret);
    let page = await app.launch(); await unlock(page);
    const invoke = (channel: string, params: unknown) => page.evaluate(({ channel, params }) => (window as any).electron.ipcRenderer.invoke(channel, params), { channel, params });
    const portfolio = await invoke("create-investment-portfolio", { name: "Quote safety", currency: "CAD" }); expect(portfolio.success).toBe(true);
    const portfolioId = portfolio.group.id;
    const holding = await invoke("create-market-holding", { portfolioId, tickerSymbol: "ABC", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" }); expect(holding.success).toBe(true);
    const accountId = holding.account.id;
    expect((await invoke("record-buy", { portfolioId, securityAccountId: accountId, tickerSymbol: "ABC", quantity: 2, pricePerShare: 10, date: "2026-01-02" })).success).toBe(true);
    const input = { accountId, expectedMarket: "TSX", source: "manual", mode: "fill", points: [{ date: "2026-01-02", price: 12 }], confirmRawClose: true };
    const preview = await invoke("preview-security-prices", input); expect(preview.success).toBe(true);
    expect((await invoke("save-security-prices", { ...input, expected: preview.preview.rows.map(({ date, price, token }: any) => ({ date, price, token })) })).success).toBe(true);
    const changeUnit = async (quoteCurrency: string | null) => {
      await app.stop();
      const profile = await readProtectedProfile(app.directory), key = unlockWithRecovery(profile.envelope, pending.recoverySecret, "default");
      const fixture = createEncryptedPrisma(profile.databaseFile, key);
      try { await fixture.securityMetadata.update({ where: { ticker_market: { ticker: "ABC", market: "TSX" } }, data: { quoteCurrency } }); }
      finally { await fixture.$disconnect(); key.fill(0); }
      page = await app.launch(); await unlock(page);
      await page.evaluate(({ portfolioId, accountId }) => { window.location.hash = `/investments/${portfolioId}/holding/${accountId}`; }, { portfolioId, accountId });
    };
    await changeUnit(null);
    await expect(page.getByTestId("missing-enrichment-cta")).toContainText("Quote currency is unconfirmed");
    expect((await invoke("get-position-details", { accountId })).position).toMatchObject({ marketPrice: null, marketValue: null, quantity: 2, costBasis: 20 });
    await page.getByRole("button", { name: "Review market currency" }).click();
    let dialog = page.getByTestId("security-price-dialog");
    await expect(dialog.getByLabel("Price in CAD")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Confirm market currency" }).click();
    await expect(dialog.getByLabel("Price in CAD")).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByTestId("missing-enrichment-cta")).toHaveCount(0);
    expect((await invoke("get-position-details", { accountId })).position).toMatchObject({ marketPrice: 12, marketValue: 24 });

    await changeUnit("USD");
    await expect(page.getByTestId("missing-enrichment-cta")).toContainText("USD conflicts with holding currency CAD");
    await expect(page.getByText("Market Value", { exact: true }).locator("..")).toContainText("N/A");
    await page.getByRole("button", { name: "Review market currency" }).click(); dialog = page.getByTestId("security-price-dialog");
    await expect(dialog.getByRole("alert")).toContainText("USD conflicts");
    await expect(dialog.getByLabel("Price in CAD")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Buy", exact: true }).click();
    await page.getByPlaceholder("0.00", { exact: true }).nth(0).fill("1");
    await page.getByPlaceholder("0.00", { exact: true }).nth(1).fill("10");
    await page.locator('input[type="date"]').fill("2026-01-03");
    await page.getByRole("button", { name: "Record Transaction", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("USD conflicts");
    await expect(page.getByRole("heading", { name: "Record Transaction", exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("quote-unit-conflict.png"), fullPage: true });
    expect((await invoke("get-position-details", { accountId })).position).toMatchObject({ quantity: 2, costBasis: 20, marketPrice: null, marketValue: null });
    expect(await invoke("get-account-balance", portfolio.tradeCashAccount.id)).toEqual({ success: true, balance: -20 });
  } catch (error) {
    await test.info().attach("packaged-quote-currency.log", { body: app.output(), contentType: "text/plain" });
    throw error;
  } finally { await app.dispose(); }
});
