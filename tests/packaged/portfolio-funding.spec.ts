import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup } from "../../src/services/protectedProfiles";

test("packaged native and FX funding select cash explicitly, retain refusals and persist both accounts", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic portfolio funding passphrase";
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
    const portfolio = await invoke("create-investment-portfolio", { name: "Funding book", currency: "CAD" }); expect(portfolio.success).toBe(true);
    const portfolioId = portfolio.group.id, cadId = portfolio.tradeCashAccount.id;
    const usd = await invoke("add-trade-cash-account", { portfolioId, currency: "USD" }); expect(usd.success).toBe(true);
    const bank = await invoke("add-account", { name: "USD checking", type: "user", currency: "USD" }); expect(bank.success).toBe(true);
    expect((await invoke("update-account", { id: usd.account.id, name: "USD settlement" })).success).toBe(true);
    for (const [accountId, displayAmount] of [[cadId, 100], [bank.account.id, 500]] as const) {
      await page.evaluate((input) => (window as any).electron.setOpeningBalance({ ...input, asOfDate: "2026-01-01" }), { accountId, displayAmount });
    }
    const open = async (withdrawal: boolean, cashId: string, amount: string, date: string, otherAmount?: string) => {
      await page.evaluate((id) => { window.location.hash = `/investments/${id}`; }, portfolioId);
      await page.getByRole("button", { name: "Deposit/Withdraw Cash", exact: true }).click();
      const dialog = page.getByTestId("transaction-entry-dialog");
      await dialog.getByLabel("Transaction Type", { exact: true }).selectOption(withdrawal ? "cash_withdrawal" : "cash_deposit");
      await dialog.getByLabel("Cash account", { exact: true }).selectOption(cashId);
      await dialog.getByLabel("Other account", { exact: true }).selectOption(bank.account.id);
      await dialog.getByLabel(`Portfolio amount (${cashId === cadId ? "CAD" : "USD"}) *`, { exact: true }).fill(amount);
      if (otherAmount) await dialog.getByLabel("Other account amount (USD) *", { exact: true }).fill(otherAmount);
      await dialog.getByLabel("Date *", { exact: true }).fill(date);
      return dialog;
    };
    let dialog = await open(false, usd.account.id, "100", "2026-01-02");
    await expect(dialog.getByLabel("Other account amount (USD) *", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Record Transaction", exact: true }).click(); await expect(dialog).toHaveCount(0);
    dialog = await open(false, cadId, "140", "2026-01-03", "100");
    await expect(dialog).toContainText("Implied rate: 1 USD = 1.4 CAD");
    await page.screenshot({ path: test.info().outputPath("fx-portfolio-deposit.png"), fullPage: true });
    await dialog.getByRole("button", { name: "Record Transaction", exact: true }).click(); await expect(dialog).toHaveCount(0);
    dialog = await open(true, cadId, "70", "2026-01-04", "50");
    await dialog.getByRole("button", { name: "Record Transaction", exact: true }).click(); await expect(dialog).toHaveCount(0);
    dialog = await open(true, cadId, "1000", "2026-01-05", "700");
    await dialog.getByRole("button", { name: "Record Transaction", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Insufficient trade cash balance");
    await expect(dialog.getByLabel("Portfolio amount (CAD) *", { exact: true })).toHaveValue("1000");
    await expect(dialog.getByLabel("Other account amount (USD) *", { exact: true })).toHaveValue("700");
    await dialog.getByLabel("Portfolio amount (CAD) *", { exact: true }).fill("14");
    await dialog.getByLabel("Other account amount (USD) *", { exact: true }).fill("10");
    await dialog.getByRole("button", { name: "Record Transaction", exact: true }).click(); await expect(dialog).toHaveCount(0);
    await app.stop(); page = await app.launch(); await unlock(page);
    for (const [accountId, balance] of [[cadId, 156], [usd.account.id, 100], [bank.account.id, 360]] as const) {
      expect(await invoke("get-account-balance", accountId)).toEqual({ success: true, balance });
    }
    const report = await invoke("get-portfolio-performance", { portfolioId, startDate: "2026-01-01", endDate: "2026-01-05" });
    expect(report).toMatchObject({ success: true, performance: { deposits: null, withdrawals: 84, closingValue: null, cashFlows: { depositsByCurrency: { CAD: 240, USD: 100 }, withdrawalsByCurrency: { CAD: 84 } } } });
    const statement = { accountId: cadId, date: "2026-01-03", balance: 245, description: "January statement" };
    expect(await invoke("create-checkpoint", statement)).toMatchObject({ success: false, error: expect.stringMatching(/review/i) });
    const reviewed = await invoke("review-checkpoint", statement);
    expect(reviewed).toMatchObject({ success: true, preview: { journalBalance: 240, statementBalance: 245, adjustmentAmount: 5 } });
    const checkpoint = await invoke("create-checkpoint", { ...statement, reviewToken: reviewed.preview.token });
    expect(checkpoint).toMatchObject({ success: true, checkpoint: { adjustmentAmount: 5 } });
    const checkpointId = checkpoint.checkpoint.checkpoint.id;
    expect(await invoke("reconcile-checkpoint", { checkpointId })).toMatchObject({ success: false, error: expect.stringMatching(/review/i) });
    const replacement = await invoke("review-checkpoint-reconciliation", checkpointId);
    expect(replacement).toMatchObject({ success: true, preview: { journalBalance: 240, previousAdjustmentAmount: 5, adjustmentAmount: 5 } });
    const reconciled = await invoke("reconcile-checkpoint", { checkpointId, reviewToken: replacement.preview.token });
    expect(reconciled).toMatchObject({ success: true, checkpoint: { adjustmentAmount: 5 } });
    expect(await invoke("delete-checkpoint", reconciled.checkpoint.checkpoint.id)).toMatchObject({ success: true });
    expect(await invoke("get-account-balance", cadId)).toEqual({ success: true, balance: 156 });
  } catch (error) {
    await test.info().attach("portfolio-funding.log", { body: app.output(), contentType: "text/plain" }); throw error;
  } finally { await app.dispose(); }
});
