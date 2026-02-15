// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManualTransactionModal } from "./ManualTransactionModal";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";

vi.mock("../context/AccountsContext", () => ({
  useAccounts: () => ({
    accounts: [
      {
        id: "from-account",
        name: "Checking",
        type: AccountType.User,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
      {
        id: "category-account",
        name: "Groceries",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
      },
      {
        id: "user-destination",
        name: "Savings",
        type: AccountType.User,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
    ],
    refreshAccounts: vi.fn(),
  }),
}));

describe("ManualTransactionModal destination selection", () => {
  it("uses category/counter account label", () => {
    render(
      <ManualTransactionModal
        accountId="from-account"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("Category / Counter Account")).toBeTruthy();
  });

  it("shows category and user account destinations", () => {
    render(
      <ManualTransactionModal
        accountId="from-account"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const select = screen.getByTestId("manual-transaction-category");
    expect(select.textContent).toContain("Groceries");
    expect(select.textContent).toContain("Savings");
    expect(select.textContent).not.toContain("Checking");
  });
});
