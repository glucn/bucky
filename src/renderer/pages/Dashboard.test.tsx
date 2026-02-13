// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { Dashboard } from "./Dashboard";

const mockGetOverviewDashboard = vi.fn();
let mockedAccounts: Array<{ id: string }> = [];

vi.mock("../context/AccountsContext", () => ({
  useAccounts: () => ({
    accounts: mockedAccounts,
    refreshAccounts: vi.fn(),
    loading: false,
    error: null,
  }),
}));

describe("Dashboard", () => {
  beforeEach(() => {
    mockGetOverviewDashboard.mockReset();
    mockedAccounts = [];

    Object.defineProperty(window, "electron", {
      writable: true,
      value: {
        getOverviewDashboard: mockGetOverviewDashboard,
        ipcRenderer: {
          invoke: vi.fn(),
          on: vi.fn(),
        },
      },
    });
  });

  it("shows loading state before overview payload resolves", async () => {
    mockGetOverviewDashboard.mockImplementation(
      () => new Promise(() => undefined)
    );

    render(<Dashboard />);

    expect(screen.getByTestId("overview-loading")).toBeTruthy();
  });

  it("renders three dashboard cards from one overview payload", async () => {
    mockGetOverviewDashboard.mockResolvedValue({
      asOfDate: "2026-02-13",
      netWorth: {
        currency: "USD",
        amount: 1234.56,
      },
      incomeExpenseTrend6m: {
        currency: "USD",
        months: [
          { monthKey: "2025-09", income: 100, expense: 50 },
          { monthKey: "2025-10", income: 100, expense: 50 },
          { monthKey: "2025-11", income: 100, expense: 50 },
          { monthKey: "2025-12", income: 100, expense: 50 },
          { monthKey: "2026-01", income: 100, expense: 50 },
          { monthKey: "2026-02", income: 100, expense: 50 },
        ],
      },
      investmentAllocation: {
        hasData: true,
        currency: "USD",
        total: 500,
        slices: [
          {
            portfolioId: "p1",
            portfolioName: "Core",
            amount: 500,
            ratio: 1,
          },
        ],
      },
      metadata: {
        usedEstimatedFxRate: false,
        missingFxPairs: [],
      },
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("overview-net-worth-card")).toBeTruthy();
      expect(screen.getByTestId("overview-trend-card")).toBeTruthy();
      expect(screen.getByTestId("overview-allocation-card")).toBeTruthy();
    });

    expect(mockGetOverviewDashboard).toHaveBeenCalledTimes(1);
  });

  it("renders allocation empty hint when no investment data exists", async () => {
    mockGetOverviewDashboard.mockResolvedValue({
      asOfDate: "2026-02-13",
      netWorth: {
        currency: "USD",
        amount: 0,
      },
      incomeExpenseTrend6m: {
        currency: "USD",
        months: [
          { monthKey: "2025-09", income: 0, expense: 0 },
          { monthKey: "2025-10", income: 0, expense: 0 },
          { monthKey: "2025-11", income: 0, expense: 0 },
          { monthKey: "2025-12", income: 0, expense: 0 },
          { monthKey: "2026-01", income: 0, expense: 0 },
          { monthKey: "2026-02", income: 0, expense: 0 },
        ],
      },
      investmentAllocation: {
        hasData: false,
        currency: "USD",
        total: 0,
        slices: [],
        emptyHintKey: "overview.investmentAllocation.empty",
      },
      metadata: {
        usedEstimatedFxRate: false,
        missingFxPairs: [],
      },
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("overview-allocation-empty")).toBeTruthy();
    });
  });

  it("renders error state when overview request fails", async () => {
    mockGetOverviewDashboard.mockRejectedValue(new Error("boom"));

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByTestId("overview-error")).toBeTruthy();
    });
  });

  it("auto-refreshes on account changes with debounce coalescing", async () => {
    vi.useFakeTimers();
    try {
      mockGetOverviewDashboard.mockResolvedValue({
        asOfDate: "2026-02-13",
        netWorth: {
          currency: "USD",
          amount: 10,
        },
        incomeExpenseTrend6m: {
          currency: "USD",
          months: [
            { monthKey: "2025-09", income: 0, expense: 0 },
            { monthKey: "2025-10", income: 0, expense: 0 },
            { monthKey: "2025-11", income: 0, expense: 0 },
            { monthKey: "2025-12", income: 0, expense: 0 },
            { monthKey: "2026-01", income: 0, expense: 0 },
            { monthKey: "2026-02", income: 0, expense: 0 },
          ],
        },
        investmentAllocation: {
          hasData: false,
          currency: "USD",
          total: 0,
          slices: [],
          emptyHintKey: "overview.investmentAllocation.empty",
        },
        metadata: {
          usedEstimatedFxRate: false,
          missingFxPairs: [],
        },
      });

      const { rerender } = render(<Dashboard />);

      await act(async () => {
        await Promise.resolve();
      });
      expect(mockGetOverviewDashboard).toHaveBeenCalledTimes(1);

      mockedAccounts = [{ id: "a" }];
      await act(async () => {
        rerender(<Dashboard />);
      });
      mockedAccounts = [{ id: "b" }];
      await act(async () => {
        rerender(<Dashboard />);
      });

      await act(async () => {
        vi.advanceTimersByTime(299);
      });
      expect(mockGetOverviewDashboard).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(1);
        await Promise.resolve();
      });
      expect(mockGetOverviewDashboard).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
