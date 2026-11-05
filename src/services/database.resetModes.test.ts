import { beforeEach, expect, it, vi } from "vitest";
import { databaseService } from "./database";
import { appSettingsService } from "./appSettingsService";
import { resetTestDatabase } from "./database.test.utils";

beforeEach(resetTestDatabase);

async function context() {
  await appSettingsService.setBaseCurrency("CAD");
  await appSettingsService.setAppSetting("enrichment.ui", { panelOpen: true });
  const cash = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Cash" } });
  await databaseService.setOpeningBalance({ accountId: cash.id, displayAmount: 123.45, asOfDate: "2026-09-01" });
}

it("data reset retains explicit currency, clears book-derived settings, and reseeds in that currency", async () => {
  await context();
  await databaseService.resetAllData({ mode: "data" });
  expect(await appSettingsService.getBaseCurrency()).toBe("CAD");
  expect(await appSettingsService.getBaseCurrencyReconciliationState()).toBeNull();
  expect(await appSettingsService.getAppSetting("enrichment.ui")).toBeNull();
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
  const accounts = await databaseService.getAccounts(true);
  expect(accounts.length).toBeGreaterThan(0);
  expect(accounts.every((account) => account.currency === "CAD")).toBe(true);
  expect(await databaseService.prismaClient.appSetting.count()).toBe(1);
});

it("factory reset clears all setup and leaves no currency-dependent defaults", async () => {
  await context();
  await databaseService.resetAllData({ mode: "factory" });
  expect(await databaseService.prismaClient.appSetting.count()).toBe(0);
  expect(await databaseService.prismaClient.account.count()).toBe(0);
  expect(await databaseService.prismaClient.accountGroup.count()).toBe(0);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});

it.each([undefined, {}, { mode: "invalid" }, { mode: "data", preserveBaseCurrency: true }])("refuses ambiguous reset input %j before changing the book", async (request) => {
  await context();
  const accounts = await databaseService.getAccounts(true);
  await expect(databaseService.resetAllData(request as any)).rejects.toThrow(/mode|input/i);
  expect(await databaseService.getAccounts(true)).toEqual(accounts);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(1);
});

it.each([null, "cad", "CHF", 123])("refuses data reset without supported explicit currency %j", async (currency) => {
  await context(); await appSettingsService.setAppSetting("baseCurrency", currency);
  const entries = await databaseService.prismaClient.journalEntry.findMany();
  await expect(databaseService.resetAllData({ mode: "data" })).rejects.toThrow(/currency/i);
  expect(await databaseService.prismaClient.journalEntry.findMany()).toEqual(entries);
  expect(await appSettingsService.getAppSetting("baseCurrency")).toEqual(currency);
});

it("rolls back data deletion and setup preservation when reseeding fails", async () => {
  await context(); const accounts = await databaseService.getAccounts(true);
  const seed = vi.spyOn(databaseService, "ensureDefaultAccounts").mockRejectedValueOnce(new Error("Synthetic seed failure"));
  try { await expect(databaseService.resetAllData({ mode: "data" })).rejects.toThrow(/seed failure/i); }
  finally { seed.mockRestore(); }
  expect(await databaseService.getAccounts(true)).toEqual(accounts);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(1);
  expect(await appSettingsService.getBaseCurrencyReconciliationState()).toMatchObject({ targetBaseCurrency: "CAD", status: "pending" });
});
