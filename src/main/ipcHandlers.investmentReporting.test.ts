import { beforeEach, expect, it, vi } from "vitest";
import { resetTestDatabase } from "../services/database.test.utils";
import { appSettingsService } from "../services/appSettingsService";
import { investmentService } from "../services/investmentService";
import { setupInvestmentIpcHandlers } from "./ipcHandlers.investments";
import { databaseService } from "../services/database";
beforeEach(resetTestDatabase);
it("retains the captured reporting currency on empty gains and scalar interest responses", async () => {
  await appSettingsService.setBaseCurrency("CAD");
  const portfolio = await investmentService.createInvestmentPortfolio("Empty reports", "CAD");
  const handlers = new Map<string, (...args: any[]) => any>();
  setupInvestmentIpcHandlers({ removeHandler: vi.fn(), handle: (channel: string, handler: (...args: any[]) => any) => { handlers.set(channel, handler); } } as any);
  const input = { portfolioId: portfolio.group.id, startDate: "2026-01-01", endDate: "2026-01-03" };
  expect(await handlers.get("get-realized-gains")!({}, input)).toMatchObject({ success: true, baseCurrency: "CAD", gains: [] });
  expect(await handlers.get("get-interest-income")!({}, input)).toMatchObject({ success: true, baseCurrency: "CAD", income: 0 });
});

it("returns dated period boundaries and forwards the allocation cutoff through registered handlers", async () => {
  await appSettingsService.setBaseCurrency("CAD");
  const portfolio = await investmentService.createInvestmentPortfolio("Dated IPC", "CAD");
  await databaseService.setOpeningBalance({ accountId: portfolio.tradeCashAccount.id, displayAmount: 100, asOfDate: "2025-12-31" });
  await investmentService.recordInterest(portfolio.group.id, 10, "2026-01-03", "Interest", portfolio.tradeCashAccount.id);
  const handlers = new Map<string, (...args: any[]) => any>();
  setupInvestmentIpcHandlers({ removeHandler: vi.fn(), handle: (channel: string, handler: (...args: any[]) => any) => { handlers.set(channel, handler); } } as any);
  expect(await handlers.get("get-portfolio-performance")!({}, { portfolioId: portfolio.group.id, startDate: "2026-01-01", endDate: "2026-01-03" })).toMatchObject({ success: true, performance: {
    openingDate: "2025-12-31", endDate: "2026-01-03", openingValue: 100, closingValue: 110, totalReturn: 10, totalReturnPercent: 10, returnMethod: "time_weighted", returnIssue: null,
  } });
  const allocation = vi.spyOn(investmentService, "getAssetAllocation");
  try {
    expect(await handlers.get("get-asset-allocation")!({}, { portfolioId: portfolio.group.id, asOfDate: "2026-01-03" })).toMatchObject({ success: true, allocation: [] });
    expect(allocation).toHaveBeenLastCalledWith(portfolio.group.id, "2026-01-03");
    await handlers.get("get-asset-allocation")!({}, portfolio.group.id);
    expect(allocation).toHaveBeenLastCalledWith(portfolio.group.id, undefined);
  } finally { allocation.mockRestore(); }
});
