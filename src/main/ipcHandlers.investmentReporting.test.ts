import { beforeEach, expect, it, vi } from "vitest";
import { resetTestDatabase } from "../services/database.test.utils";
import { appSettingsService } from "../services/appSettingsService";
import { investmentService } from "../services/investmentService";
import { setupInvestmentIpcHandlers } from "./ipcHandlers.investments";
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
