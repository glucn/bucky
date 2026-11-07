// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PositionDetailsPage } from "./PositionDetailsPage";

vi.mock("../components/TransactionEntryModal", () => ({
  TransactionEntryModal: () => null,
}));

vi.mock("../context/AccountsContext", () => ({
  useAccounts: () => ({
    refreshAccounts: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe("PositionDetailsPage missing enrichment CTA", () => {
  beforeEach(() => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === "get-portfolio-accounts") {
        return {
          success: true,
          accounts: {
            securities: [
              {
                id: "security-1",
                investmentProperties: {
                  tickerSymbol: "AAPL",
                },
              },
            ],
          },
        };
      }

      if (channel === "get-position-details") {
        return {
          success: true,
          position: {
            tickerSymbol: "AAPL",
            quantity: 10,
            costBasis: 1000,
            costPerShare: 100,
            marketPrice: null,
            marketValue: null,
            unrealizedGain: null,
            unrealizedGainPercent: null,
          },
        };
      }

      if (channel === "get-all-positions") {
        return {
          success: true,
          positions: [
            {
              tickerSymbol: "AAPL",
              accountId: "security-1",
              currency: "USD",
              costBasisBase: 1000,
              marketValueBase: null,
              marketValue: null,
            },
          ],
        };
      }

      if (channel === "get-transactions") {
        return [];
      }

      return { success: false };
    });

    Object.defineProperty(window, "electron", {
      writable: true,
      value: {
        ipcRenderer: {
          invoke,
          on: vi.fn(),
        },
        getBaseCurrencyImpactState: vi.fn().mockResolvedValue({
          baseCurrency: "CAD",
          reconciliation: null,
        }),
      },
    });
  });

  it("shows CTA and opens enrichment panel event when market data is unavailable", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(
      <MemoryRouter initialEntries={["/investments/p-1/position/AAPL"]}>
        <Routes>
          <Route path="/investments/:portfolioId/position/:tickerSymbol" element={<PositionDetailsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("missing-enrichment-cta")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("missing-enrichment-refresh-now"));
    expect(dispatchSpy).toHaveBeenCalled();
    expect(screen.getByText("Market Value").parentElement?.textContent).toContain("N/A");
    expect(screen.getByText("Market Value").parentElement?.textContent).not.toContain("1,000");
  });

  it("selects the account named by the holding route even when another market has the same ticker", async () => {
    const original = window.electron.ipcRenderer.invoke;
    const invoke = vi.fn(async (channel, params) => channel === "get-portfolio-accounts" ? { success: true, accounts: { securities: [
      { id: "security-other", investmentProperties: { tickerSymbol: "AAPL", market: "LSE" } },
      { id: "security-1", investmentProperties: { tickerSymbol: "AAPL", market: "NASDAQ" } },
    ] } } : original(channel, params));
    window.electron.ipcRenderer.invoke = invoke;
    render(<MemoryRouter initialEntries={["/investments/p-1/holding/security-1"]}><Routes>
      <Route path="/investments/:portfolioId/holding/:securityAccountId" element={<PositionDetailsPage />} />
    </Routes></MemoryRouter>);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get-position-details", { accountId: "security-1" }));
  });

  it("labels transaction amounts in the journal line currency rather than the book's base currency", async () => {
    const original = window.electron.ipcRenderer.invoke;
    window.electron.ipcRenderer.invoke = vi.fn(async (channel, params) => channel === "get-transactions" ? [
      { amount: 100, currency: "USD", entry: { id: "buy", date: "2026-01-02", type: "investment_buy", description: "Synthetic USD purchase" } },
    ] : original(channel, params));
    render(<MemoryRouter initialEntries={["/investments/p-1/position/AAPL"]}><Routes>
      <Route path="/investments/:portfolioId/position/:tickerSymbol" element={<PositionDetailsPage />} />
    </Routes></MemoryRouter>);
    const row = (await screen.findByText("Synthetic USD purchase")).closest("tr")!;
    expect(row.textContent).toMatch(/USD\s*100\.00/);
    expect(row.textContent).not.toContain("CA$");
  });
});
