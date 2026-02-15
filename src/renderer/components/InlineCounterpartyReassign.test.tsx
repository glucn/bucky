// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";
import { InlineCounterpartyReassign } from "./InlineCounterpartyReassign";

const accounts = [
  {
    id: "income-cat",
    name: "Salary",
    type: AccountType.Category,
    subtype: AccountSubtype.Asset,
  },
  {
    id: "expense-cat",
    name: "Groceries",
    type: AccountType.Category,
    subtype: AccountSubtype.Liability,
  },
  {
    id: "other-account",
    name: "Savings",
    type: AccountType.User,
    subtype: AccountSubtype.Asset,
  },
  {
    id: "current-account",
    name: "Checking",
    type: AccountType.User,
    subtype: AccountSubtype.Asset,
  },
];

describe("InlineCounterpartyReassign", () => {
  it("shows category options by default", () => {
    render(
      <InlineCounterpartyReassign
        accounts={accounts}
        fromAccountId="current-account"
        isSubmitting={false}
        onApply={vi.fn()}
      />
    );

    const picker = screen.getByTestId("cleanup-destination-picker");
    expect(picker.textContent).toContain("Groceries");
    expect(picker.textContent).not.toContain("Savings");
  });

  it("includes user accounts when show-all is enabled", () => {
    render(
      <InlineCounterpartyReassign
        accounts={accounts}
        fromAccountId="current-account"
        isSubmitting={false}
        onApply={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("cleanup-show-all-toggle"));

    const picker = screen.getByTestId("cleanup-destination-picker");
    expect(picker.textContent).toContain("Savings");
    expect(picker.textContent).not.toContain("Checking");
  });

  it("calls apply with selected account id", () => {
    const onApply = vi.fn();
    render(
      <InlineCounterpartyReassign
        accounts={accounts}
        fromAccountId="current-account"
        isSubmitting={false}
        onApply={onApply}
      />
    );

    fireEvent.change(screen.getByTestId("cleanup-destination-picker"), {
      target: { value: "expense-cat" },
    });
    fireEvent.click(screen.getByTestId("cleanup-apply-button"));

    expect(onApply).toHaveBeenCalledWith("expense-cat");
  });
});
