import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { AccountSubtype, AccountType } from "../shared/accountTypes";

beforeEach(resetTestDatabase);
it("limits ordinary balances to the requested day even when the account has no checkpoint", async () => {
  const cash = await databaseService.createAccount({ name: "Dated cash", type: AccountType.User, subtype: AccountSubtype.Asset, currency: "USD" });
  const category = await databaseService.prismaClient.account.findFirstOrThrow({ where: { type: AccountType.Category } });
  await databaseService.setOpeningBalance({ accountId: cash.id, displayAmount: 100, asOfDate: "2026-01-01" });
  await databaseService.createJournalEntry({ fromAccountId: cash.id, toAccountId: category.id, amount: 30, date: "2026-01-03", description: "Later payment" });
  expect(await databaseService.prismaClient.checkpoint.count({ where: { accountId: cash.id } })).toBe(0);
  expect(await databaseService.getAccountBalanceAtDate(cash.id, "2025-12-31")).toBe(0);
  expect(await databaseService.getAccountBalanceAtDate(cash.id, "2026-01-02")).toBe(100);
  expect(await databaseService.getAccountBalanceAtDate(cash.id, "2026-01-03")).toBe(70);
  expect(await databaseService.getAccountBalanceAtDate(cash.id, "1/2/2026")).toBe(100);
});
it("rejects impossible cutoff dates before querying the ledger", async () => {
  await expect(databaseService.getAccountBalanceAtDate("missing", "2026-02-30")).rejects.toThrow(/date/i);
});
