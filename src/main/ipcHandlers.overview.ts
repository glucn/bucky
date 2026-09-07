import type { IpcRegistrar } from "./ipcSecurity";
import { overviewService } from "../services/overviewService";

export function setupOverviewIpcHandlers(ipcMain: IpcRegistrar): void {
  ipcMain.removeHandler("get-overview-dashboard");

  ipcMain.handle("get-overview-dashboard", async (_, asOfDate?: string) => {
    return overviewService.getOverviewDashboard(asOfDate);
  });
}
