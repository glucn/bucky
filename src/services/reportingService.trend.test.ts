import { beforeEach, describe, expect, it } from "vitest";
import { AccountSubtype, AccountType } from "../shared/accountTypes";
import { appSettingsService } from "./appSettingsService";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { reportingService } from "./reportingService";

function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

describe("reportingService trend report", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await appSettingsService.setBaseCurrency("USD");
  });

  it("supports strict month-based presets and deterministic month ordering", async () => {
    const report3 = await reportingService.getIncomeExpenseTrendReport({
      preset: "LAST_3_MONTHS",
    });
    const report6 = await reportingService.getIncomeExpenseTrendReport({
      preset: "LAST_6_MONTHS",
    });
    const report12 = await reportingService.getIncomeExpenseTrendReport({
      preset: "LAST_12_MONTHS",
    });
    const reportYtd = await reportingService.getIncomeExpenseTrendReport({
      preset: "YTD",
    });

    expect(report3.months).toHaveLength(3);
    expect(report6.months).toHaveLength(6);
    expect(report12.months).toHaveLength(12);
    expect(reportYtd.months.length).toBeGreaterThanOrEqual(1);
    expect(reportYtd.months.length).toBeLessThanOrEqual(12);

    const monthKeys = report6.months.map((month) => month.monthKey);
    expect([...monthKeys].sort()).toEqual(monthKeys);
    expect(report6.range.startMonthKey).toBe(report6.months[0].monthKey);
    expect(report6.range.endMonthKey).toBe(report6.months[report6.months.length - 1].monthKey);
  });

  it("excludes transfer and future entries while including unassigned category contributions", async () => {
    const accounts = await databaseService.getAccounts(true);
    const cash = accounts.find((account) => account.name === "Cash");
    const bank = accounts.find((account) => account.name === "Bank");
    const salary = accounts.find((account) => account.name === "Salary");
    const groceries = accounts.find((account) => account.name === "Groceries");
    const uncategorizedIncome = accounts.find((account) => account.name === "Uncategorized Income");
    const uncategorizedExpense = accounts.find((account) => account.name === "Uncategorized Expense");

    if (!cash || !bank || !salary || !groceries || !uncategorizedIncome || !uncategorizedExpense) {
      throw new Error("Expected default seed accounts to exist");
    }

    const safeCurrentDay = Math.max(1, new Date().getDate() - 1);
    const todayMonthDate = new Date();
    todayMonthDate.setDate(safeCurrentDay);
    const thisMonthDate = todayMonthDate.toISOString().slice(0, 10);

    await databaseService.createJournalEntry({
      date: thisMonthDate,
      amount: 1000,
      description: "Salary",
      fromAccountId: salary.id,
      toAccountId: cash.id,
    });

    await databaseService.createJournalEntry({
      date: thisMonthDate,
      amount: 250,
      description: "Groceries",
      fromAccountId: cash.id,
      toAccountId: groceries.id,
    });

    await databaseService.createJournalEntry({
      date: thisMonthDate,
      amount: 220,
      description: "Unassigned income",
      fromAccountId: uncategorizedIncome.id,
      toAccountId: cash.id,
    });

    await databaseService.createJournalEntry({
      date: thisMonthDate,
      amount: 170,
      description: "Unassigned expense",
      fromAccountId: cash.id,
      toAccountId: uncategorizedExpense.id,
    });

    await databaseService.createJournalEntry({
      date: thisMonthDate,
      amount: 999,
      description: "Internal transfer",
      fromAccountId: cash.id,
      toAccountId: bank.id,
    });

    await databaseService.createJournalEntry({
      date: dateOffset(2),
      amount: 300,
      description: "Future salary",
      fromAccountId: salary.id,
      toAccountId: cash.id,
    });

    const payload = await reportingService.getIncomeExpenseTrendReport({
      preset: "LAST_3_MONTHS",
    });

    const thisMonthKey = thisMonthDate.slice(0, 7);
    const thisMonthBucket = payload.months.find((month) => month.monthKey === thisMonthKey);

    expect(thisMonthBucket).toBeDefined();
    expect(thisMonthBucket?.income).toBe(1220);
    expect(thisMonthBucket?.expense).toBe(420);
    expect(thisMonthBucket?.netIncome).toBe(800);
    expect(payload.metadata.includesUnassignedImplicitly).toBe(true);
  });

  it("returns positive income/expense values in month buckets", async () => {
    const openingBalanceEquity = await databaseService.prismaClient.account.create({
      data: {
        name: "Temp Equity",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
    });

    const wallet = await databaseService.createAccount({
      name: "Temp Wallet",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "USD",
    });

    const expenseCategory = await databaseService.createAccount({
      name: "Temp Expense",
      type: AccountType.Category,
      subtype: AccountSubtype.Liability,
      currency: "USD",
    });

    await databaseService.createJournalEntry({
      date: dateOffset(-2),
      amount: 500,
      description: "Income transaction",
      fromAccountId: openingBalanceEquity.id,
      toAccountId: wallet.id,
    });

    await databaseService.createJournalEntry({
      date: dateOffset(-1),
      amount: 100,
      description: "Expense transaction",
      fromAccountId: wallet.id,
      toAccountId: expenseCategory.id,
    });

    const payload = await reportingService.getIncomeExpenseTrendReport({
      preset: "LAST_3_MONTHS",
    });

    expect(payload.months.every((month) => month.income >= 0)).toBe(true);
    expect(payload.months.every((month) => month.expense >= 0)).toBe(true);
  });
});
