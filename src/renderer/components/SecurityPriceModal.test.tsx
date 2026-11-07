// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SecurityPriceModal } from "./SecurityPriceModal";

const context = { accountId: "holding", ticker: "ABC", market: "TSX", currency: "CAD", quoteCurrency: "CAD", quoteCurrencyIssue: null, hasTrackedHistory: true, prices: [], legacyPrices: [], priceCount: 0, legacyCount: 0 };
it("requires explicit correction policy and raw-close confirmation, then saves the exact reviewed account and prices", async () => {
  const invoke = vi.fn(async (channel) => channel === "get-security-price-context" ? { success: true, context } : channel === "preview-security-prices" ? { success: true, preview: { rows: [{ date: "2026-01-02", price: 12, token: null, action: "insert", existing: null }] } } : { success: true, result: { inserted: 1, corrected: 0, retained: 0 } });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  render(<SecurityPriceModal isOpen accountId="holding" onClose={vi.fn()} />);
  await screen.findByText("ABC · TSX · CAD");
  fireEvent.change(screen.getByLabelText("Price date"), { target: { value: "2026-01-02" } });
  fireEvent.change(screen.getByLabelText("Price in CAD"), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText("Existing dates"), { target: { value: "correct" } });
  fireEvent.click(screen.getByText("Preview prices"));
  const save = await screen.findByText("Save reviewed prices"); expect((save as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText(/I verified these are unadjusted completed/)); fireEvent.click(save);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("save-security-prices", expect.objectContaining({ accountId: "holding", expectedMarket: "TSX", mode: "correct", confirmRawClose: true, expected: [{ date: "2026-01-02", price: 12, token: null }] })));
  await screen.findByText("1 inserted · 0 corrected · 0 retained");
});

it("shows unconfirmed quote units and allows same-market confirmation before reviewing prices", async () => {
  let confirmed = false;
  const invoke = vi.fn(async (channel, input) => {
    if (channel === "get-security-price-context") return { success: true, context: confirmed ? context : { ...context, quoteCurrency: null, quoteCurrencyIssue: "Quote currency is unconfirmed.", priceCount: 1 } };
    if (channel === "bind-security-market") { confirmed = true; return { success: true }; }
    throw new Error(`Unexpected ${channel}`);
  });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  render(<SecurityPriceModal isOpen accountId="holding" onClose={vi.fn()} />);
  await screen.findByText("Quote currency is unconfirmed.");
  expect(screen.queryByLabelText("Price in CAD")).toBeNull();
  const confirm = screen.getByRole("button", { name: "Confirm market currency" });
  expect((confirm as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(confirm);
  await screen.findByLabelText("Price in CAD");
  expect(invoke).toHaveBeenCalledWith("bind-security-market", { accountId: "holding", market: "TSX", expectedMarket: "TSX", quoteCurrency: "CAD" });
});
it("keeps stale-review errors visible and never closes or refreshes the parent on failure", async () => {
  const close = vi.fn(), changed = vi.fn();
  const invoke = vi.fn(async (channel) => channel === "get-security-price-context" ? { success: true, context } : channel === "preview-security-prices" ? { success: true, preview: { rows: [{ date: "2026-01-02", price: 12, token: "old", action: "correct", existing: { price: 10, priceBasis: "raw", barStatus: "complete", source: "manual" } }] } } : { success: false, error: "Prices changed. Review again." });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  render(<SecurityPriceModal isOpen accountId="holding" onClose={close} onChanged={changed} />);
  await screen.findByText("ABC · TSX · CAD");
  fireEvent.change(screen.getByLabelText("Price date"), { target: { value: "2026-01-02" } }); fireEvent.change(screen.getByLabelText("Price in CAD"), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText("Existing dates"), { target: { value: "correct" } }); fireEvent.click(screen.getByText("Preview prices"));
  await screen.findByText("Save reviewed prices"); fireEvent.click(screen.getByLabelText(/I verified these are unadjusted completed/)); fireEvent.click(screen.getByText("Save reviewed prices"));
  await screen.findByText("Prices changed. Review again."); expect(close).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Preview prices"));
  await waitFor(() => expect((screen.getByText("Preview prices") as HTMLButtonElement).disabled).toBe(false));
  expect((screen.getByText("Save reviewed prices") as HTMLButtonElement).disabled).toBe(true);
});

it("assigns the selected market explicitly without relabelling the holding's currency", async () => {
  let market: string | null = null;
  const invoke = vi.fn(async (channel, input) => {
    if (channel === "get-security-price-context") return { success: true, context: { ...context, market } };
    if (channel === "bind-security-market") { market = input.market; return { success: true }; }
    return { success: false };
  });
  Object.defineProperty(window, "electron", { configurable: true, value: { ipcRenderer: { invoke } } });
  render(<SecurityPriceModal isOpen accountId="holding" onClose={vi.fn()} />);
  await screen.findByText("ABC · Market needs review · CAD");
  expect(invoke).not.toHaveBeenCalledWith("bind-security-market", expect.anything());
  fireEvent.change(screen.getByLabelText("Market", { exact: true }), { target: { value: "TSX" } }); fireEvent.click(screen.getByText("Save market"));
  await screen.findByText("ABC · TSX · CAD");
  expect(invoke).toHaveBeenCalledWith("bind-security-market", { accountId: "holding", market: "TSX", expectedMarket: null, quoteCurrency: "CAD" });
});
