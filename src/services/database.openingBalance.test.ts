import { beforeEach, describe, expect, it } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { AccountSubtype, AccountType } from "../shared/accountTypes";

describe("Opening Balance Workflow", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("should create an opening balance entry with a system equity counter-account", async () => {
    const account = await databaseService.createAccount({
      name: "Checking",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "USD",
    });

    await databaseService.setOpeningBalance({
      accountId: account.id,
      displayAmount: 120.5,
      asOfDate: "2024-02-01",
    });

    const entry = await databaseService.prismaClient.journalEntry.findFirst({
      where: {
        entryType: "opening-balance",
        lines: { some: { accountId: account.id } },
      },
      include: { lines: true },
    });

    expect(entry).not.toBeNull();
    expect(entry?.date).toBe("2024-02-01");
    expect(entry?.entryType).toBe("opening-balance");

    const accountLine = entry?.lines.find((line) => line.accountId === account.id);
    const equityLine = entry?.lines.find((line) => line.accountId !== account.id);

    expect(accountLine?.amount).toBe(120.5);
    expect(equityLine?.amount).toBe(-120.5);

    const equityAccount = await databaseService.prismaClient.account.findFirst({
      where: { name: "Opening Balances", type: AccountType.System },
    });
    expect(equityAccount).not.toBeNull();
  });

  it("should treat liability opening balances as amounts owed", async () => {
    const liabilityAccount = await databaseService.createAccount({
      name: "Credit Card",
      type: AccountType.User,
      subtype: AccountSubtype.Liability,
      currency: "USD",
    });

    await databaseService.setOpeningBalance({
      accountId: liabilityAccount.id,
      displayAmount: 250,
      asOfDate: "2024-03-01",
    });

    const entry = await databaseService.prismaClient.journalEntry.findFirst({
      where: {
        entryType: "opening-balance",
        lines: { some: { accountId: liabilityAccount.id } },
      },
      include: { lines: true },
    });

    const accountLine = entry?.lines.find(
      (line) => line.accountId === liabilityAccount.id
    );

    expect(accountLine?.amount).toBe(-250);

    const openingBalance = await databaseService.getOpeningBalanceForAccount(
      liabilityAccount.id
    );
    expect(openingBalance?.displayAmount).toBe(250);
  });

  it("should adjust opening balance when older transactions are inserted, updated, and deleted", async () => {
    const primaryAccount = await databaseService.createAccount({
      name: "Primary",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "USD",
    });
    const offsetAccount = await databaseService.createAccount({
      name: "Offset",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "USD",
    });

    await databaseService.setOpeningBalance({
      accountId: primaryAccount.id,
      displayAmount: 100,
      asOfDate: "2024-02-01",
    });

    const createResult = await databaseService.createJournalEntry({
      date: "2024-01-15",
      description: "Older transaction",
      fromAccountId: offsetAccount.id,
      toAccountId: primaryAccount.id,
      amount: 50,
    });

    expect(createResult.skipped).toBe(false);
    const createdEntry = createResult.entry;

    const openingEntryAfterInsert = await databaseService.prismaClient.journalEntry.findFirst({
      where: {
        entryType: "opening-balance",
        lines: { some: { accountId: primaryAccount.id } },
      },
      include: { lines: true },
    });
    const openingLineAfterInsert = openingEntryAfterInsert?.lines.find(
      (line) => line.accountId === primaryAccount.id
    );
    expect(openingLineAfterInsert?.amount).toBe(50);

    const balanceAfterInsert = await databaseService.getAccountBalance(primaryAccount.id);
    expect(balanceAfterInsert).toBe(100);

    const primaryLine = createdEntry.lines.find(
      (line: any) => line.accountId === primaryAccount.id
    );
    expect(primaryLine).toBeTruthy();

    await databaseService.updateJournalEntryLine({
      lineId: primaryLine.id,
      fromAccountId: offsetAccount.id,
      toAccountId: primaryAccount.id,
      amount: 50,
      date: "2024-02-15",
      description: "Moved later",
    });

    const openingEntryAfterMove = await databaseService.prismaClient.journalEntry.findFirst({
      where: {
        entryType: "opening-balance",
        lines: { some: { accountId: primaryAccount.id } },
      },
      include: { lines: true },
    });
    const openingLineAfterMove = openingEntryAfterMove?.lines.find(
      (line) => line.accountId === primaryAccount.id
    );
    expect(openingLineAfterMove?.amount).toBe(100);

    const balanceAfterMove = await databaseService.getAccountBalance(primaryAccount.id);
    expect(balanceAfterMove).toBe(150);

    const updatedEntry = await databaseService.prismaClient.journalEntry.findUnique({
      where: { id: createdEntry.id },
      include: { lines: true },
    });
    const updatedPrimaryLine = updatedEntry?.lines.find(
      (line) => line.accountId === primaryAccount.id
    );

    await databaseService.updateJournalEntryLine({
      lineId: updatedPrimaryLine!.id,
      fromAccountId: offsetAccount.id,
      toAccountId: primaryAccount.id,
      amount: 50,
      date: "2024-01-20",
      description: "Moved earlier",
    });

    const openingEntryAfterMoveBack = await databaseService.prismaClient.journalEntry.findFirst({
      where: {
        entryType: "opening-balance",
        lines: { some: { accountId: primaryAccount.id } },
      },
      include: { lines: true },
    });
    const openingLineAfterMoveBack = openingEntryAfterMoveBack?.lines.find(
      (line) => line.accountId === primaryAccount.id
    );
    expect(openingLineAfterMoveBack?.amount).toBe(50);

    const balanceAfterMoveBack = await databaseService.getAccountBalance(primaryAccount.id);
    expect(balanceAfterMoveBack).toBe(100);

    await databaseService.deleteJournalEntry(createdEntry.id);

    const openingEntryAfterDelete = await databaseService.prismaClient.journalEntry.findFirst({
      where: {
        entryType: "opening-balance",
        lines: { some: { accountId: primaryAccount.id } },
      },
      include: { lines: true },
    });
    const openingLineAfterDelete = openingEntryAfterDelete?.lines.find(
      (line) => line.accountId === primaryAccount.id
    );
    expect(openingLineAfterDelete?.amount).toBe(100);

    const balanceAfterDelete = await databaseService.getAccountBalance(primaryAccount.id);
    expect(balanceAfterDelete).toBe(100);
  });
});
