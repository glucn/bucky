// @vitest-environment jsdom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PerformanceReportsPage } from "./PerformanceReportsPage";

describe("PerformanceReportsPage display policy", () => {
  beforeEach(() => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === "get-portfolio-performance") {
        return {
          success: true,
          performance: {
            totalReturn: 100,
            totalReturnPercent: 10,
            realizedGains: 40,
            unrealizedGains: 60,
            dividendIncome: 5,
            interestIncome: 2,
            fees: 1,
            deposits: 900,
            withdrawals: 0,
            currentValue: 1000,
          },
        };
      }

      if (channel === "get-asset-allocation") {
        return {
          success: true,
          allocation: [
            { tickerSymbol: "AAPL", marketValue: 150, percentOfPortfolio: 60 },
            { tickerSymbol: "SHOP", marketValue: 200, percentOfPortfolio: 40 },
          ],
        };
      }

      if (channel === "get-all-positions") {
        return {
          success: true,
          positions: [
            {
              tickerSymbol: "AAPL",
              currency: "USD",
              marketValue: 150,
              marketValueBase: 205,
              costBasisBase: 180,
            },
            {
              tickerSymbol: "SHOP",
              currency: "CAD",
              marketValue: 200,
              marketValueBase: null,
              costBasisBase: null,
            },
          ],
        };
      }

      if (channel === "get-realized-gains") {
        return {
          success: true,
          gains: [],
        };
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

  it("shows Value (Base) and Value (Native) with N/A fallback", async () => {
    render(
      <MemoryRouter initialEntries={["/investments/p-1/reports"]}>
        <Routes>
          <Route path="/investments/:portfolioId/reports" element={<PerformanceReportsPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Value (Base)")).toBeTruthy();
    });

    expect(screen.getByText("Value (Native)")).toBeTruthy();
    expect(screen.getByText("N/A")).toBeTruthy();
    expect(
      screen.getByText("Base totals are unavailable for one or more positions because FX conversion data is missing.")
    ).toBeTruthy();
  });
});
