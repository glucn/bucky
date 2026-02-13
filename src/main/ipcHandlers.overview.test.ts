import { beforeEach, describe, expect, it, vi } from "vitest";

const { removeHandler, handle, getOverviewDashboard } = vi.hoisted(() => ({
  removeHandler: vi.fn(),
  handle: vi.fn(),
  getOverviewDashboard: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    removeHandler,
    handle,
  },
}));

vi.mock("../services/overviewService", () => ({
  overviewService: {
    getOverviewDashboard,
  },
}));

import { setupOverviewIpcHandlers } from "./ipcHandlers.overview";

describe("setupOverviewIpcHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers get-overview-dashboard and delegates to overview service", async () => {
    const payload = {
      asOfDate: "2026-02-13",
      netWorth: { currency: "USD", amount: 100 },
      incomeExpenseTrend6m: { currency: "USD", months: [] },
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
    };

    getOverviewDashboard.mockResolvedValue(payload);

    setupOverviewIpcHandlers();

    expect(removeHandler).toHaveBeenCalledWith("get-overview-dashboard");
    expect(handle).toHaveBeenCalledWith("get-overview-dashboard", expect.any(Function));

    const registeredHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-overview-dashboard"
    )?.[1];

    const result = await registeredHandler({}, "2026-02-13");

    expect(getOverviewDashboard).toHaveBeenCalledWith("2026-02-13");
    expect(result).toEqual(payload);
  });

  it("propagates service errors for consistent ipc failure behavior", async () => {
    const error = new Error("overview failed");
    getOverviewDashboard.mockRejectedValue(error);

    setupOverviewIpcHandlers();

    const registeredHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-overview-dashboard"
    )?.[1];

    await expect(registeredHandler({}, undefined)).rejects.toThrow("overview failed");
    expect(getOverviewDashboard).toHaveBeenCalledWith(undefined);
  });
});
