import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup, readProtectedProfile } from "../../src/services/protectedProfiles";
import { unlockWithRecovery } from "../../src/services/profileKeys";
import { createEncryptedPrisma } from "../../src/services/encryptedDatabase";

test("reviewed holding baseline survives restart without inventing earlier history", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic reviewed baseline passphrase";
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
    const portfolio = await invoke("create-investment-portfolio", { name: "Legacy holdings", currency: "CAD" });
    const portfolioId = portfolio.group.id;
    const holding = await invoke("create-market-holding", { portfolioId, tickerSymbol: "ABC", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" });
    expect(holding.success).toBe(true);
    const accountId = holding.account.id, identity = { portfolioId, securityAccountId: accountId, tickerSymbol: "ABC" };
    expect((await invoke("record-buy", { ...identity, date: "2026-01-01", quantity: 10, pricePerShare: 10 })).success).toBe(true);
    await app.stop();
    const profile = await readProtectedProfile(app.directory), key = unlockWithRecovery(profile.envelope, pending.recoverySecret, "default"), fixture = createEncryptedPrisma(profile.databaseFile, key);
    try {
      await fixture.$transaction([
        fixture.investmentActivityJournal.deleteMany({ where: { activity: { accountId } } }),
        fixture.investmentActivity.deleteMany({ where: { accountId } }),
        fixture.investmentProperties.update({ where: { accountId }, data: { hasCompleteActivityHistory: false } }),
      ]);
    } finally { await fixture.$disconnect(); key.fill(0); }
    page = await app.launch(); await unlock(page);
    await page.evaluate(({ portfolioId, accountId }) => { window.location.hash = `/investments/${portfolioId}/holding/${accountId}`; }, { portfolioId, accountId });
    await page.getByRole("button", { name: "Review baseline", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Review investment baseline" });
    await expect(dialog).toContainText("ABC · 10 units · CAD 100.00 basis");
    await dialog.getByLabel("Cutover date").fill("2026-01-02");
    await expect(dialog.getByRole("button", { name: "Confirm baseline" })).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Confirm baseline" }).click();
    await expect(dialog).toHaveCount(0);
    expect((await invoke("record-sell", { ...identity, date: "2026-01-03", quantity: 4, pricePerShare: 15 })).success).toBe(true);
    await app.stop(); page = await app.launch(); await unlock(page);
    const position = (asOfDate: string) => invoke("get-position-details", { accountId, asOfDate });
    expect(await position("2026-01-01")).toMatchObject({ success: false, error: expect.stringMatching(/historical holdings/i) });
    expect(await position("2026-01-02")).toMatchObject({ success: true, position: { quantity: 10, costBasis: 100 } });
    expect(await position("2026-01-03")).toMatchObject({ success: true, position: { quantity: 6, costBasis: 60 } });
  } finally { await app.dispose(); }
});
