import { ipcMain } from "electron";
import { appSettingsService } from "../services/appSettingsService";
import { enrichmentRuntimeService } from "../services/enrichmentRuntimeService";

export const setupEnrichmentIpcHandlers = () => {
  ipcMain.removeHandler("get-enrichment-panel-state");
  ipcMain.removeHandler("start-enrichment-run");
  ipcMain.removeHandler("cancel-enrichment-run");
  ipcMain.removeHandler("send-enrichment-run-to-background");
  ipcMain.removeHandler("get-enrichment-run-summary");
  ipcMain.removeHandler("get-app-setting");
  ipcMain.removeHandler("set-app-setting");

  ipcMain.handle("get-enrichment-panel-state", async () => {
    return enrichmentRuntimeService.getPanelState();
  });

  ipcMain.handle("start-enrichment-run", async (_, scope) => {
    return enrichmentRuntimeService.startRun(scope);
  });

  ipcMain.handle("cancel-enrichment-run", async (_, runId: string) => {
    return enrichmentRuntimeService.cancelRun(runId);
  });

  ipcMain.handle("send-enrichment-run-to-background", async (_, runId: string) => {
    return enrichmentRuntimeService.sendToBackground(runId);
  });

  ipcMain.handle("get-enrichment-run-summary", async (_, runId: string) => {
    return enrichmentRuntimeService.getRunSummary(runId);
  });

  ipcMain.handle("get-app-setting", async (_, key: string) => {
    return appSettingsService.getAppSetting(key);
  });

  ipcMain.handle("set-app-setting", async (_, data: { key: string; value: unknown }) => {
    await appSettingsService.setAppSetting(data.key, data.value as any);
    return { success: true };
  });
};
