import { beforeEach, expect, it, vi } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { bookSetupService } from "./bookSetup";

beforeEach(async () => { await databaseService.resetAllData({ mode: "factory" }); });

it("requires explicit setup for missing, malformed, and unsupported currency without seeding", async () => {
  for (const raw of [undefined, '"cad"', '"CHF"', '123', 'broken-json']) {
    await databaseService.prismaClient.appSetting.deleteMany();
    if (raw !== undefined) await databaseService.prismaClient.appSetting.create({ data: { key: "baseCurrency", jsonValue: raw } });
    expect(await bookSetupService.getState()).toEqual({ required: true });
    expect(await databaseService.prismaClient.account.count()).toBe(0);
  }
});

it("atomically selects currency and seeds an empty book, then refuses to overwrite completed setup", async () => {
  await bookSetupService.complete("CAD");
  expect(await bookSetupService.getState()).toEqual({ required: false });
  const accounts = await databaseService.getAccounts(true);
  expect(accounts.length).toBeGreaterThan(0); expect(accounts.every((row) => row.currency === "CAD")).toBe(true);
  await expect(bookSetupService.complete("EUR")).rejects.toThrow(/already/i);
  expect(await databaseService.getAccounts(true)).toEqual(accounts);
  expect(JSON.parse((await databaseService.prismaClient.appSetting.findUniqueOrThrow({ where: { key: "baseCurrency" } })).jsonValue)).toBe("CAD");
});

it("preserves legacy account currencies and postings exactly, and requires valuation review", async () => {
  await resetTestDatabase();
  const cash = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Cash" } });
  await databaseService.setOpeningBalance({ accountId: cash.id, displayAmount: 432.1, asOfDate: "2026-09-01" });
  const accounts = await databaseService.getAccounts(true), entries = await databaseService.prismaClient.journalEntry.findMany({ include: { lines: true } });
  await bookSetupService.complete("CAD");
  expect(await databaseService.getAccounts(true)).toEqual(accounts);
  expect(await databaseService.prismaClient.journalEntry.findMany({ include: { lines: true } })).toEqual(entries);
  const state = await databaseService.prismaClient.appSetting.findUniqueOrThrow({ where: { key: "baseCurrencyReconciliationState" } });
  expect(JSON.parse(state.jsonValue)).toMatchObject({ targetBaseCurrency: "CAD", status: "pending" });
});

it("rolls back currency selection if default seeding fails and permits retry", async () => {
  const seed = vi.spyOn(databaseService, "ensureDefaultAccounts").mockRejectedValueOnce(new Error("Synthetic seed failure"));
  try { await expect(bookSetupService.complete("JPY")).rejects.toThrow(/seed failure/i); }
  finally { seed.mockRestore(); }
  expect(await bookSetupService.getState()).toEqual({ required: true });
  expect(await databaseService.prismaClient.appSetting.count()).toBe(0);
  expect(await databaseService.prismaClient.account.count()).toBe(0);
  await bookSetupService.complete("JPY");
  expect((await databaseService.getAccounts(true)).every((account) => account.currency === "JPY")).toBe(true);
});

it("rejects a competing setup while the first currency transaction owns initialization", async () => {
  const original = databaseService.ensureDefaultAccounts.bind(databaseService);
  let finish!: () => void;
  const seed = vi.spyOn(databaseService, "ensureDefaultAccounts").mockImplementationOnce(async (tx) => {
    await new Promise<void>((resolve) => { finish = resolve; }); await original(tx);
  });
  const first = bookSetupService.complete("CAD");
  await vi.waitFor(() => expect(finish).toBeDefined());
  try { await expect(bookSetupService.complete("EUR")).rejects.toThrow(/progress/i); }
  finally { finish(); await first; seed.mockRestore(); }
  expect((await databaseService.getAccounts(true)).every((row) => row.currency === "CAD")).toBe(true);
});

it.each(["", "cad", "CHF", null, { currency: "CAD" }])("rejects invalid setup currency %j without writes", async (currency) => {
  await expect(bookSetupService.complete(currency as any)).rejects.toThrow(/currency/i);
  expect(await databaseService.prismaClient.appSetting.count()).toBe(0);
  expect(await databaseService.prismaClient.account.count()).toBe(0);
});
