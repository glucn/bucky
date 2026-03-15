import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  removeHandler,
  handle,
  getIncomeExpenseTrendReport,
  getIncomeExpenseBreakdownReport,
} = vi.hoisted(() => ({
  removeHandler: vi.fn(),
  handle: vi.fn(),
  getIncomeExpenseTrendReport: vi.fn(),
  getIncomeExpenseBreakdownReport: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    removeHandler,
    handle,
  },
}));

vi.mock("../services/reportingService", () => ({
  reportingService: {
    getIncomeExpenseTrendReport,
    getIncomeExpenseBreakdownReport,
  },
}));

import { setupReportingIpcHandlers } from "./ipcHandlers.reporting";

describe("setupReportingIpcHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers trend and breakdown channels with delegation", async () => {
    const trendFilter = { preset: "LAST_6_MONTHS" as const };
    const trendPayload = {
      range: { preset: "LAST_6_MONTHS" as const, startMonthKey: "2025-10", endMonthKey: "2026-03" },
      months: [{ monthKey: "2026-03", income: 100, expense: 40, netIncome: 60 }],
      metadata: { includesUnassignedImplicitly: true },
    };

    const breakdownFilter = { preset: "THIS_MONTH" as const };
    const breakdownPayload = {
      range: { preset: "THIS_MONTH" as const, startDate: "2026-03-01", endDate: "2026-03-15" },
      kpis: { incomeTotal: 100, expenseTotal: 40, netIncome: 60 },
      incomeRows: [{ categoryId: "Salary", categoryName: "Salary", amount: 100, ratio: 1 }],
      expenseRows: [{ categoryId: "Rent", categoryName: "Rent", amount: 40, ratio: 1 }],
    };

    getIncomeExpenseTrendReport.mockResolvedValue(trendPayload);
    getIncomeExpenseBreakdownReport.mockResolvedValue(breakdownPayload);

    setupReportingIpcHandlers();

    expect(removeHandler).toHaveBeenCalledWith("get-income-expense-trend-report");
    expect(removeHandler).toHaveBeenCalledWith("get-income-expense-breakdown-report");
    expect(handle).toHaveBeenCalledWith("get-income-expense-trend-report", expect.any(Function));
    expect(handle).toHaveBeenCalledWith("get-income-expense-breakdown-report", expect.any(Function));

    const trendHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-income-expense-trend-report"
    )?.[1];
    const breakdownHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-income-expense-breakdown-report"
    )?.[1];

    await expect(trendHandler({}, trendFilter, "2026-03-15")).resolves.toEqual(trendPayload);
    await expect(breakdownHandler({}, breakdownFilter, "2026-03-15")).resolves.toEqual(
      breakdownPayload
    );

    expect(getIncomeExpenseTrendReport).toHaveBeenCalledWith(trendFilter, "2026-03-15");
    expect(getIncomeExpenseBreakdownReport).toHaveBeenCalledWith(breakdownFilter, "2026-03-15");
  });

  it("propagates service errors for both channels", async () => {
    const trendError = new Error("trend failed");
    const breakdownError = new Error("breakdown failed");
    getIncomeExpenseTrendReport.mockRejectedValue(trendError);
    getIncomeExpenseBreakdownReport.mockRejectedValue(breakdownError);

    setupReportingIpcHandlers();

    const trendHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-income-expense-trend-report"
    )?.[1];
    const breakdownHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-income-expense-breakdown-report"
    )?.[1];

    await expect(trendHandler({}, { preset: "LAST_3_MONTHS" }, undefined)).rejects.toThrow(
      "trend failed"
    );
    await expect(breakdownHandler({}, { preset: "THIS_MONTH" }, undefined)).rejects.toThrow(
      "breakdown failed"
    );
  });
});
