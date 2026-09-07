import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSubtype, AccountType } from "../shared/accountTypes";
import { autoCategorizationService } from "./autoCategorizationService";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";

const prisma = databaseService.prismaClient;
const account = (name: string, currency = "USD", subtype = AccountSubtype.Asset) =>
  databaseService.createAccount({ name, currency, subtype, type: AccountType.User });
const snapshot = () => prisma.journalEntry.findMany({
  orderBy: { id: "asc" }, include: { lines: { orderBy: { id: "asc" } } },
});

describe("Journal mutation integrity", () => {
  beforeEach(resetTestDatabase);
  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_posting_update');
  });

  async function fixture(currency = "USD") {
    const from = await account("Source");
    const to = await account("Destination", currency);
    const result = await databaseService.createJournalEntry({
      fromAccountId: from.id, toAccountId: to.id, date: "2026-08-01", amount: 100,
      ...(currency !== "USD" ? { type: "currency_transfer", amountFrom: 100, amountTo: 135 } : {}),
    });
    const entry = result.entry!;
    const edit = {
      lineId: entry.lines.find((line: any) => line.accountId === from.id).id,
      fromAccountId: from.id, toAccountId: to.id, amount: 200,
      date: "2026-08-02", description: "Updated transfer", transactionType: "transfer" as const,
    };
    return { from, to, entry, edit };
  }

  it("rolls back the entry and first posting when the second posting write fails", async () => {
    const { entry, edit, to } = await fixture();
    const before = await snapshot();
    const lineId = entry.lines.find((line: any) => line.accountId === to.id).id;
    // Real SQLite failure after the first posting update; no mocked transaction semantics.
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_posting_update BEFORE UPDATE OF amount
      ON JournalLine WHEN OLD.id = '${lineId}' BEGIN SELECT RAISE(ABORT, 'posting failure'); END`);
    await expect(databaseService.updateJournalEntryLine(edit)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it("rolls back cleanup edits if learning the associated rule fails", async () => {
    const { edit } = await fixture();
    const before = await snapshot();
    vi.spyOn(autoCategorizationService, "upsertExactRuleFromCleanupAction")
      .mockRejectedValueOnce(new Error("learning failed"));
    await expect(databaseService.updateJournalEntryLine({ ...edit, source: "cleanup" }))
      .rejects.toThrow("learning failed");
    expect(await snapshot()).toEqual(before);
  });

  it("rolls back creation when a backfill opening-balance adjustment fails", async () => {
    const from = await account("Source");
    const to = await account("Destination");
    await databaseService.setOpeningBalance({ accountId: to.id, displayAmount: 500, asOfDate: "2026-09-01" });
    const before = await snapshot();
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_posting_update BEFORE UPDATE OF amount
      ON JournalLine BEGIN SELECT RAISE(ABORT, 'adjustment failure'); END`);
    await expect(databaseService.createJournalEntry({ fromAccountId: from.id, toAccountId: to.id,
      amount: 100, date: "2026-08-01" })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it("edits FX postings with distinct amounts and updates the exchange rate", async () => {
    const { edit, from, to } = await fixture("CAD");
    const updated = await databaseService.updateJournalEntryLine({ ...edit,
      type: "currency_transfer", amountFrom: 200, amountTo: 280, exchangeRate: 1.4,
    } as any);
    expect(updated.type).toBe("currency_transfer");
    expect(updated.lines.find((line: any) => line.accountId === from.id))
      .toMatchObject({ amount: -200, currency: "USD", exchangeRate: 1.4 });
    expect(updated.lines.find((line: any) => line.accountId === to.id))
      .toMatchObject({ amount: 280, currency: "CAD", exchangeRate: 1.4 });
  });

  it("rejects incomplete FX edits instead of converting them to equal-amount postings", async () => {
    const { edit } = await fixture("CAD");
    const before = await snapshot();
    await expect(databaseService.updateJournalEntryLine(edit)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    { date: "2026-02-30" }, { postingDate: "2026-07-01" }, { amount: Infinity },
    { amount: NaN }, { toAccountId: "missing-account" },
  ])("rejects invalid edit input without changing the book: %j", async (invalid) => {
    const { edit } = await fixture();
    const before = await snapshot();
    await expect(databaseService.updateJournalEntryLine({ ...edit, ...invalid })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it("rejects self-transfers before changing any posting", async () => {
    const { edit } = await fixture();
    const before = await snapshot();
    await expect(databaseService.updateJournalEntryLine({ ...edit, toAccountId: edit.fromAccountId }))
      .rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it("keeps borrowing from a liability balanced", async () => {
    const credit = await account("Credit line", "USD", AccountSubtype.Liability);
    const cash = await account("Cash proceeds");
    const result = await databaseService.createJournalEntry({ fromAccountId: credit.id,
      toAccountId: cash.id, amount: 100, date: "2026-08-01", transactionType: "transfer" });
    expect(result.entry.lines.find((line: any) => line.accountId === credit.id).amount).toBe(-100);
    expect(result.entry.lines.reduce((sum: number, line: any) => sum + line.amount, 0)).toBe(0);
  });
});
