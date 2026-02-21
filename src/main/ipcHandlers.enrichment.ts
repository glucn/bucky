import { ipcMain } from "electron";
import { appSettingsService } from "../services/appSettingsService";
import { enrichmentRuntimeService } from "../services/enrichmentRuntimeService";

const serializeRun = (run: any) => {
  if (!run) {
    return null;
  }

  return {
    ...run,
    startedAt: run.startedAt instanceof Date ? run.startedAt.toISOString() : run.startedAt,
    endedAt: run.endedAt instanceof Date ? run.endedAt.toISOString() : run.endedAt,
  };
};

export const setupEnrichmentIpcHandlers = () => {
  ipcMain.removeHandler("get-enrichment-panel-state");
  ipcMain.removeHandler("start-enrichment-run");
  ipcMain.removeHandler("cancel-enrichment-run");
  ipcMain.removeHandler("send-enrichment-run-to-background");
  ipcMain.removeHandler("get-enrichment-run-summary");
  ipcMain.removeHandler("get-enrichment-config-state");
  ipcMain.removeHandler("seed-enrichment-run-summary");
  ipcMain.removeHandler("get-app-setting");
  ipcMain.removeHandler("set-app-setting");
  ipcMain.removeHandler("get-base-currency-impact-state");

  ipcMain.handle("get-enrichment-panel-state", async () => {
    const panelState = await enrichmentRuntimeService.getPanelState();
    return {
      activeRun: serializeRun(panelState.activeRun),
      latestSummary: serializeRun(panelState.latestSummary),
      freshness: {
        metadata:
          panelState.freshness.metadata instanceof Date
            ? panelState.freshness.metadata.toISOString()
            : null,
        prices:
          panelState.freshness.prices instanceof Date
            ? panelState.freshness.prices.toISOString()
            : null,
        fx:
          panelState.freshness.fx instanceof Date
            ? panelState.freshness.fx.toISOString()
            : null,
      },
    };
  });

  ipcMain.handle("start-enrichment-run", async (_, scope) => {
    const result = enrichmentRuntimeService.startRun(scope);
    return {
      ...result,
      run: serializeRun(result.run),
    };
  });

  ipcMain.handle("cancel-enrichment-run", async (_, runId: string) => {
    return enrichmentRuntimeService.cancelRun(runId);
  });

  ipcMain.handle("send-enrichment-run-to-background", async (_, runId: string) => {
    return enrichmentRuntimeService.sendToBackground(runId);
  });

  ipcMain.handle("get-enrichment-run-summary", async (_, runId: string) => {
    return serializeRun(enrichmentRuntimeService.getRunSummary(runId));
  });

  ipcMain.handle("get-enrichment-config-state", async () => {
    const provider = process.env.ENRICHMENT_PROVIDER;
    const providerConfigured =
      provider === "yahoo" ||
      (provider === "twelvedata" && Boolean(process.env.TWELVEDATA_API_KEY));
    const baseCurrency = await appSettingsService.getBaseCurrency();

    return {
      providerConfigured,
      baseCurrencyConfigured: Boolean(baseCurrency),
    };
  });

  if (process.env.PLAYWRIGHT_TEST === "1") {
    ipcMain.handle("seed-enrichment-run-summary", async () => {
      return enrichmentRuntimeService.seedCompletedWithIssuesRunForTest();
    });
  }

  ipcMain.handle("get-app-setting", async (_, key: string) => {
    return appSettingsService.getAppSetting(key);
  });

  ipcMain.handle("set-app-setting", async (_, data: { key: string; value: unknown }) => {
    if (data.key === "baseCurrency" && typeof data.value === "string") {
      await appSettingsService.setBaseCurrency(data.value);
      return { success: true };
    }

    await appSettingsService.setAppSetting(data.key, data.value as any);
    return { success: true };
  });

  ipcMain.handle("get-base-currency-impact-state", async () => {
    const [baseCurrency, reconciliation] = await Promise.all([
      appSettingsService.getBaseCurrency(),
      appSettingsService.getBaseCurrencyReconciliationState(),
    ]);

    return {
      baseCurrency,
      reconciliation,
    };
  });
};
