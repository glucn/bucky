// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InvestmentPortfolios } from "./InvestmentPortfolios";

vi.mock("../context/AccountsContext", () => ({ useAccounts: () => ({ refreshAccounts: vi.fn() }) }));
it("shows unavailable gains rather than zero when the portfolio has no verified market value", async () => {
  Object.defineProperty(window, "electron", { configurable: true, value: {
    getBaseCurrencyImpactState: vi.fn().mockResolvedValue({ baseCurrency: "USD" }),
    ipcRenderer: { invoke: vi.fn(async (channel) => channel === "get-investment-portfolios" ? { success: true, portfolios: [{ id: "portfolio", name: "Unpriced" }] } : {
      success: true, value: { totalMarketValue: null, totalUnrealizedGain: null, totalUnrealizedGainPercent: null, cashBalance: 900 },
    }) },
  } });
  render(<MemoryRouter><InvestmentPortfolios /></MemoryRouter>);
  await screen.findByText("Unrealized Gain/Loss");
  expect(screen.getByText("Unrealized Gain/Loss").parentElement?.textContent).toContain("N/A");
});
