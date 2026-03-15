// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReportsPage } from "./ReportsPage";
import {
  REPORTING_BREAKDOWN_FILTER_SETTING_KEY,
  REPORTING_TREND_FILTER_SETTING_KEY,
} from "../../shared/reporting";

const getIncomeExpenseTrendReport = vi.fn();
const getIncomeExpenseBreakdownReport = vi.fn();
const getAppSetting = vi.fn();
const setAppSetting = vi.fn();

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "electron", {
      writable: true,
      value: {
        getIncomeExpenseTrendReport,
        getIncomeExpenseBreakdownReport,
        getAppSetting,
        setAppSetting,
        ipcRenderer: {
          invoke: vi.fn(),
          on: vi.fn(),
        },
      },
    });

    getAppSetting.mockResolvedValue(null);
    setAppSetting.mockResolvedValue({ success: true });
    getIncomeExpenseTrendReport.mockResolvedValue({
      range: { preset: "LAST_6_MONTHS", startMonthKey: "2025-10", endMonthKey: "2026-03" },
      months: [{ monthKey: "2026-03", income: 100, expense: 20, netIncome: 80 }],
      metadata: { includesUnassignedImplicitly: true },
    });
    getIncomeExpenseBreakdownReport.mockResolvedValue({
      range: { preset: "THIS_MONTH", startDate: "2026-03-01", endDate: "2026-03-15" },
      kpis: { incomeTotal: 100, expenseTotal: 20, netIncome: 80 },
      incomeRows: [{ categoryId: "Salary", categoryName: "Salary", amount: 100, ratio: 1 }],
      expenseRows: [{ categoryId: "Rent", categoryName: "Rent", amount: 20, ratio: 1 }],
    });
  });

  it("shows loading state while report payloads are pending", async () => {
    getIncomeExpenseTrendReport.mockReturnValue(new Promise(() => {}));
    getIncomeExpenseBreakdownReport.mockReturnValue(new Promise(() => {}));

    render(<ReportsPage />);

    expect(screen.getByTestId("reports-loading")).toBeTruthy();
  });

  it("restores persisted trend and breakdown filters independently and requests with those filters", async () => {
    getAppSetting.mockImplementation(async (key: string) => {
      if (key === REPORTING_TREND_FILTER_SETTING_KEY) {
        return { preset: "LAST_12_MONTHS" };
      }

      if (key === REPORTING_BREAKDOWN_FILTER_SETTING_KEY) {
        return { preset: "LAST_3_MONTHS" };
      }

      return null;
    });

    getIncomeExpenseTrendReport.mockResolvedValue({
      range: { preset: "LAST_12_MONTHS", startMonthKey: "2025-04", endMonthKey: "2026-03" },
      months: [{ monthKey: "2026-03", income: 100, expense: 20, netIncome: 80 }],
      metadata: { includesUnassignedImplicitly: true },
    });
    getIncomeExpenseBreakdownReport.mockResolvedValue({
      range: { preset: "LAST_3_MONTHS", startDate: "2026-01-01", endDate: "2026-03-15" },
      kpis: { incomeTotal: 100, expenseTotal: 20, netIncome: 80 },
      incomeRows: [{ categoryId: "Salary", categoryName: "Salary", amount: 100, ratio: 1 }],
      expenseRows: [{ categoryId: "Rent", categoryName: "Rent", amount: 20, ratio: 1 }],
    });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("reports-page")).toBeTruthy();
    });

    expect(getIncomeExpenseTrendReport).toHaveBeenCalledWith({ preset: "LAST_12_MONTHS" });
    expect(getIncomeExpenseBreakdownReport).toHaveBeenCalledWith({ preset: "LAST_3_MONTHS" });
    expect((screen.getByTestId("trend-filter-select") as HTMLSelectElement).value).toBe(
      "LAST_12_MONTHS"
    );
    expect((screen.getByTestId("breakdown-filter-select") as HTMLSelectElement).value).toBe(
      "LAST_3_MONTHS"
    );
  });

  it("falls back invalid persisted values to defaults and persists changes independently", async () => {
    getAppSetting.mockImplementation(async (key: string) => {
      if (key === REPORTING_TREND_FILTER_SETTING_KEY) {
        return { preset: "INVALID" };
      }

      if (key === REPORTING_BREAKDOWN_FILTER_SETTING_KEY) {
        return { preset: "NEXT_MONTH" };
      }

      return null;
    });

    getIncomeExpenseTrendReport.mockResolvedValue({
      range: { preset: "LAST_6_MONTHS", startMonthKey: "2025-10", endMonthKey: "2026-03" },
      months: [{ monthKey: "2026-03", income: 100, expense: 20, netIncome: 80 }],
      metadata: { includesUnassignedImplicitly: true },
    });
    getIncomeExpenseBreakdownReport.mockResolvedValue({
      range: { preset: "THIS_MONTH", startDate: "2026-03-01", endDate: "2026-03-15" },
      kpis: { incomeTotal: 100, expenseTotal: 20, netIncome: 80 },
      incomeRows: [{ categoryId: "Salary", categoryName: "Salary", amount: 100, ratio: 1 }],
      expenseRows: [{ categoryId: "Rent", categoryName: "Rent", amount: 20, ratio: 1 }],
    });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("reports-page")).toBeTruthy();
    });

    const trendSelect = screen.getByTestId("trend-filter-select") as HTMLSelectElement;
    const breakdownSelect = screen.getByTestId("breakdown-filter-select") as HTMLSelectElement;

    expect(trendSelect.value).toBe("LAST_6_MONTHS");
    expect(breakdownSelect.value).toBe("THIS_MONTH");

    fireEvent.change(trendSelect, { target: { value: "YTD" } });
    await waitFor(() => {
      expect(setAppSetting).toHaveBeenCalledWith(REPORTING_TREND_FILTER_SETTING_KEY, {
        preset: "YTD",
      });
    });
    expect(setAppSetting).not.toHaveBeenCalledWith(REPORTING_BREAKDOWN_FILTER_SETTING_KEY, {
      preset: "YTD",
    });

    await waitFor(() => {
      expect(screen.getByTestId("reports-page")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("breakdown-filter-select"), {
      target: { value: "LAST_MONTH" },
    });
    await waitFor(() => {
      expect(setAppSetting).toHaveBeenCalledWith(REPORTING_BREAKDOWN_FILTER_SETTING_KEY, {
        preset: "LAST_MONTH",
      });
    });
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

  it("renders grouped trend bars and tooltip fields with negative net styling", async () => {
    getIncomeExpenseTrendReport.mockResolvedValue({
      range: { preset: "LAST_6_MONTHS", startMonthKey: "2025-10", endMonthKey: "2026-03" },
      months: [
        { monthKey: "2026-02", income: 100, expense: 50, netIncome: 50 },
        { monthKey: "2026-03", income: 80, expense: 120, netIncome: -40 },
      ],
      metadata: { includesUnassignedImplicitly: true },
    });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("reports-trend-container")).toBeTruthy();
    });

    const trendContainer = screen.getByTestId("reports-trend-container");
    expect(trendContainer.getAttribute("data-layout")).toBe("grouped");
    expect(screen.getByTestId("trend-income-bar-2026-03")).toBeTruthy();
    expect(screen.getByTestId("trend-expense-bar-2026-03")).toBeTruthy();

    fireEvent.mouseEnter(screen.getByTestId("trend-tooltip-trigger-2026-03"));

    await waitFor(() => {
      expect(screen.getByTestId("trend-tooltip-income").textContent).toContain("Income:");
      expect(screen.getByTestId("trend-tooltip-expense").textContent).toContain("Expense:");
      expect(screen.getByTestId("trend-tooltip-net-income").textContent).toContain("Net income: -$");
      expect(screen.getByTestId("trend-tooltip-net-income").className).toContain("text-red-600");
    });
  });

  it("renders breakdown KPI and separate tables with totals, percentages, and unassigned row", async () => {
    getIncomeExpenseBreakdownReport.mockResolvedValue({
      range: { preset: "THIS_MONTH", startDate: "2026-03-01", endDate: "2026-03-15" },
      kpis: { incomeTotal: 300, expenseTotal: 420, netIncome: -120 },
      incomeRows: [
        { categoryId: "UNASSIGNED", categoryName: "Unassigned", amount: 300, ratio: 1 },
      ],
      expenseRows: [
        { categoryId: "Rent", categoryName: "Rent", amount: 300, ratio: 0.71 },
        { categoryId: "UNASSIGNED", categoryName: "Unassigned", amount: 120, ratio: 0.29 },
      ],
    });

    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("reports-page")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("report-switch-breakdown"));

    await waitFor(() => {
      expect(screen.getByTestId("reports-net-income-kpi-card")).toBeTruthy();
      expect(screen.getByTestId("reports-net-income-kpi-value").textContent).toContain("-$");
      expect(screen.getByTestId("reports-net-income-kpi-value").className).toContain("text-red-600");
      expect(screen.getByTestId("reports-income-table")).toBeTruthy();
      expect(screen.getByTestId("reports-expense-table")).toBeTruthy();
      expect(screen.getByTestId("reports-income-total-row")).toBeTruthy();
      expect(screen.getByTestId("reports-expense-total-row")).toBeTruthy();
      expect(screen.getByTestId("reports-income-row-UNASSIGNED")).toBeTruthy();
      expect(screen.getByTestId("reports-expense-row-UNASSIGNED")).toBeTruthy();
      expect(screen.getByText("% of income")).toBeTruthy();
      expect(screen.getByText("% of expense")).toBeTruthy();
    });
  });

  it("provides stable test hooks for switcher, date controls, trend tooltip triggers, KPI, and tables", async () => {
    render(<ReportsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("report-switcher")).toBeTruthy();
      expect(screen.getByTestId("report-switch-trend")).toBeTruthy();
      expect(screen.getByTestId("report-switch-breakdown")).toBeTruthy();
      expect(screen.getByLabelText("trend-date-control")).toBeTruthy();
      expect(screen.getByLabelText("breakdown-date-control")).toBeTruthy();
      expect(screen.getByTestId("reports-trend-container")).toBeTruthy();
      expect(screen.getByTestId("trend-tooltip-trigger-2026-03")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("report-switch-breakdown"));

    await waitFor(() => {
      expect(screen.getByTestId("reports-net-income-kpi-card")).toBeTruthy();
      expect(screen.getByTestId("reports-income-table")).toBeTruthy();
      expect(screen.getByTestId("reports-expense-table")).toBeTruthy();
    });
  });
});
