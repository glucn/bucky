import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  removeHandler,
  handle,
  getPanelState,
  startRun,
  cancelRun,
  sendToBackground,
  getRunSummary,
  getAppSetting,
  setAppSetting,
} = vi.hoisted(() => ({
  removeHandler: vi.fn(),
  handle: vi.fn(),
  getPanelState: vi.fn(),
  startRun: vi.fn(),
  cancelRun: vi.fn(),
  sendToBackground: vi.fn(),
  getRunSummary: vi.fn(),
  getAppSetting: vi.fn(),
  setAppSetting: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    removeHandler,
    handle,
  },
}));

vi.mock("../services/enrichmentRuntimeService", () => ({
  enrichmentRuntimeService: {
    getPanelState,
    startRun,
    cancelRun,
    sendToBackground,
    getRunSummary,
  },
}));

vi.mock("../services/appSettingsService", () => ({
  appSettingsService: {
    getAppSetting,
    setAppSetting,
  },
}));

import { setupEnrichmentIpcHandlers } from "./ipcHandlers.enrichment";

describe("setupEnrichmentIpcHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers enrichment and app-setting handlers", async () => {
    getPanelState.mockReturnValue({ activeRun: null });
    startRun.mockReturnValue({ createdNewRun: true, run: { id: "run-1" } });
    cancelRun.mockReturnValue({ success: true });
    sendToBackground.mockReturnValue({ success: true });
    getRunSummary.mockReturnValue({ id: "run-1", status: "running" });
    getAppSetting.mockResolvedValue("CAD");
    setAppSetting.mockResolvedValue(undefined);

    setupEnrichmentIpcHandlers();

    const getPanelStateHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-enrichment-panel-state"
    )?.[1];
    const startRunHandler = handle.mock.calls.find(
      ([channel]) => channel === "start-enrichment-run"
    )?.[1];
    const cancelRunHandler = handle.mock.calls.find(
      ([channel]) => channel === "cancel-enrichment-run"
    )?.[1];
    const toBackgroundHandler = handle.mock.calls.find(
      ([channel]) => channel === "send-enrichment-run-to-background"
    )?.[1];
    const getSummaryHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-enrichment-run-summary"
    )?.[1];
    const getSettingHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-app-setting"
    )?.[1];
    const setSettingHandler = handle.mock.calls.find(
      ([channel]) => channel === "set-app-setting"
    )?.[1];

    expect(await getPanelStateHandler({})).toEqual({ activeRun: null });
    expect(await startRunHandler({}, { securityMetadata: true, securityPrices: false, fxRates: false })).toEqual({
      createdNewRun: true,
      run: { id: "run-1" },
    });
    expect(await cancelRunHandler({}, "run-1")).toEqual({ success: true });
    expect(await toBackgroundHandler({}, "run-1")).toEqual({ success: true });
    expect(await getSummaryHandler({}, "run-1")).toEqual({ id: "run-1", status: "running" });
    expect(await getSettingHandler({}, "baseCurrency")).toBe("CAD");
    expect(await setSettingHandler({}, { key: "baseCurrency", value: "CAD" })).toEqual({ success: true });

    expect(getAppSetting).toHaveBeenCalledWith("baseCurrency");
    expect(setAppSetting).toHaveBeenCalledWith("baseCurrency", "CAD");
  });
});
