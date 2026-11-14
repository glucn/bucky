// @vitest-environment jsdom
import React from "react";
import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
it("requires review of an existing group's accounts and keeps a refused classification visible", async () => {
  const invoke = vi.fn(async (channel) => channel === "get-investment-portfolios" ? { success: true, portfolios: [], reviewCandidates: [
    { id: "legacy", name: "Existing broker", accounts: [{ id: "cash", name: "Broker settlement", currency: "CAD", isArchived: false }] },
  ] } : { success: false, error: "Account membership changed; reload the portfolio review" });
  Object.defineProperty(window, "electron", { configurable: true, value: { getBaseCurrencyImpactState: vi.fn().mockResolvedValue({ baseCurrency: "CAD" }), ipcRenderer: { invoke } } });
  render(<MemoryRouter><InvestmentPortfolios /></MemoryRouter>);
  fireEvent.click(await screen.findByText("Use an existing account group as a portfolio"));
  fireEvent.change(screen.getByLabelText("Existing account group"), { target: { value: "legacy" } });
  expect(screen.getByText(/Broker settlement.*CAD/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Use as investment portfolio" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText("Use these accounts as portfolio cash"));
  fireEvent.click(screen.getByRole("button", { name: "Use as investment portfolio" }));
  expect((await screen.findByRole("alert")).textContent).toContain("membership changed");
  expect(invoke).toHaveBeenCalledWith("confirm-investment-portfolio", { groupId: "legacy", expectedAccountIds: ["cash"] });
});
