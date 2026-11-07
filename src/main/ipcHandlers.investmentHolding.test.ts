import { beforeEach, expect, it, vi } from "vitest";
import { resetTestDatabase } from "../services/database.test.utils";
import { investmentService } from "../services/investmentService";
import { setupInvestmentIpcHandlers } from "./ipcHandlers.investments";
import { APP_IPC_CHANNELS } from "../shared/ipcChannels";

beforeEach(resetTestDatabase);
it("exposes explicit holding creation and forwards selected cash for fee and interest through the registered handlers", async () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  setupInvestmentIpcHandlers({ removeHandler: vi.fn(), handle: (channel: string, handler: (...args: any[]) => any) => { handlers.set(channel, handler); } } as any);
  expect(APP_IPC_CHANNELS).toContain("create-market-holding");
  const portfolio = await investmentService.createInvestmentPortfolio("IPC selection", "CAD"), usd = await investmentService.addTradeCashAccount(portfolio.group.id, "USD");
  const created = await handlers.get("create-market-holding")!({}, { portfolioId: portfolio.group.id, tickerSymbol: "ABC", market: "NASDAQ", quoteCurrency: "USD", tradeCashAccountId: usd.id, costBasisMethod: "FIFO" });
  expect(created).toMatchObject({ success: true, account: { currency: "USD", investmentProperties: { market: "NASDAQ", quantity: 0 } } });
  for (const channel of ["record-fee", "record-interest"]) {
    const result = await handlers.get(channel)!({}, { portfolioId: portfolio.group.id, tradeCashAccountId: usd.id, amount: 3, date: "2026-01-02", description: "Selected USD" });
    expect(result.success).toBe(true);
    expect(result.entry.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: usd.id, currency: "USD" })]));
  }
});
