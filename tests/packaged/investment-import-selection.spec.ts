import { expect, test, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup } from "../../src/services/protectedProfiles";

for (const currency of ["CAD", "USD"]) test(`packaged same-ticker ${currency} statement choices retain holding identity across restart`, async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic selected import passphrase", withIds = currency === "USD";
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
    const portfolio = await invoke("create-investment-portfolio", { name: "Selected statements", currency: "CAD" }); expect(portfolio.success).toBe(true);
    const portfolioId = portfolio.group.id;
    const cash = currency === "CAD" ? portfolio.tradeCashAccount : (await invoke("add-trade-cash-account", { portfolioId, currency })).account;
    const first = await invoke("create-market-holding", { portfolioId, tickerSymbol: "ABC", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" });
    const second = await invoke("create-market-holding", { portfolioId, tickerSymbol: "ABC", market: "NASDAQ", quoteCurrency: currency, tradeCashAccountId: cash.id, costBasisMethod: "FIFO" });
    expect(first.success).toBe(true); expect(second.success).toBe(true);
    const statement = `Date,Type,Ticker,Quantity,Price,Amount${withIds ? ",Id" : ""}\n2026-01-02,buy,ABC,1,10,10${withIds ? ",one" : ""}\n2026-01-02,buy,ABC,1,10,10${withIds ? ",two" : ""}`;
    const open = async () => {
      await page.evaluate((id) => { window.location.hash = `/investments/${id}`; }, portfolioId);
      await page.getByTestId("import-investments-button").click();
      const dialog = page.getByTestId("investment-import-dialog");
      await dialog.getByLabel("Choose CSV File").setInputFiles({ name: "selected.csv", mimeType: "text/csv", buffer: Buffer.from(statement) });
      await dialog.getByRole("button", { name: "Validate & Preview" }).click();
      await expect(dialog.getByTestId("investment-import-row-2")).toBeVisible();
      return dialog;
    };
    let dialog = await open();
    await expect(dialog.getByRole("button", { name: "Import Transactions", exact: true })).toBeDisabled();
    const choose = async () => {
      await dialog.getByLabel("Holding for row 2").selectOption(first.account.id);
      await dialog.getByLabel("Holding for row 3").selectOption(second.account.id);
      await expect(dialog.getByRole("button", { name: "Import Transactions", exact: true })).toBeDisabled();
      await dialog.getByRole("button", { name: "Refresh Preview", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "Import Transactions", exact: true })).toBeEnabled();
    };
    await choose();
    await expect(dialog.getByTestId("investment-import-row-2")).toContainText("CAD");
    await expect(dialog.getByTestId("investment-import-row-3")).toContainText(currency);
    await page.screenshot({ path: test.info().outputPath("selected-statement-holdings.png"), fullPage: true });
    await dialog.getByRole("button", { name: "Import Transactions", exact: true }).click();
    await expect(dialog.getByTestId("investment-import-summary")).toContainText("2 imported. 0 skipped.");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await app.stop(); page = await app.launch(); await unlock(page); dialog = await open();
    if (!withIds) await choose();
    await dialog.getByRole("button", { name: "Import Transactions", exact: true }).click();
    await expect(dialog.getByTestId("investment-import-summary")).toContainText("0 imported. 2 skipped.");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    if (withIds) {
      dialog = await open(); await dialog.getByLabel("Holding for row 2").selectOption(second.account.id);
      await dialog.getByRole("button", { name: "Refresh Preview", exact: true }).click();
      await expect(dialog.getByTestId("investment-import-row-2")).toContainText("Conflicting broker ID");
      await expect(dialog.getByRole("button", { name: "Import Transactions", exact: true })).toBeDisabled();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    }
    const accounts = await invoke("get-portfolio-accounts", portfolioId);
    for (const id of [first.account.id, second.account.id]) expect(accounts.accounts.securities.find((account: any) => account.id === id).investmentProperties.quantity).toBe(1);
  } catch (error) {
    await test.info().attach("packaged-import-selection.log", { body: app.output(), contentType: "text/plain" }); throw error;
  } finally { await app.dispose(); }
});
