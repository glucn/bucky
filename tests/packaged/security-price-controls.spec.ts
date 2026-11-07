import { test, expect, type Page, type Locator } from "@playwright/test";
import path from "path";
import { personalAppHarness } from "./launchPersonalApp";
import { ProtectedProfileSetup, readProtectedProfile } from "../../src/services/protectedProfiles";
import { unlockWithRecovery } from "../../src/services/profileKeys";
import { createEncryptedPrisma } from "../../src/services/encryptedDatabase";

test("packaged market assignment, price correction, CSV and reviewed legacy promotion persist without stale overwrites", async () => {
  const app = await personalAppHarness(), passphrase = "Synthetic price controls passphrase";
  const unlock = async (page: Page) => {
    await page.getByLabel("Passphrase", { exact: true }).fill(passphrase); await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.getByRole("link", { name: "Accounts", exact: true }).first()).toBeVisible();
  };
  const preview = async (dialog: Locator) => {
    await dialog.getByRole("button", { name: "Preview prices", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Save reviewed prices", exact: true })).toBeVisible();
    await dialog.getByLabel(/I verified these are unadjusted completed/).check();
  };
  const save = async (dialog: Locator, outcome: string) => {
    await dialog.getByRole("button", { name: "Save reviewed prices", exact: true }).click(); await expect(dialog.getByRole("status")).toContainText(outcome);
  };
  try {
    const setup = new ProtectedProfileSetup(app.directory, path.resolve("prisma/migrations"));
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase }); await setup.confirm(pending.setupId, pending.recoverySecret);
    let page = await app.launch();
    expect(await page.evaluate(async () => { try { await (window as any).electron.ipcRenderer.invoke("get-security-price-context", { accountId: "locked" }); return "unexpected"; } catch (error) { return String(error); } })).toMatch(/locked/i);
    await unlock(page);
    const portfolio = await page.evaluate(() => (window as any).electron.ipcRenderer.invoke("create-investment-portfolio", { name: "Price review", currency: "CAD" }));
    expect(portfolio.success).toBe(true); const portfolioId = portfolio.group.id;
    await page.evaluate((accountId) => (window as any).electron.setOpeningBalance({ accountId, displayAmount: 1000, asOfDate: "2026-01-01" }), portfolio.tradeCashAccount.id);
    expect((await page.evaluate((portfolioId) => (window as any).electron.ipcRenderer.invoke("record-buy", { portfolioId, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2026-01-02" }), portfolioId)).success).toBe(true);
    const accounts = await page.evaluate((id) => (window as any).electron.ipcRenderer.invoke("get-portfolio-accounts", id), portfolioId), accountId = accounts.accounts.securities[0].id;
    expect((await page.evaluate(() => (window as any).electron.ipcRenderer.invoke("record-market-price", { tickerSymbol: "ABC", price: 19, date: "2026-01-04", source: "manual" }))).success).toBe(true);
    await app.stop();
    const profile = await readProtectedProfile(app.directory), key = unlockWithRecovery(profile.envelope, pending.recoverySecret, "default"), fixture = createEncryptedPrisma(profile.databaseFile, key);
    try { await fixture.securityDailyPrice.create({ data: { ticker: "ABC", market: "TSX", marketDate: "2026-01-03", close: 999 } }); }
    finally { await fixture.$disconnect(); key.fill(0); }
    page = await app.launch(); await unlock(page);
    await page.evaluate(({ portfolioId, accountId }) => { window.location.hash = `/investments/${portfolioId}/holding/${accountId}`; }, { portfolioId, accountId });
    await page.getByTestId("security-price-controls-button").click();
    let dialog = page.getByTestId("security-price-dialog");
    await expect(dialog.getByText("ABC · Market needs review · CAD", { exact: true })).toBeVisible();
    await dialog.getByLabel("Market", { exact: true }).fill("TSX"); await dialog.getByRole("button", { name: "Save market", exact: true }).click();
    await expect(dialog.getByText("ABC · TSX · CAD", { exact: true })).toBeVisible();
    await dialog.getByLabel("Price date", { exact: true }).fill("2026-01-03"); await dialog.getByLabel("Price in CAD", { exact: true }).fill("12");
    await dialog.getByLabel("Existing dates", { exact: true }).selectOption("fill"); await preview(dialog); await save(dialog, "0 inserted · 0 corrected · 1 retained");
    expect((await page.evaluate((accountId) => (window as any).electron.ipcRenderer.invoke("get-position-details", { accountId }), accountId)).position.marketPrice).toBeNull();
    await dialog.getByLabel("Existing dates", { exact: true }).selectOption("correct"); await preview(dialog); await save(dialog, "0 inserted · 1 corrected · 0 retained");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByText("TSX · Close as of 2026-01-03", { exact: true })).toBeVisible();
    expect((await page.evaluate((accountId) => (window as any).electron.ipcRenderer.invoke("get-position-details", { accountId }), accountId)).position.marketValue).toBe(120);
    await page.getByTestId("security-price-controls-button").click(); dialog = page.getByTestId("security-price-dialog");
    await dialog.getByLabel("Price source", { exact: true }).selectOption("import");
    await dialog.getByLabel("Price CSV file", { exact: true }).setInputFiles({ name: "prices.csv", mimeType: "text/csv", buffer: Buffer.from("Date,Price\n2026-01-05,15\n2026-01-06,16") });
    await dialog.getByLabel("Existing dates", { exact: true }).selectOption("fill"); await preview(dialog); await save(dialog, "2 inserted · 0 corrected · 0 retained");
    await dialog.getByLabel("Price source", { exact: true }).selectOption("legacy"); await dialog.getByLabel("Select legacy price 2026-01-04", { exact: true }).check();
    await preview(dialog); await save(dialog, "1 inserted · 0 corrected · 0 retained");
    await dialog.getByLabel("Price source", { exact: true }).selectOption("manual"); await dialog.getByLabel("Existing dates", { exact: true }).selectOption("correct");
    await dialog.getByLabel("Price date", { exact: true }).fill("2026-01-06"); await dialog.getByLabel("Price in CAD", { exact: true }).fill("18"); await preview(dialog);
    const external = await page.evaluate(async (accountId) => {
      const input = { accountId, expectedMarket: "TSX", source: "manual", mode: "correct", confirmRawClose: true, points: [{ date: "2026-01-06", price: 17 }] };
      const reviewed = await (window as any).electron.ipcRenderer.invoke("preview-security-prices", input);
      return (window as any).electron.ipcRenderer.invoke("save-security-prices", { ...input, expected: reviewed.preview.rows });
    }, accountId); expect(external.success).toBe(true);
    await dialog.getByRole("button", { name: "Save reviewed prices", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Prices changed");
    await expect(dialog.getByRole("alert")).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath("reviewed-security-prices.png"), fullPage: true });
    await dialog.getByLabel("Exclude price 2026-01-05", { exact: true }).click();
    await expect(dialog.getByRole("status")).toContainText("Price excluded from valuation; original value retained");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await app.stop(); page = await app.launch(); await unlock(page);
    expect(await page.evaluate((accountId) => (window as any).electron.ipcRenderer.invoke("get-position-details", { accountId }), accountId)).toMatchObject({ success: true, position: { market: "TSX", marketPrice: 17, marketValue: 170 } });
    const retained = await page.evaluate((accountId) => (window as any).electron.ipcRenderer.invoke("get-security-price-context", { accountId }), accountId);
    expect(retained.context.legacyPrices).toEqual([expect.objectContaining({ date: "2026-01-04", price: 19 })]);
    expect(retained.context.prices.find((point: any) => point.date === "2026-01-05")).toMatchObject({ price: 15, source: "import", barStatus: "unknown" });
  } catch (error) { await test.info().attach("security-price-controls.log", { body: app.output(), contentType: "text/plain" }); throw error; }
  finally { await app.dispose(); }
});
