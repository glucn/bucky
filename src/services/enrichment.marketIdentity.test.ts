import { beforeEach, expect, it, vi } from "vitest";
import { resetTestDatabase } from "./database.test.utils";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { bindSecurityMarket } from "./securityMarketBinding";
import { securityMarketData } from "./securityMarketData";
import { createEnrichmentRuntimeService } from "./enrichmentRuntimeService";
import { createEnrichmentRunCoordinator } from "./enrichmentRunCoordinator";

beforeEach(resetTestDatabase);
it("refreshes two real same-ticker holdings independently, reports ambiguity, and preserves manual corrections", async () => {
  const first = await investmentService.createInvestmentPortfolio("Synthetic US portfolio");
  const second = await investmentService.createInvestmentPortfolio("Synthetic UK portfolio", "GBP");
  const us = await investmentService.createSecurityAccount(first.group.id, "ABC");
  const uk = await investmentService.createSecurityAccount(second.group.id, "ABC");
  await databaseService.prismaClient.account.update({ where: { id: uk.id }, data: { currency: "GBP" } });
  await bindSecurityMarket({ accountId: us.id, market: "NASDAQ", quoteCurrency: "USD", expectedMarket: null });
  await bindSecurityMarket({ accountId: uk.id, market: "LSE", quoteCurrency: "GBP", expectedMarket: null });
  const unresolved = await investmentService.createSecurityAccount(first.group.id, "AMB");
  await databaseService.setOpeningBalance({ accountId: first.tradeCashAccount.id, displayAmount: 100, asOfDate: "2026-01-01" });
  const search = vi.fn().mockResolvedValue([
    { symbol: "AMB", market: "NASDAQ", quoteCurrency: "USD", displayName: null },
    { symbol: "AMB", market: "NYSE", quoteCurrency: "USD", displayName: null },
  ]);
  const metadata = vi.fn(async ({ symbol, market }) => ({ symbol, market, quoteCurrency: market === "LSE" ? "GBP" : "USD", displayName: null, assetType: null }));
  const prices = vi.fn(async ({ market }) => [{ marketDate: "2026-01-02", close: market === "LSE" ? 23 : 12, priceBasis: "raw" as const, barStatus: "complete" as const }]);
  const coordinator = createEnrichmentRunCoordinator();
  const runtime = createEnrichmentRuntimeService({ coordinator, getBaseCurrency: async () => "USD", resolveProvider: () => ({ ok: true, provider: {
    id: "yahoo", capabilities: { supportsSecurityMetadata: true, supportsSecurityDailyPrices: true, supportsFxDailyRates: false, supportsBatchRequests: false },
    searchSecuritiesByTicker: search, fetchSecurityMetadata: metadata, fetchSecurityDailyPrices: prices, fetchFxDailyRates: vi.fn(),
  } }) });
  const refresh = async () => {
    const { run } = runtime.startRun({ securityMetadata: true, securityPrices: true, fxRates: false });
    await vi.waitFor(() => expect(runtime.getRunSummary(run.id)?.status).toBe("completed_with_issues"));
    return runtime.getRunSummary(run.id)!;
  };
  const result = await refresh();
  expect(result.failedItems).toEqual(expect.arrayContaining([expect.objectContaining({ identifier: "AMB/UNKNOWN" })]));
  expect(await databaseService.prismaClient.securityDailyPrice.count()).toBe(2);
  expect(await securityMarketData.latest({ ticker: "ABC", market: "NASDAQ" }, "2026-01-02")).toMatchObject({ price: 12, source: "provider" });
  expect(await securityMarketData.latest({ ticker: "ABC", market: "LSE" }, "2026-01-02")).toMatchObject({ price: 23, source: "provider" });
  expect(metadata.mock.calls.every(([input]) => input.symbol === "ABC")).toBe(true);
  expect((await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: unresolved.id } })).market).toBeNull();
  await securityMarketData.write({ identity: { ticker: "ABC", market: "NASDAQ" }, points: [{ date: "2026-01-02", price: 15, priceBasis: "raw" as const, barStatus: "complete" as const }], mode: "correct", source: "manual" });
  await refresh();
  expect(await securityMarketData.latest({ ticker: "ABC", market: "NASDAQ" }, "2026-01-02")).toMatchObject({ price: 15, source: "manual" });
  expect(await databaseService.prismaClient.securityPriceHistory.count()).toBe(0);
});
