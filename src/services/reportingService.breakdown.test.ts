import { beforeEach, describe, expect, it } from "vitest";
import { appSettingsService } from "./appSettingsService";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { reportingService } from "./reportingService";

function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("reportingService breakdown report", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await appSettingsService.setBaseCurrency("USD");
  });

  it("supports presets and custom ranges with future-date clamp", async () => {
    const thisMonth = await reportingService.getIncomeExpenseBreakdownReport({
      preset: "THIS_MONTH",
    });
    const custom = await reportingService.getIncomeExpenseBreakdownReport({
      preset: "CUSTOM",
      customRange: {
        startDate: dateOffset(-10),
        endDate: dateOffset(10),
      },
    });

    expect(thisMonth.range.preset).toBe("THIS_MONTH");
    expect(custom.range.startDate).toBe(dateOffset(-10));
    expect(custom.range.endDate).toBe(dateOffset(0));
  });

  it("builds separate income/expense tables with amount-desc order and net income KPI", async () => {
    const accounts = await databaseService.getAccounts(true);
    const cash = accounts.find((account) => account.name === "Cash");
    const salary = accounts.find((account) => account.name === "Salary");
    const interest = accounts.find((account) => account.name === "Interest Income");
    const groceries = accounts.find((account) => account.name === "Groceries");
    const rent = accounts.find((account) => account.name === "Rent");

    if (!cash || !salary || !interest || !groceries || !rent) {
      throw new Error("Expected default seed accounts to exist");
    }

    await databaseService.createJournalEntry({
      date: dateOffset(-5),
      amount: 1000,
      description: "Salary",
      fromAccountId: salary.id,
      toAccountId: cash.id,
    });

    await databaseService.createJournalEntry({
      date: dateOffset(-4),
      amount: 200,
      description: "Interest",
      fromAccountId: interest.id,
      toAccountId: cash.id,
    });

    await databaseService.createJournalEntry({
      date: dateOffset(-3),
      amount: 350,
      description: "Rent",
      fromAccountId: cash.id,
      toAccountId: rent.id,
    });

    await databaseService.createJournalEntry({
      date: dateOffset(-2),
      amount: 150,
      description: "Groceries",
      fromAccountId: cash.id,
      toAccountId: groceries.id,
    });

    const payload = await reportingService.getIncomeExpenseBreakdownReport({
      preset: "LAST_3_MONTHS",
    });

    expect(payload.incomeRows.length).toBeGreaterThan(0);
    expect(payload.expenseRows.length).toBeGreaterThan(0);
    expect(payload.incomeRows[0].amount).toBeGreaterThanOrEqual(payload.incomeRows[1]?.amount ?? 0);
    expect(payload.expenseRows[0].amount).toBeGreaterThanOrEqual(payload.expenseRows[1]?.amount ?? 0);
    expect(payload.kpis.incomeTotal).toBe(1200);
    expect(payload.kpis.expenseTotal).toBe(500);
    expect(payload.kpis.netIncome).toBe(700);
    expect(payload.incomeRows[0].categoryName).toBe("Salary");
    expect(payload.incomeRows[0].ratio).toBe(0.83);
    expect(payload.incomeRows[1].categoryName).toBe("Interest Income");
    expect(payload.incomeRows[1].ratio).toBe(0.17);
    expect(payload.expenseRows[0].categoryName).toBe("Rent");
    expect(payload.expenseRows[0].ratio).toBe(0.7);
    expect(payload.expenseRows[1].categoryName).toBe("Groceries");
    expect(payload.expenseRows[1].ratio).toBe(0.3);
  });

  it("includes Unassigned rows when uncategorized transactions are present", async () => {
    const accounts = await databaseService.getAccounts(true);
    const cash = accounts.find((account) => account.name === "Cash");
    const uncategorizedIncome = accounts.find((account) => account.name === "Uncategorized Income");
    const uncategorizedExpense = accounts.find((account) => account.name === "Uncategorized Expense");

    if (!cash || !uncategorizedIncome || !uncategorizedExpense) {
      throw new Error("Expected default uncategorized accounts to exist");
    }

    await databaseService.createJournalEntry({
      date: dateOffset(-3),
      amount: 220,
      description: "Unknown income",
      fromAccountId: uncategorizedIncome.id,
      toAccountId: cash.id,
    });

    await databaseService.createJournalEntry({
      date: dateOffset(-2),
      amount: 170,
      description: "Unknown expense",
      fromAccountId: cash.id,
      toAccountId: uncategorizedExpense.id,
    });

    const payload = await reportingService.getIncomeExpenseBreakdownReport({
      preset: "LAST_3_MONTHS",
    });

    const incomeUnassigned = payload.incomeRows.find((row) => row.categoryId === "UNASSIGNED");
    const expenseUnassigned = payload.expenseRows.find((row) => row.categoryId === "UNASSIGNED");

    expect(incomeUnassigned).toBeDefined();
    expect(incomeUnassigned?.categoryName).toBe("Unassigned");
    expect(incomeUnassigned?.amount).toBe(220);
    expect(incomeUnassigned?.ratio).toBe(1);
    expect(expenseUnassigned).toBeDefined();
    expect(expenseUnassigned?.categoryName).toBe("Unassigned");
    expect(expenseUnassigned?.amount).toBe(170);
    expect(expenseUnassigned?.ratio).toBe(1);
  });
});
