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
              currency: "USD",
              costBasisBase: null,
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
  });
});
