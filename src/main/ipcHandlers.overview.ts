import { ipcMain } from "electron";
import { overviewService } from "../services/overviewService";

export function setupOverviewIpcHandlers(): void {
  ipcMain.removeHandler("get-overview-dashboard");

  ipcMain.handle("get-overview-dashboard", async (_, asOfDate?: string) => {
    return overviewService.getOverviewDashboard(asOfDate);
  });
}
