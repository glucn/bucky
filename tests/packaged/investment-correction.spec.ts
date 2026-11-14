import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup, readProtectedProfile } from "../../src/services/protectedProfiles";
import { unlockWithRecovery } from "../../src/services/profileKeys";
import { createEncryptedPrisma } from "../../src/services/encryptedDatabase";

test("reviewed trade correction updates later gains and retains the original journal after restart", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic trade correction passphrase";
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
    const portfolio = await invoke("create-investment-portfolio", { name: "Trade correction", currency: "CAD" });
    expect(portfolio.success).toBe(true);
    const portfolioId = portfolio.group.id;
    const holding = await invoke("create-market-holding", { portfolioId, tickerSymbol: "ABC", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" });
    expect(holding.success).toBe(true);
    const accountId = holding.account.id, identity = { portfolioId, securityAccountId: accountId, tickerSymbol: "ABC" };
    const buy = await invoke("record-buy", { ...identity, date: "2026-01-01", quantity: 10, pricePerShare: 10 });
    expect(buy.success).toBe(true);
    expect((await invoke("record-sell", { ...identity, date: "2026-01-03", quantity: 5, pricePerShare: 15 })).success).toBe(true);
    await page.evaluate(({ portfolioId, accountId }) => { window.location.hash = `/investments/${portfolioId}/holding/${accountId}`; }, { portfolioId, accountId });
    await page.getByRole("row").filter({ hasText: "2026-01-01" }).getByRole("button", { name: "Correct trade" }).click();
    const dialog = page.getByRole("dialog", { name: "Correct investment trade" });
    await dialog.getByLabel("Price per share (CAD)", { exact: true }).fill("12");
    await dialog.getByLabel("Correction reason", { exact: true }).fill("Broker confirmed execution price");
    await dialog.getByRole("button", { name: "Preview correction" }).click();
    await expect(dialog).toContainText("CAD 50.00 → CAD 60.00");
    await expect(dialog.getByRole("row").filter({ hasText: "2026-01-03" })).toContainText("CAD 25.00 → CAD 15.00");
    await dialog.getByLabel("Price per share (CAD)", { exact: true }).fill("13");
    await expect(dialog.getByRole("button", { name: "Save correction" })).toBeDisabled();
    await dialog.getByLabel("Price per share (CAD)", { exact: true }).fill("12");
    await dialog.getByRole("button", { name: "Preview correction" }).click();
    await dialog.getByRole("button", { name: "Save correction" }).click();
    await expect(dialog).toHaveCount(0);
    await app.stop(); page = await app.launch(); await unlock(page);
    expect(await invoke("get-position-details", { accountId, asOfDate: "2026-01-04" })).toMatchObject({ success: true, position: { quantity: 5, costBasis: 60 } });
    expect(await invoke("get-portfolio-performance", { portfolioId, startDate: "2026-01-01", endDate: "2026-01-04" })).toMatchObject({ success: true, performance: { realizedGains: 15 } });
    await app.stop();
    const profile = await readProtectedProfile(app.directory), key = unlockWithRecovery(profile.envelope, pending.recoverySecret, "default"), db = createEncryptedPrisma(profile.databaseFile, key);
    try {
      const revision = await db.investmentCorrection.findFirstOrThrow({ where: { accountId } });
      expect(revision.reason).toBe("Broker confirmed execution price");
      expect(JSON.parse(revision.beforeJson)[0].journalLinks[0].entry.id).toBe(buy.entry.id);
    } finally { await db.$disconnect(); key.fill(0); }
  } finally { await app.dispose(); }
});
