// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NewHoldingModal } from "./NewHoldingModal";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("requires explicit cost policy and sends the selected cash currency and opaque market identity", async () => {
  const invoke = vi.fn(async (channel) => channel === "get-portfolio-accounts" ? { success: true, accounts: { tradeCashAccounts: [
    { id: "cad", name: "Trade Cash CAD", currency: "CAD" }, { id: "usd", name: "Trade Cash USD", currency: "USD" },
  ] } } : { success: true, account: { id: "new-listing" } });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  const created = vi.fn(); render(<NewHoldingModal portfolioId="portfolio" onClose={vi.fn()} onCreated={created} />);
  fireEvent.change(await screen.findByLabelText("Cash account"), { target: { value: "cad" } });
  fireEvent.change(screen.getByLabelText("Ticker"), { target: { value: "ABC" } });
  fireEvent.change(screen.getByLabelText("Market"), { target: { value: "Tsx" } });
  expect(screen.getByRole("combobox", { name: /^Cash account$/ })).toBe(screen.getByLabelText("Cash account"));
  expect(screen.getByRole("combobox", { name: /^Cost basis method$/ })).toBe(screen.getByLabelText("Cost basis method"));
  expect((screen.getByRole("button", { name: "Create holding" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Cost basis method"), { target: { value: "AVERAGE_COST" } });
  fireEvent.click(screen.getByRole("button", { name: "Create holding" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("create-market-holding", expect.objectContaining({ portfolioId: "portfolio", tickerSymbol: "ABC", market: "Tsx", quoteCurrency: "CAD", tradeCashAccountId: "cad", costBasisMethod: "AVERAGE_COST" })));
  expect(created).toHaveBeenCalledWith("new-listing");
});

it("keeps server refusal visible and preserves the setup for correction", async () => {
  const invoke = vi.fn(async (channel) => channel === "get-portfolio-accounts" ? { success: true, accounts: { tradeCashAccounts: [{ id: "usd", name: "Trade Cash USD", currency: "USD" }] } } : { success: false, error: "Stored market quote currency conflicts with this account" });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  const created = vi.fn(); render(<NewHoldingModal portfolioId="portfolio" onClose={vi.fn()} onCreated={created} />);
  await waitFor(() => expect((screen.getByLabelText("Cash account") as HTMLSelectElement).value).toBe("usd"));
  fireEvent.change(screen.getByLabelText("Ticker"), { target: { value: "ABC" } }); fireEvent.change(screen.getByLabelText("Market"), { target: { value: "NASDAQ" } });
  fireEvent.change(screen.getByLabelText("Cost basis method"), { target: { value: "FIFO" } }); fireEvent.click(screen.getByRole("button", { name: "Create holding" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Stored market quote currency conflicts with this account");
  expect((screen.getByLabelText("Ticker") as HTMLInputElement).value).toBe("ABC"); expect(created).not.toHaveBeenCalled();
});
