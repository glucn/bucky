import { ipcMain } from "electron";
import {
  type IncomeExpenseBreakdownFilter,
  type IncomeExpenseTrendFilter,
} from "../shared/reporting";
import { reportingService } from "../services/reportingService";

export function setupReportingIpcHandlers(): void {
  ipcMain.removeHandler("get-income-expense-trend-report");
  ipcMain.removeHandler("get-income-expense-breakdown-report");

  ipcMain.handle(
    "get-income-expense-trend-report",
    async (_, filter: IncomeExpenseTrendFilter, asOfDate?: string) => {
      return reportingService.getIncomeExpenseTrendReport(filter, asOfDate);
    }
  );

  ipcMain.handle(
    "get-income-expense-breakdown-report",
    async (_, filter: IncomeExpenseBreakdownFilter, asOfDate?: string) => {
      return reportingService.getIncomeExpenseBreakdownReport(filter, asOfDate);
    }
  );
}
