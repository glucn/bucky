import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetTestDatabase } from "./database.test.utils";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { overviewService } from "./overviewService";
import { appSettingsService } from "./appSettingsService";
import { bindSecurityMarket } from "./securityMarketBinding";
import { securityMarketData } from "./securityMarketData";

beforeEach(resetTestDatabase);
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
async function purchase(currency = "USD", tradeDate = "2026-01-02") {
  const portfolio = await investmentService.createInvestmentPortfolio("Cutoff", currency);
  await databaseService.setOpeningBalance({ accountId: portfolio.tradeCashAccount.id, displayAmount: 1000, asOfDate: "2026-01-01" });
  await investmentService.recordBuy({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: tradeDate });
  const security = (await investmentService.getPortfolioAccounts(portfolio.group.id)).securities[0];
  await bindSecurityMarket({ accountId: security.id, market: "NASDAQ", quoteCurrency: currency, expectedMarket: null });
  await securityMarketData.write({ identity: { ticker: "ABC", market: "NASDAQ" }, points: [{ date: tradeDate, price: 12, priceBasis: "raw", barStatus: "complete" }], mode: "fill", source: "manual" });
  return { ...portfolio, security };
}
it("normalizes a supported calendar date before both holdings and FX lookup", async () => {
  const portfolio = await purchase("CAD");
  await databaseService.prismaClient.fxDailyRate.createMany({ data: [
    { sourceCurrency: "CAD", targetCurrency: "USD", marketDate: "2026-01-02", rate: 1 },
    { sourceCurrency: "CAD", targetCurrency: "USD", marketDate: "2026-01-04", rate: 2 },
  ] });
  const [position] = await investmentService.getAllPositions(portfolio.group.id, "1/3/2026");
  expect(position).toMatchObject({ quantity: 10, marketValue: 120, marketValueBase: 120 });
  expect((await overviewService.getOverviewDashboard("1/3/2026")).asOfDate).toBe("2026-01-03");
});
it("rejects an invalid dashboard date rather than producing an empty or malformed valuation", async () => {
  await expect(overviewService.getOverviewDashboard("2026-02-30")).rejects.toThrow(/date/i);
});
it("values empty foreign cash and zero-unit holdings without inventing or requiring an FX rate", async () => {
  await appSettingsService.setBaseCurrency("USD");
  const portfolio = await investmentService.createInvestmentPortfolio("Empty foreign book", "CAD");
  await investmentService.createSecurityAccount(portfolio.group.id, "EMPTY");
  expect(await investmentService.getPortfolioValue(portfolio.group.id)).toMatchObject({ cashBalance: 0, totalCostBasis: 0, totalMarketValue: 0 });
  expect((await investmentService.getAllPositions(portfolio.group.id))[0]).toMatchObject({ costBasisBase: 0, marketValueBase: 0 });
  const dashboard = await overviewService.getOverviewDashboard();
  expect(dashboard.netWorth.amount).toBe(0); expect(dashboard.metadata.missingFxPairs).toEqual([]);
});
it("uses one local calendar cutoff for cash, positions and quotes around UTC midnight", async () => {
  const portfolio = await purchase("USD", "2026-01-03");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-01-03T01:00:00Z"));
  // Simulate a book opened west of UTC where its local calendar is still January 2.
  vi.spyOn(Date.prototype, "getFullYear").mockReturnValue(2026);
  vi.spyOn(Date.prototype, "getMonth").mockReturnValue(0);
  vi.spyOn(Date.prototype, "getDate").mockReturnValue(2);
  expect(await investmentService.getPortfolioValue(portfolio.group.id)).toMatchObject({ cashBalance: 1000, totalCostBasis: 0, totalMarketValue: 0 });
  expect((await investmentService.getAllPositions(portfolio.group.id))[0]).toMatchObject({ quantity: 0, marketValue: 0 });
  expect((await overviewService.getOverviewDashboard()).netWorth.amount).toBe(1000);
});

it("keeps allocation values and their denominator on the request's day when an awaited read crosses midnight", async () => {
  const portfolio = await purchase();
  await investmentService.recordBuy({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2026-01-03" });
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-01-03T01:00:00Z"));
  let localDay = 2;
  vi.spyOn(Date.prototype, "getFullYear").mockReturnValue(2026);
  vi.spyOn(Date.prototype, "getMonth").mockReturnValue(0);
  vi.spyOn(Date.prototype, "getDate").mockImplementation(() => localDay);
  vi.spyOn(appSettingsService, "getBaseCurrency").mockImplementation(async () => { localDay = 3; return "USD"; });
  expect((await investmentService.getAssetAllocation(portfolio.group.id))[0]).toMatchObject({ marketValue: 120, percentOfPortfolio: 11.76 });
});

it("keeps an allocation's numerator and denominator in the same captured reporting currency", async () => {
  const portfolio = await purchase();
  await databaseService.prismaClient.fxDailyRate.create({ data: { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-02", rate: 1.4 } });
  vi.spyOn(appSettingsService, "getBaseCurrency").mockResolvedValueOnce("USD").mockResolvedValue("CAD");
  expect((await investmentService.getAssetAllocation(portfolio.group.id))[0].percentOfPortfolio).toBe(11.76);
});
