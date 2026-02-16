import { beforeEach, describe, expect, it } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";

describe("auto-categorization learning from cleanup", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("creates exact rule from cleanup reassignment", async () => {
    const accounts = await databaseService.getAccounts(true);
    const cash = accounts.find((account) => account.name === "Cash");
    const uncategorizedExpense = accounts.find(
      (account) => account.name === "Uncategorized Expense"
    );
    const groceries = accounts.find((account) => account.name === "Groceries");

    expect(cash).toBeDefined();
    expect(uncategorizedExpense).toBeDefined();
    expect(groceries).toBeDefined();

    const created = await databaseService.createJournalEntry({
      date: "2026-01-12",
      description: "COFFEE BEAN DT VANCOUVER",
      fromAccountId: cash!.id,
      toAccountId: uncategorizedExpense!.id,
      amount: 24.5,
      transactionType: "expense",
    });

    expect(created.skipped).toBe(false);

    const cashLine = created.entry?.lines.find((line: any) => line.accountId === cash!.id);
    expect(cashLine).toBeDefined();

    await databaseService.updateJournalEntryLine({
      lineId: cashLine.id,
      fromAccountId: cash!.id,
      toAccountId: groceries!.id,
      amount: 24.5,
      date: "2026-01-12",
      description: "COFFEE BEAN DT VANCOUVER",
      transactionType: "expense",
      source: "cleanup",
    });

    const rule = await databaseService.prismaClient.autoCategorizationRule.findUnique({
      where: {
        normalizedPattern_matchType: {
          normalizedPattern: "coffee bean dt vancouver",
          matchType: "exact",
        },
      },
    });

    expect(rule).toBeDefined();
    expect(rule?.targetCategoryAccountId).toBe(groceries!.id);
    expect(rule?.lastConfirmedAt).toBeTruthy();
  });

  it("updates existing learned rule target and confirmation timestamp", async () => {
    const accounts = await databaseService.getAccounts(true);
    const cash = accounts.find((account) => account.name === "Cash");
    const uncategorizedExpense = accounts.find(
      (account) => account.name === "Uncategorized Expense"
    );
    const groceries = accounts.find((account) => account.name === "Groceries");
    const diningOut = accounts.find((account) => account.name === "Dining Out");

    expect(cash).toBeDefined();
    expect(uncategorizedExpense).toBeDefined();
    expect(groceries).toBeDefined();
    expect(diningOut).toBeDefined();

    const createImportedExpense = async () => {
      const created = await databaseService.createJournalEntry({
        date: "2026-01-12",
        description: "COFFEE BEAN DT VANCOUVER",
        fromAccountId: cash!.id,
        toAccountId: uncategorizedExpense!.id,
        amount: 24.5,
        transactionType: "expense",
      });

      const cashLine = created.entry?.lines.find((line: any) => line.accountId === cash!.id);
      expect(cashLine).toBeDefined();
      return cashLine;
    };

    const firstCashLine = await createImportedExpense();
    await databaseService.updateJournalEntryLine({
      lineId: firstCashLine.id,
      fromAccountId: cash!.id,
      toAccountId: groceries!.id,
      amount: 24.5,
      date: "2026-01-12",
      description: "COFFEE BEAN DT VANCOUVER",
      transactionType: "expense",
      source: "cleanup",
    });

    const firstRule = await databaseService.prismaClient.autoCategorizationRule.findUnique({
      where: {
        normalizedPattern_matchType: {
          normalizedPattern: "coffee bean dt vancouver",
          matchType: "exact",
        },
      },
    });

    expect(firstRule).toBeDefined();
    expect(firstRule?.targetCategoryAccountId).toBe(groceries!.id);
    expect(firstRule?.lastConfirmedAt).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 5));

    const secondCashLine = await createImportedExpense();
    await databaseService.updateJournalEntryLine({
      lineId: secondCashLine.id,
      fromAccountId: cash!.id,
      toAccountId: diningOut!.id,
      amount: 24.5,
      date: "2026-01-12",
      description: "COFFEE BEAN DT VANCOUVER",
      transactionType: "expense",
      source: "cleanup",
    });

    const updatedRule = await databaseService.prismaClient.autoCategorizationRule.findUnique({
      where: {
        normalizedPattern_matchType: {
          normalizedPattern: "coffee bean dt vancouver",
          matchType: "exact",
        },
      },
    });

    expect(updatedRule).toBeDefined();
    expect(updatedRule?.targetCategoryAccountId).toBe(diningOut!.id);
    expect(updatedRule?.lastConfirmedAt).toBeTruthy();
    expect(updatedRule?.lastConfirmedAt?.getTime()).toBeGreaterThan(
      firstRule!.lastConfirmedAt!.getTime()
    );
  });

  it("does not learn rule when transaction update source is not cleanup", async () => {
    const accounts = await databaseService.getAccounts(true);
    const cash = accounts.find((account) => account.name === "Cash");
    const uncategorizedExpense = accounts.find(
      (account) => account.name === "Uncategorized Expense"
    );
    const groceries = accounts.find((account) => account.name === "Groceries");

    expect(cash).toBeDefined();
    expect(uncategorizedExpense).toBeDefined();
    expect(groceries).toBeDefined();

    const created = await databaseService.createJournalEntry({
      date: "2026-01-12",
      description: "COFFEE BEAN DT VANCOUVER",
      fromAccountId: cash!.id,
      toAccountId: uncategorizedExpense!.id,
      amount: 24.5,
      transactionType: "expense",
    });

    const cashLine = created.entry?.lines.find((line: any) => line.accountId === cash!.id);
    expect(cashLine).toBeDefined();

    await databaseService.updateJournalEntryLine({
      lineId: cashLine.id,
      fromAccountId: cash!.id,
      toAccountId: groceries!.id,
      amount: 24.5,
      date: "2026-01-12",
      description: "COFFEE BEAN DT VANCOUVER",
      transactionType: "expense",
      source: "manual-edit",
    });

    const rule = await databaseService.prismaClient.autoCategorizationRule.findUnique({
      where: {
        normalizedPattern_matchType: {
          normalizedPattern: "coffee bean dt vancouver",
          matchType: "exact",
        },
      },
    });

    expect(rule).toBeNull();
  });
});
