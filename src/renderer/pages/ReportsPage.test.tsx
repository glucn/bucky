// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ReportsPage } from "./ReportsPage";

const getIncomeExpenseTrendReport = vi.fn();
const getIncomeExpenseBreakdownReport = vi.fn();

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "electron", {
      writable: true,
      value: {
        getIncomeExpenseTrendReport,
        getIncomeExpenseBreakdownReport,
        ipcRenderer: {
          invoke: vi.fn(),
          on: vi.fn(),
        },
      },
    });
  });

  it("shows loading state while report payloads are pending", async () => {
    getIncomeExpenseTrendReport.mockReturnValue(new Promise(() => {}));
    getIncomeExpenseBreakdownReport.mockReturnValue(new Promise(() => {}));

    render(<ReportsPage />);

    expect(screen.getByTestId("reports-loading")).toBeTruthy();
  });

  it("shows error state when report fetch fails", async () => {
    getIncomeExpenseTrendReport.mockRejectedValue(new Error("boom"));
    getIncomeExpenseBreakdownReport.mockRejectedValue(new Error("boom"));

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("reports-error")).toBeTruthy();
    });
  });

  it("shows empty state when trend and breakdown return no meaningful data", async () => {
    getIncomeExpenseTrendReport.mockResolvedValue({
      range: { preset: "LAST_6_MONTHS", startMonthKey: "2025-10", endMonthKey: "2026-03" },
      months: [{ monthKey: "2026-03", income: 0, expense: 0, netIncome: 0 }],
      metadata: { includesUnassignedImplicitly: true },
    });
    getIncomeExpenseBreakdownReport.mockResolvedValue({
      range: { preset: "THIS_MONTH", startDate: "2026-03-01", endDate: "2026-03-15" },
      kpis: { incomeTotal: 0, expenseTotal: 0, netIncome: 0 },
      incomeRows: [],
      expenseRows: [],
    });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("reports-empty")).toBeTruthy();
    });
  });
});
