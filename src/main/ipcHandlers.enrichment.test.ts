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
  setBaseCurrency,
  getBaseCurrency,
  getBaseCurrencyReconciliationState,
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
  setBaseCurrency: vi.fn(),
  getBaseCurrency: vi.fn(),
  getBaseCurrencyReconciliationState: vi.fn(),
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
    setBaseCurrency,
    getBaseCurrency,
    getBaseCurrencyReconciliationState,
  },
}));

import { setupEnrichmentIpcHandlers } from "./ipcHandlers.enrichment";

describe("setupEnrichmentIpcHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers enrichment and app-setting handlers", async () => {
    const previousProvider = process.env.ENRICHMENT_PROVIDER;
    const previousApiKey = process.env.TWELVEDATA_API_KEY;
    delete process.env.ENRICHMENT_PROVIDER;
    delete process.env.TWELVEDATA_API_KEY;

    getPanelState.mockResolvedValue({
      activeRun: null,
      latestSummary: null,
      freshness: {
        metadata: null,
        prices: null,
        fx: null,
      },
    });
    startRun.mockReturnValue({ createdNewRun: true, run: { id: "run-1" } });
    cancelRun.mockReturnValue({ success: true });
    sendToBackground.mockReturnValue({ success: true });
    getRunSummary.mockReturnValue({ id: "run-1", status: "running" });
    getAppSetting.mockResolvedValue("CAD");
    setAppSetting.mockResolvedValue(undefined);
    setBaseCurrency.mockResolvedValue(undefined);
    getBaseCurrency.mockResolvedValue("CAD");
    getBaseCurrencyReconciliationState.mockResolvedValue({
      targetBaseCurrency: "CAD",
      status: "pending",
      changedAt: "2026-02-20T10:00:00.000Z",
    });

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
    const getConfigStateHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-enrichment-config-state"
    )?.[1];
    const getSettingHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-app-setting"
    )?.[1];
    const setSettingHandler = handle.mock.calls.find(
      ([channel]) => channel === "set-app-setting"
    )?.[1];
    const baseCurrencyImpactStateHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-base-currency-impact-state"
    )?.[1];

    expect(await getPanelStateHandler({})).toEqual({
      activeRun: null,
      latestSummary: null,
      freshness: {
        metadata: null,
        prices: null,
        fx: null,
      },
    });
    expect(await startRunHandler({}, { securityMetadata: true, securityPrices: false, fxRates: false })).toEqual({
      createdNewRun: true,
      run: { id: "run-1" },
    });
    expect(await cancelRunHandler({}, "run-1")).toEqual({ success: true });
    expect(await toBackgroundHandler({}, "run-1")).toEqual({ success: true });
    expect(await getSummaryHandler({}, "run-1")).toEqual({ id: "run-1", status: "running" });
    try {
      expect(await getConfigStateHandler({})).toEqual({
        providerConfigured: false,
        baseCurrencyConfigured: true,
      });
      expect(await getSettingHandler({}, "baseCurrency")).toBe("CAD");
      expect(await setSettingHandler({}, { key: "baseCurrency", value: "CAD" })).toEqual({ success: true });
      expect(await baseCurrencyImpactStateHandler({})).toEqual({
        baseCurrency: "CAD",
        reconciliation: {
          targetBaseCurrency: "CAD",
          status: "pending",
          changedAt: "2026-02-20T10:00:00.000Z",
        },
      });

      expect(getAppSetting).toHaveBeenCalledWith("baseCurrency");
      expect(setBaseCurrency).toHaveBeenCalledWith("CAD");
      expect(getBaseCurrencyReconciliationState).toHaveBeenCalledTimes(1);
    } finally {
      if (previousProvider === undefined) {
        delete process.env.ENRICHMENT_PROVIDER;
      } else {
        process.env.ENRICHMENT_PROVIDER = previousProvider;
      }
      if (previousApiKey === undefined) {
        delete process.env.TWELVEDATA_API_KEY;
      } else {
        process.env.TWELVEDATA_API_KEY = previousApiKey;
      }
    }
  });

  it("returns null reconciliation when state is missing", async () => {
    getBaseCurrency.mockResolvedValue("USD");
    getBaseCurrencyReconciliationState.mockResolvedValue(null);

    setupEnrichmentIpcHandlers();

    const baseCurrencyImpactStateHandler = handle.mock.calls.find(
      ([channel]) => channel === "get-base-currency-impact-state"
    )?.[1];

    expect(await baseCurrencyImpactStateHandler({})).toEqual({
      baseCurrency: "USD",
      reconciliation: null,
    });
  });
});
