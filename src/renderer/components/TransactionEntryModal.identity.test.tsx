// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TransactionEntryModal } from "./TransactionEntryModal";
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("defaults a new investment transaction to the local book day across UTC midnight", () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-01-03T01:00:00Z"));
  vi.spyOn(Date.prototype, "getFullYear").mockReturnValue(2026);
  vi.spyOn(Date.prototype, "getMonth").mockReturnValue(0);
  vi.spyOn(Date.prototype, "getDate").mockReturnValue(2);
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke: vi.fn().mockResolvedValue({ success: false }) } } });
  const { container } = render(<TransactionEntryModal isOpen portfolioId="portfolio" onClose={vi.fn()} />);
  expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe("2026-01-02");
});

it("posts a position's selected account identity rather than relying on its ticker", async () => {
  const invoke = vi.fn(async (channel) => channel === "get-portfolio-accounts" ? { success: true, accounts: { securities: [{ id: "selected-listing", currency: "USD", investmentProperties: { tickerSymbol: "ABC", market: "NASDAQ" } }], tradeCashAccounts: [{ id: "cash", name: "Trade Cash", currency: "USD" }] } } : { success: true });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  const props: any = { isOpen: true, portfolioId: "portfolio", initialTickerSymbol: "ABC", initialSecurityAccountId: "selected-listing", onClose: vi.fn() };
  const { container } = render(<TransactionEntryModal {...props} />);
  await waitFor(() => expect((screen.getByLabelText("Holding") as HTMLSelectElement).value).toBe("selected-listing"));
  await waitFor(() => expect((screen.getByLabelText("Cash account") as HTMLSelectElement).value).toBe("cash"));
  const inputs = screen.getAllByPlaceholderText("0.00");
  fireEvent.change(inputs[0], { target: { value: "1" } }); fireEvent.change(inputs[1], { target: { value: "12" } });
  fireEvent.submit(container.querySelector("form")!);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("record-buy", expect.objectContaining({ tickerSymbol: "ABC", securityAccountId: "selected-listing" })));
});

it("offers review with the rejected backdated trade and leaves it unsaved until confirmation", async () => {
  const invoke = vi.fn(async (channel: string, _params: unknown) => channel === "get-portfolio-accounts"
    ? { success: true, accounts: { securities: [{ id: "holding", currency: "CAD", investmentProperties: { tickerSymbol: "ABC" } }], tradeCashAccounts: [{ id: "cash", currency: "CAD" }] } }
    : channel === "record-buy" ? { success: false, code: "investment-replay-required", error: "Backdated trade" }
      : { success: true, preview: { reviewToken: "preview", before: { quantity: 1, costBasis: 10 }, after: { quantity: 2, costBasis: 22 }, affected: [] } });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  render(<TransactionEntryModal isOpen portfolioId="portfolio" onClose={vi.fn()} />);
  await waitFor(() => expect((screen.getByLabelText("Cash account") as HTMLSelectElement).value).toBe("cash"));
  fireEvent.change(screen.getByLabelText("Date *"), { target: { value: "2026-01-01" } });
  fireEvent.change(screen.getByLabelText("Quantity *"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Price Per Share *"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Record Transaction" }));
  fireEvent.click(await screen.findByRole("button", { name: "Review backdated trade" }));
  fireEvent.click(await screen.findByRole("button", { name: "Preview insertion" }));
  await screen.findByText("CAD 10.00 → CAD 22.00");
  expect(invoke).toHaveBeenLastCalledWith("preview-investment-trade-correction", expect.objectContaining({
    operation: "insert", kind: "buy", accountId: "holding", tradeCashAccountId: "cash", date: "2026-01-01", quantity: 1, pricePerShare: 12,
  }));
  expect((screen.getByRole("button", { name: "Insert trade" }) as HTMLButtonElement).disabled).toBe(true);
});
