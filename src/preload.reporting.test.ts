import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, on, exposeInMainWorld } = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  exposeInMainWorld: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
    on,
  },
}));

describe("preload reporting bridge", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await import("./preload");
  });

  it("exposes reporting methods and maps to reporting channels", async () => {
    const exposeCall = exposeInMainWorld.mock.calls.find(([name]) => name === "electron");
    const electronApi = exposeCall?.[1] as {
      getIncomeExpenseTrendReport: (filter: { preset: string }, asOfDate?: string) => Promise<unknown>;
      getIncomeExpenseBreakdownReport: (
        filter: { preset: string },
        asOfDate?: string
      ) => Promise<unknown>;
    };

    expect(typeof electronApi.getIncomeExpenseTrendReport).toBe("function");
    expect(typeof electronApi.getIncomeExpenseBreakdownReport).toBe("function");

    const trendFilter = { preset: "LAST_6_MONTHS" };
    const breakdownFilter = { preset: "THIS_MONTH" };

    await electronApi.getIncomeExpenseTrendReport(trendFilter, "2026-03-15");
    await electronApi.getIncomeExpenseBreakdownReport(breakdownFilter, "2026-03-15");

    expect(invoke).toHaveBeenCalledWith(
      "get-income-expense-trend-report",
      trendFilter,
      "2026-03-15"
    );
    expect(invoke).toHaveBeenCalledWith(
      "get-income-expense-breakdown-report",
      breakdownFilter,
      "2026-03-15"
    );
  });
});
