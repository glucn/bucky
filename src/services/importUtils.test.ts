import { describe, it, expect } from "vitest";
import { resolveImportAccounts } from "./importUtils";
import { AccountSubtype } from "../shared/accountTypes";

const incomeId = "income-id";
const expenseId = "expense-id";

describe("resolveImportAccounts", () => {
  it("routes asset inflows to Uncategorized Income", () => {
    const result = resolveImportAccounts({
      userAccountId: "user-id",
      userAccountSubtype: AccountSubtype.Asset,
      amount: 50,
      uncategorizedIncomeId: incomeId,
      uncategorizedExpenseId: expenseId,
    });

    expect(result.error).toBeUndefined();
    expect(result.fromAccountId).toBe(incomeId);
    expect(result.toAccountId).toBe("user-id");
    expect(result.usedDefault).toBe(true);
    expect(result.defaultAccountName).toBe("Uncategorized Income");
  });

  it("routes asset outflows to Uncategorized Expense", () => {
    const result = resolveImportAccounts({
      userAccountId: "user-id",
      userAccountSubtype: AccountSubtype.Asset,
      amount: -20,
      uncategorizedIncomeId: incomeId,
      uncategorizedExpenseId: expenseId,
    });

    expect(result.error).toBeUndefined();
    expect(result.fromAccountId).toBe("user-id");
    expect(result.toAccountId).toBe(expenseId);
    expect(result.usedDefault).toBe(true);
    expect(result.defaultAccountName).toBe("Uncategorized Expense");
  });

  it("routes liability increases to Uncategorized Expense", () => {
    const result = resolveImportAccounts({
      userAccountId: "user-id",
      userAccountSubtype: AccountSubtype.Liability,
      amount: 75,
      uncategorizedIncomeId: incomeId,
      uncategorizedExpenseId: expenseId,
    });

    expect(result.error).toBeUndefined();
    expect(result.fromAccountId).toBe("user-id");
    expect(result.toAccountId).toBe(expenseId);
    expect(result.usedDefault).toBe(true);
    expect(result.defaultAccountName).toBe("Uncategorized Expense");
  });

  it("routes liability decreases to Uncategorized Income", () => {
    const result = resolveImportAccounts({
      userAccountId: "user-id",
      userAccountSubtype: AccountSubtype.Liability,
      amount: -75,
      uncategorizedIncomeId: incomeId,
      uncategorizedExpenseId: expenseId,
    });

    expect(result.error).toBeUndefined();
    expect(result.fromAccountId).toBe(incomeId);
    expect(result.toAccountId).toBe("user-id");
    expect(result.usedDefault).toBe(true);
    expect(result.defaultAccountName).toBe("Uncategorized Income");
  });

  it("passes through mapped counter accounts", () => {
    const result = resolveImportAccounts({
      userAccountId: "user-id",
      userAccountSubtype: AccountSubtype.Asset,
      amount: -10,
      toAccountId: "mapped-id",
      uncategorizedIncomeId: incomeId,
      uncategorizedExpenseId: expenseId,
    });

    expect(result.error).toBeUndefined();
    expect(result.fromAccountId).toBe("user-id");
    expect(result.toAccountId).toBe("mapped-id");
    expect(result.usedDefault).toBe(false);
    expect(result.defaultAccountName).toBeNull();
  });
});
