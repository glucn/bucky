// @vitest-environment jsdom
import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TransactionEntryModal } from "./TransactionEntryModal";

const invoke = vi.fn();
beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async (channel) => channel === "get-portfolio-accounts" ? { success: true, accounts: { securities: [], tradeCashAccounts: [
    { id: "cad", name: "Broker CAD", currency: "CAD" }, { id: "usd", name: "Broker USD", currency: "USD" },
  ] } } : channel === "get-portfolio-funding-accounts" ? { success: true, accounts: [
    { id: "bank", name: "USD checking", currency: "USD", subtype: "asset", groupId: null, groupName: null },
  ] } : { success: false, error: "Synthetic rejected funding" });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
});

it("submits explicit native funding amounts and retains failed saves for correction", async () => {
  const close = vi.fn(), created = vi.fn();
  render(<TransactionEntryModal isOpen portfolioId="portfolio" initialTransactionType="cash_deposit" onClose={close} onTransactionCreated={created} />);
  await screen.findByRole("option", { name: /USD checking/ });
  fireEvent.change(screen.getByLabelText("Cash account"), { target: { value: "cad" } });
  fireEvent.change(screen.getByLabelText("Other account"), { target: { value: "bank" } });
  fireEvent.change(screen.getByLabelText("Portfolio amount (CAD) *"), { target: { value: "140" } });
  fireEvent.change(screen.getByLabelText("Other account amount (USD) *"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Date *"), { target: { value: "2026-01-02" } });
  fireEvent.click(screen.getByRole("button", { name: "Record Transaction" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Synthetic rejected funding");
  expect(close).not.toHaveBeenCalled(); expect(created).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledWith("deposit-cash", expect.objectContaining({ portfolioId: "portfolio", amount: 140, counterAmount: 100, fromAccountId: "bank", tradeCashAccountId: "cad", date: "2026-01-02", expectedCashCurrency: "CAD", expectedCounterCurrency: "USD" }));
  invoke.mockResolvedValue({ success: true });
  fireEvent.change(screen.getByLabelText("Portfolio amount (CAD) *"), { target: { value: "135" } });
  fireEvent.click(screen.getByRole("button", { name: "Record Transaction" }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(created).toHaveBeenCalledTimes(1);
});

it("clears native amounts when the selected account or funding direction changes", async () => {
  render(<TransactionEntryModal isOpen portfolioId="portfolio" initialTransactionType="cash_deposit" onClose={vi.fn()} />);
  await screen.findByRole("option", { name: /USD checking/ });
  fireEvent.change(screen.getByLabelText("Cash account"), { target: { value: "cad" } });
  fireEvent.change(screen.getByLabelText("Other account"), { target: { value: "bank" } });
  fireEvent.change(screen.getByLabelText("Portfolio amount (CAD) *"), { target: { value: "140" } });
  fireEvent.change(screen.getByLabelText("Other account amount (USD) *"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Cash account"), { target: { value: "usd" } });
  expect((screen.getByLabelText("Portfolio amount (USD) *") as HTMLInputElement).value).toBe("");
  expect(screen.queryByLabelText("Other account amount (USD) *")).toBeNull();
  fireEvent.change(screen.getByLabelText("Cash account"), { target: { value: "cad" } });
  expect((screen.getByLabelText("Other account amount (USD) *") as HTMLInputElement).value).toBe("");
  fireEvent.change(screen.getByLabelText("Portfolio amount (CAD) *"), { target: { value: "140" } });
  fireEvent.change(screen.getByLabelText("Other account amount (USD) *"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Transaction Type"), { target: { value: "cash_withdrawal" } });
  expect((screen.getByLabelText("Portfolio amount (CAD) *") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("Other account amount (USD) *") as HTMLInputElement).value).toBe("");
});

it("does not let a late funding save close another portfolio's dialog", async () => {
  const original = invoke.getMockImplementation()!;
  let finish!: (result: unknown) => void;
  invoke.mockImplementation((channel, ...args) => channel === "deposit-cash" ? new Promise((resolve) => { finish = resolve; }) : original(channel, ...args));
  const close = vi.fn(), created = vi.fn(), props = { isOpen: true, portfolioId: "first", initialTransactionType: "cash_deposit" as const, onClose: close, onTransactionCreated: created };
  const view = render(<TransactionEntryModal {...props} />);
  await screen.findByRole("option", { name: /USD checking/ });
  fireEvent.change(screen.getByLabelText("Cash account"), { target: { value: "usd" } });
  fireEvent.change(screen.getByLabelText("Other account"), { target: { value: "bank" } });
  fireEvent.change(screen.getByLabelText("Portfolio amount (USD) *"), { target: { value: "10" } });
  fireEvent.click(screen.getByRole("button", { name: "Record Transaction" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  view.rerender(<TransactionEntryModal {...props} portfolioId="second" />);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("get-portfolio-accounts", "second"));
  await act(async () => finish({ success: true }));
  expect(close).not.toHaveBeenCalled(); expect(created).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeTruthy();
});
