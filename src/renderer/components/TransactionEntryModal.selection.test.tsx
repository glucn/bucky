// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TransactionEntryModal } from "./TransactionEntryModal";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const accounts = { securities: [
  { id: "tsx", currency: "CAD", investmentProperties: { tickerSymbol: "ABC", market: "TSX" } },
  { id: "nasdaq", currency: "USD", investmentProperties: { tickerSymbol: "ABC", market: "NASDAQ" } },
], tradeCashAccounts: [{ id: "cad", currency: "CAD", name: "Trade Cash CAD" }, { id: "usd", currency: "USD", name: "Trade Cash USD" }] };
it("selects a same-ticker holding by account ID and submits its matching cash account", async () => {
  const invoke = vi.fn(async (channel) => channel === "get-portfolio-accounts" ? { success: true, accounts } : { success: true });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  render(<TransactionEntryModal isOpen portfolioId="portfolio" initialTickerSymbol="ABC" onClose={vi.fn()} />);
  const holding = await screen.findByLabelText("Holding");
  await waitFor(() => expect(holding.querySelectorAll("option").length).toBe(3));
  expect((holding as HTMLSelectElement).value).toBe("");
  fireEvent.change(holding, { target: { value: "nasdaq" } });
  await waitFor(() => expect((screen.getByLabelText("Cash account") as HTMLSelectElement).value).toBe("usd"));
  const values = screen.getAllByPlaceholderText("0.00"); fireEvent.change(values[0], { target: { value: "1" } }); fireEvent.change(values[1], { target: { value: "20" } });
  fireEvent.click(screen.getByRole("button", { name: "Record Transaction" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("record-buy", expect.objectContaining({ tickerSymbol: "ABC", securityAccountId: "nasdaq", tradeCashAccountId: "usd" })));
});
it("requires cash selection for a fee and forwards the chosen account", async () => {
  const invoke = vi.fn(async (channel) => channel === "get-portfolio-accounts" ? { success: true, accounts } : { success: true });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  render(<TransactionEntryModal isOpen portfolioId="portfolio" initialTransactionType="fee" onClose={vi.fn()} />);
  const cash = await screen.findByLabelText("Cash account");
  await waitFor(() => expect(cash.querySelectorAll("option").length).toBe(3));
  expect((screen.getByRole("button", { name: "Record Transaction" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(cash, { target: { value: "usd" } }); fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Record Transaction" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("record-fee", expect.objectContaining({ tradeCashAccountId: "usd", amount: 2 })));
});
