import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup } from "../../src/services/protectedProfiles";

test("packaged portfolio review, renamed settlement setup and imports persist without name-based discovery", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic settlement identity passphrase";
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
    const createGroup = async (name: string, cashName: string) => {
      const group = await invoke("create-account-group", { name, accountType: "user" }); expect(group.success).toBe(true);
      const cash = await invoke("add-account", { name: cashName, type: "user", subtype: "asset", currency: "CAD" }); expect(cash.success).toBe(true);
      expect((await invoke("add-account-to-group", { accountId: cash.account.id, groupId: group.group.id })).success).toBe(true);
      return { group: group.group, cash: cash.account };
    };
    const legacy = await createGroup("Existing broker", "Old settlement"), bank = await createGroup("Bank group", "Trade Cash - Bank group (CAD)");
    await page.evaluate(() => { window.location.hash = "/investments"; });
    await expect(page.getByText("No investment portfolios yet", { exact: true })).toBeVisible();
    const review = page.getByTestId("portfolio-group-review"); await review.locator("summary").click();
    await review.getByLabel("Existing account group").selectOption(legacy.group.id);
    await expect(review).toContainText("Old settlement · CAD");
    await expect(review.getByRole("button", { name: "Use as investment portfolio" })).toBeDisabled();
    await review.getByLabel("Use these accounts as portfolio cash").check();
    await page.screenshot({ path: test.info().outputPath("legacy-portfolio-review.png"), fullPage: true });
    await review.getByRole("button", { name: "Use as investment portfolio" }).click();
    await expect(page.getByRole("heading", { name: "Existing broker", exact: true })).toBeVisible();
    expect((await invoke("get-investment-portfolios", undefined)).portfolios.map((group: any) => group.id)).toEqual([legacy.group.id]);
    expect((await invoke("update-account", { id: legacy.cash.id, name: "Broker reserves" })).success).toBe(true);
    expect((await invoke("update-account-group", { id: legacy.group.id, data: { name: "Retirement book" } })).success).toBe(true);
    await page.evaluate((accountId) => (window as any).electron.setOpeningBalance({ accountId, displayAmount: 100, asOfDate: "2026-01-01" }), legacy.cash.id);
    await app.stop(); page = await app.launch(); await unlock(page);
    await page.evaluate(() => { window.location.hash = "/investments"; });
    await expect(page.getByRole("heading", { name: "Retirement book", exact: true })).toBeVisible();
    await page.getByRole("heading", { name: "Retirement book", exact: true }).click();
    await page.getByTestId("add-holding-button").click();
    const holding = page.getByTestId("new-holding-dialog");
    await holding.getByLabel("Ticker", { exact: true }).fill("ABC"); await holding.getByLabel("Market", { exact: true }).fill("TSX");
    await holding.getByLabel("Cash account", { exact: true }).selectOption(legacy.cash.id);
    await holding.getByLabel("Cost basis method", { exact: true }).selectOption("FIFO");
    await expect(holding.getByLabel("Cash account", { exact: true })).toContainText("Broker reserves");
    await holding.getByRole("button", { name: "Create holding", exact: true }).click(); await expect(holding).toHaveCount(0);
    await page.evaluate((id) => { window.location.hash = `/investments/${id}`; }, legacy.group.id);
    await page.getByTestId("import-investments-button").click(); const dialog = page.getByTestId("investment-import-dialog");
    await dialog.getByLabel("Choose CSV File").setInputFiles({ name: "fee.csv", mimeType: "text/csv", buffer: Buffer.from("Date,Type,Ticker,Amount\n2026-01-02,fee,CASH,4") });
    await dialog.getByLabel("Trade cash account").selectOption(legacy.cash.id);
    await dialog.getByRole("button", { name: "Validate & Preview" }).click(); await dialog.getByRole("button", { name: "Import Transactions", exact: true }).click();
    await expect(dialog.getByTestId("investment-import-summary")).toContainText("1 imported. 0 skipped.");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await app.stop(); page = await app.launch(); await unlock(page);
    expect(await invoke("get-account-balance", legacy.cash.id)).toEqual({ success: true, balance: 96 });
    const listed = await invoke("get-investment-portfolios", undefined);
    expect(listed.portfolios.map((group: any) => group.id)).toEqual([legacy.group.id]);
    expect(listed.reviewCandidates.map((group: any) => group.id)).toContain(bank.group.id);
  } catch (error) {
    await test.info().attach("settlement-cash-identity.log", { body: app.output(), contentType: "text/plain" }); throw error;
  } finally { await app.dispose(); }
});
