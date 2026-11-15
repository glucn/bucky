// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AccountSubtype, AccountType } from "../../shared/accountTypes";
import { TransferModal } from "./TransferModal";

vi.mock("../context/AccountsContext", () => ({
  useAccounts: () => ({
    accounts: ["USD", "CAD"].map((currency) => ({
      id: currency, name: currency, currency, type: AccountType.User, subtype: AccountSubtype.Asset,
    })),
    refreshAccounts: vi.fn(),
  }),
}));

it("keeps a saved decimal rate and previews edits at the exact cent boundary", async () => {
  const invoke = vi.fn().mockResolvedValue({ success: true });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  const originalRate = "1.00499999999999999999";
  render(<TransferModal onClose={vi.fn()} onSuccess={vi.fn()} editTransaction={{
    id: "posting", entryId: "journal", date: "2026-01-02", description: "Exchange",
    fromAccountId: "USD", toAccountId: "CAD", amount: 1, amountFrom: 1, amountTo: 1,
    exchangeRate: 1.005, exchangeRateDecimal: originalRate,
  }} />);
  const rate = screen.getByLabelText(/Exchange Rate/) as HTMLInputElement;
  const destination = screen.getByLabelText("Amount in CAD") as HTMLInputElement;
  expect(rate.value).toBe(originalRate);
  expect(destination.value).toBe("1");

  fireEvent.change(rate, { target: { value: "1.005" } });
  expect(destination.value).toBe("1.01");
  fireEvent.change(rate, { target: { value: originalRate } });
  expect(destination.value).toBe("1");
  fireEvent.submit(rate.form!);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("update-transaction", expect.objectContaining({
    amountFrom: 1, amountTo: undefined, exchangeRate: originalRate,
  })));
});

it("submits an entered destination amount without rounding its implied rate first", async () => {
  const invoke = vi.fn().mockResolvedValue({ skipped: false });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  render(<TransferModal onClose={vi.fn()} onSuccess={vi.fn()} fromAccountId="USD" />);
  fireEvent.change(screen.getByLabelText("To Account"), { target: { value: "CAD" } });
  fireEvent.change(screen.getByLabelText("Amount in USD"), { target: { value: "100000" } });
  const destination = screen.getByLabelText("Amount in CAD") as HTMLInputElement;
  fireEvent.change(destination, { target: { value: "100000.01" } });
  expect(destination.value).toBe("100000.01");
  fireEvent.submit(destination.form!);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("add-transaction", expect.objectContaining({
    amountFrom: 100000, amountTo: 100000.01, exchangeRate: undefined,
  })));
});
