import { describe, expect, it } from "vitest";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";
import {
  buildCleanupDestinationOptions,
  filterCleanupDestinationOptions,
  isPlaceholderCounterpartyName,
} from "./placeholderCleanup";

const accounts = [
  {
    id: "cat-income",
    name: "Salary",
    type: AccountType.Category,
    subtype: AccountSubtype.Asset,
  },
  {
    id: "user-checking",
    name: "Checking",
    type: AccountType.User,
    subtype: AccountSubtype.Asset,
  },
  {
    id: "cat-expense",
    name: "Groceries",
    type: AccountType.Category,
    subtype: AccountSubtype.Liability,
  },
];

describe("isPlaceholderCounterpartyName", () => {
  it("returns true for uncategorized placeholders", () => {
    expect(isPlaceholderCounterpartyName("Uncategorized Income")).toBe(true);
    expect(isPlaceholderCounterpartyName("Uncategorized Expense")).toBe(true);
  });

  it("returns false for non-placeholder names", () => {
    expect(isPlaceholderCounterpartyName("Groceries")).toBe(false);
    expect(isPlaceholderCounterpartyName("")).toBe(false);
  });
});

describe("buildCleanupDestinationOptions", () => {
  it("orders categories before user accounts", () => {
    const options = buildCleanupDestinationOptions(accounts, { includeUserAccounts: true });

    expect(options.map((option) => option.group)).toEqual([
      "category",
      "category",
      "user",
    ]);
  });

  it("supports category-only mode", () => {
    const options = buildCleanupDestinationOptions(accounts, { includeUserAccounts: false });

    expect(options).toHaveLength(2);
    expect(options.every((option) => option.group === "category")).toBe(true);
  });
});

describe("filterCleanupDestinationOptions", () => {
  it("filters by destination name", () => {
    const options = buildCleanupDestinationOptions(accounts, { includeUserAccounts: true });

    const filtered = filterCleanupDestinationOptions(options, "check");

    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("Checking");
  });
});
