import { expect, test, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup } from "../../src/services/protectedProfiles";

const passphrase = "Synthetic investment import acceptance passphrase";
async function unlock(page: Page) {
  await page.getByLabel("Passphrase", { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
}
async function openStatement(page: Page, portfolioId: string, data: string, cashAccountId?: string) {
  await page.evaluate((id) => { window.location.hash = `/investments/${id}`; }, portfolioId);
  await page.getByTestId("import-investments-button").click();
  const dialog = page.getByTestId("investment-import-dialog");
  await dialog.getByLabel("Choose CSV File").setInputFiles({ name: "synthetic.csv", mimeType: "text/csv", buffer: Buffer.from(data) });
  if (cashAccountId) await dialog.getByLabel("Trade cash account").selectOption(cashAccountId);
  await dialog.getByRole("button", { name: "Validate & Preview" }).click();
  await expect(dialog.getByRole("button", { name: "Import Transactions", exact: true })).toBeVisible();
  return dialog;
}
for (const withIds of [true, false]) test(`packaged statement review ${withIds ? "retains identical broker-ID trades and overlapping reimports across restart" : "requires explicit additional trades and preserves partial errors on retry"}`, async () => {
  const app = await personalAppHarness();
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase }); await setup.confirm(pending.setupId, pending.recoverySecret);
    let page = await app.launch(); await unlock(page);
    const portfolio = await page.evaluate(() => (window as any).electron.ipcRenderer.invoke("create-investment-portfolio", { name: "Synthetic imports", currency: "CAD" }));
    expect(portfolio.success).toBe(true);
    const portfolioId = portfolio.group.id, cashId = portfolio.tradeCashAccount.id;
    if (withIds) expect((await page.evaluate((id) => (window as any).electron.ipcRenderer.invoke("add-trade-cash-account", { portfolioId: id, currency: "USD" }), portfolioId)).success).toBe(true);
    const opening = await page.evaluate((accountId) => (window as any).electron.setOpeningBalance({ accountId, displayAmount: 1000, asOfDate: "2026-01-01" }), cashId);
    expect(opening.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: cashId, amount: 1000 })]));
    const header = `Date,Type,Ticker,Quantity,Price,Amount,Fee,Description${withIds ? ",Id" : ""}`;
    const row = `2026-01-02,buy,ABC,10,10,100,1,Initial${withIds ? ",buy-1" : ""}`;
    const first = [header, row, withIds ? row.replace("buy-1", "buy-2") : row].join("\n");
    let dialog = await openStatement(page, portfolioId, first, withIds ? cashId : undefined);
    if (!withIds) await dialog.getByLabel("Import row 3 as an additional transaction").check();
    await page.screenshot({ path: test.info().outputPath("investment-import-review.png"), fullPage: true });
    await dialog.getByRole("button", { name: "Import Transactions", exact: true }).click();
    await expect(dialog.getByTestId("investment-import-summary")).toContainText("2 imported. 0 skipped.");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await app.stop(); page = await app.launch(); await unlock(page);
    if (withIds) {
      const overlap = [header, row.replace("Initial,buy-1", "Changed wording,buy-2"), "2026-01-03,buy,ABC,1,11,11,0,New,buy-3"].join("\n");
      dialog = await openStatement(page, portfolioId, overlap, cashId);
      await expect(dialog.getByTestId("investment-import-row-2")).toContainText("Matching row");
      await dialog.getByRole("button", { name: "Import Transactions", exact: true }).click();
      await expect(dialog.getByTestId("investment-import-summary")).toContainText("1 imported. 1 skipped.");
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      dialog = await openStatement(page, portfolioId, overlap, cashId);
      await dialog.getByRole("button", { name: "Import Transactions", exact: true }).click();
      await expect(dialog.getByTestId("investment-import-summary")).toContainText("0 imported. 2 skipped.");
    } else {
      const partial = [header, "2026-01-03,fee,CASH,,,5,0,Charge", "2026-01-03,sell,ABC,100,12,1200,0,Oversell"].join("\n");
      dialog = await openStatement(page, portfolioId, partial);
      await dialog.getByRole("button", { name: "Import Transactions", exact: true }).click();
      await expect(dialog.getByTestId("investment-import-summary")).toContainText("1 imported. 1 skipped. 1 need review.");
      await expect(dialog.getByTestId("investment-import-errors")).toContainText("Insufficient shares");
      await dialog.getByRole("button", { name: "Review again", exact: true }).click();
      await dialog.getByRole("button", { name: "Import Transactions", exact: true }).click();
      await expect(dialog.getByTestId("investment-import-summary")).toContainText("0 imported. 2 skipped. 1 need review.");
      await expect(dialog.getByTestId("investment-import-errors")).toContainText("Insufficient shares");
    }
    expect(await page.evaluate((id) => (window as any).electron.ipcRenderer.invoke("get-account-balance", id), cashId)).toEqual({ success: true, balance: withIds ? 787 : 793 });
    const accounts = await page.evaluate((id) => (window as any).electron.ipcRenderer.invoke("get-portfolio-accounts", id), portfolioId);
    expect(accounts.accounts.securities[0].investmentProperties.quantity).toBe(withIds ? 21 : 20);
  } catch (error) {
    await test.info().attach("packaged-investment-import.log", { body: app.output(), contentType: "text/plain" }); throw error;
  } finally { await app.dispose(); }
});
