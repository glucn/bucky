import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { investmentService } from "./investmentService";
import { bindSecurityMarket } from "./securityMarketBinding";
import { securityMarketData } from "./securityMarketData";
import { overviewService } from "./overviewService";

beforeEach(resetTestDatabase);
async function holding(name = "Canonical", market: string | null = "NASDAQ", currency = "USD") {
  const portfolio = await investmentService.createInvestmentPortfolio(name, currency);
  await databaseService.setOpeningBalance({ accountId: portfolio.tradeCashAccount.id, displayAmount: 1000, asOfDate: "2026-01-01" });
  await investmentService.recordBuy({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2026-01-02" });
  const account = (await investmentService.getPortfolioAccounts(portfolio.group.id)).securities[0];
  if (market) await bindSecurityMarket({ accountId: account.id, market, quoteCurrency: currency, expectedMarket: null });
  return { portfolio, account };
}
async function price(market: string, value: number, date = "2026-01-02") {
  await securityMarketData.write({ identity: { ticker: "ABC", market }, points: [{ date, price: value, priceBasis: "raw", barStatus: "complete" }], source: "manual", mode: "correct" });
}
it("values canonical-only prices with their full quote precision and persisted account identity", async () => {
  const { portfolio, account } = await holding(); await price("NASDAQ", 0.123456789);
  expect(await databaseService.prismaClient.securityPriceHistory.count()).toBe(0);
  expect(await investmentService.getPositionDetails(account.id)).toMatchObject({ accountId: account.id, market: "NASDAQ", marketPrice: 0.123456789, marketValue: 1.23, priceDate: "2026-01-02" });
  expect((await investmentService.getAllPositions(portfolio.group.id))[0]).toMatchObject({ accountId: account.id, marketValueBase: 1.23 });
});
it("does not substitute legacy prices or cost basis when market identity or a usable quote is missing", async () => {
  const { portfolio, account } = await holding("Unresolved", null);
  await investmentService.recordMarketPrice("ABC", 999, "2026-01-02"); await price("NASDAQ", 50);
  expect(await investmentService.getPositionDetails(account.id)).toMatchObject({ marketPrice: null, marketValue: null });
  expect((await investmentService.getAllPositions(portfolio.group.id))[0]).toMatchObject({ costBasisBase: 100, marketValueBase: null });
  expect(await investmentService.getPortfolioValue(portfolio.group.id)).toMatchObject({ totalCostBasis: 100, totalMarketValue: null, totalUnrealizedGain: null, securityMarketValueByCurrency: { USD: null } });
  expect((await investmentService.getAssetAllocation(portfolio.group.id))[0]).toMatchObject({ marketValue: null, percentOfPortfolio: null });
  expect(await investmentService.getPortfolioPerformance(portfolio.group.id, "2026-01-01", "2026-01-03")).toMatchObject({ currentValue: null, unrealizedGains: null, totalReturn: null, totalReturnPercent: null });
});

it("keeps a dashboard available while refusing to invent legacy dated holdings", async () => {
  const { account } = await holding(); await price("NASDAQ", 12);
  await databaseService.prismaClient.investmentProperties.update({ where: { accountId: account.id }, data: { hasCompleteActivityHistory: false } });
  const result = await overviewService.getOverviewDashboard("2026-01-03");
  expect(result.netWorth.amount).toBeNull(); expect(result.investmentAllocation.total).toBeNull();
});
it("keeps same-ticker markets separate and values a zero-unit position at zero without a quote", async () => {
  const first = await holding("US", "NASDAQ"), second = await holding("UK", "LSE", "GBP");
  await price("NASDAQ", 12); await price("LSE", 23);
  expect((await investmentService.getPositionDetails(first.account.id)).marketValue).toBe(120);
  expect((await investmentService.getPositionDetails(second.account.id)).marketValue).toBe(230);
  await investmentService.recordSell({ portfolioId: first.portfolio.group.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2026-01-03" });
  await databaseService.prismaClient.securityDailyPrice.deleteMany({ where: { market: "NASDAQ" } });
  expect(await investmentService.getPositionDetails(first.account.id)).toMatchObject({ quantity: 0, marketPrice: null, marketValue: 0 });
  expect((await investmentService.getPortfolioValue(first.portfolio.group.id)).totalMarketValue).toBe(0);
});
it("uses dated quantities with the canonical quote at or before the requested date", async () => {
  const { portfolio, account } = await holding(); await price("NASDAQ", 12); await price("NASDAQ", 20, "2026-01-04");
  await investmentService.recordSell({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", quantity: 5, pricePerShare: 20, date: "2026-01-04" });
  expect(await investmentService.getPositionDetails(account.id, "2026-01-03")).toMatchObject({ quantity: 10, marketPrice: 12, marketValue: 120 });
  expect(await investmentService.getPositionDetails(account.id, "2026-01-04")).toMatchObject({ quantity: 5, marketValue: 100 });
});
it("uses canonical values in dated dashboard totals and exposes missing price totals as unavailable", async () => {
  const { portfolio } = await holding(); await price("NASDAQ", 12);
  const before = await overviewService.getOverviewDashboard("2026-01-03");
  expect(before.netWorth.amount).toBe(1020);
  expect(before.investmentAllocation.slices.find((slice) => slice.portfolioId === portfolio.group.id)?.amount).toBe(1020);
  await databaseService.prismaClient.securityDailyPrice.deleteMany();
  const missing = await overviewService.getOverviewDashboard("2026-01-03");
  expect(missing.netWorth.amount).toBeNull(); expect(missing.investmentAllocation.total).toBeNull();
});
it("calculates allocation weights using converted market values and refuses partial denominators", async () => {
  const { portfolio, account } = await holding(); await price("NASDAQ", 12);
  const cash = await investmentService.addTradeCashAccount(portfolio.group.id, "EUR");
  await databaseService.setOpeningBalance({ accountId: cash.id, displayAmount: 50, asOfDate: "2026-01-01" });
  expect((await investmentService.getAssetAllocation(portfolio.group.id))[0]).toMatchObject({ percentOfPortfolio: null });
  await databaseService.prismaClient.fxDailyRate.create({ data: { sourceCurrency: "EUR", targetCurrency: "USD", marketDate: "2026-01-02", rate: 2 } });
  expect((await investmentService.getAssetAllocation(portfolio.group.id))[0]).toMatchObject({ accountId: account.id, marketValue: 120, percentOfPortfolio: 10.71 });
});
