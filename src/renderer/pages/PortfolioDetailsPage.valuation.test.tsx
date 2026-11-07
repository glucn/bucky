// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PortfolioDetailsPage } from "./PortfolioDetailsPage";

vi.mock("../context/AccountsContext", () => ({ useAccounts: () => ({ refreshAccounts: vi.fn() }) }));
it("labels a holding's market and keeps missing base and native market values unavailable", async () => {
  Object.defineProperty(window, "electron", { configurable: true, value: {
    getBaseCurrencyImpactState: vi.fn().mockResolvedValue({ baseCurrency: "USD" }),
    ipcRenderer: { invoke: vi.fn(async (channel) => channel === "get-account-groups" ? { success: true, groups: [{ id: "portfolio", name: "Book" }] } : channel === "get-all-positions" ? {
      success: true, positions: [{ accountId: "holding", market: "NASDAQ", tickerSymbol: "ABC", currency: "USD", quantity: 10, costBasis: 100, costBasisBase: 100, marketPrice: null, marketValue: null, marketValueBase: null, unrealizedGain: null, unrealizedGainPercent: null }],
    } : { success: false }) },
  } });
  render(<MemoryRouter initialEntries={["/investments/portfolio"]}><Routes><Route path="/investments/:portfolioId" element={<PortfolioDetailsPage />} /></Routes></MemoryRouter>);
  const row = (await screen.findByText("ABC")).closest("tr")!;
  expect(within(row).getByText("NASDAQ")).toBeTruthy();
  expect(within(row).getAllByText("N/A").length).toBeGreaterThanOrEqual(2);
  expect(row.textContent).not.toContain("100.00");
});
