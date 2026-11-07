import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { investmentService } from "./investmentService";
import { securityMarketData } from "./securityMarketData";
import { getSecurityPriceContext, previewSecurityPrices } from "./securityPriceControls";
import { bindSecurityMarket } from "./securityMarketBinding";

beforeEach(resetTestDatabase);
async function setup() {
  const portfolio = await investmentService.createInvestmentPortfolio("Quote units", "CAD");
  const holding = await investmentService.createMarketHolding({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" });
  const trade = { portfolioId: portfolio.group.id, securityAccountId: holding.id, tickerSymbol: "ABC", quantity: 2, pricePerShare: 10, date: "2026-01-02" };
  await investmentService.recordBuy(trade);
  await securityMarketData.write({ identity: { ticker: "ABC", market: "TSX" }, points: [{ date: "2026-01-02", price: 12, priceBasis: "raw", barStatus: "complete" }], source: "manual", mode: "correct" });
  return { portfolio, holding, trade };
}
for (const quoteCurrency of [null, "USD"] as const) {
  it(`does not value CAD holdings or label their price controls with ${quoteCurrency ?? "unknown"} quote units`, async () => {
    const { portfolio, holding } = await setup();
    await databaseService.prismaClient.securityMetadata.update({ where: { ticker_market: { ticker: "ABC", market: "TSX" } }, data: { quoteCurrency } });
    expect(await investmentService.getPositionDetails(holding.id)).toMatchObject({ quantity: 2, costBasis: 20, marketPrice: null, marketValue: null, priceDate: null, quoteCurrency, quoteCurrencyIssue: expect.stringMatching(/currency/i) });
    expect(await investmentService.getPortfolioValue(portfolio.group.id)).toMatchObject({ totalMarketValue: null });
    expect(await getSecurityPriceContext({ accountId: holding.id })).toMatchObject({ currency: "CAD", quoteCurrency, quoteCurrencyIssue: expect.stringMatching(/currency/i), prices: [], priceCount: 1 });
    await expect(previewSecurityPrices({ accountId: holding.id, expectedMarket: "TSX", source: "manual", mode: "correct", confirmRawClose: true, points: [{ date: "2026-01-02", price: 50 }] })).rejects.toThrow(/currency/i);
    expect((await databaseService.prismaClient.securityDailyPrice.findFirstOrThrow()).close).toBe(12);
  });
  it(`refuses new financial activity with ${quoteCurrency ?? "unknown"} bound quote units before any posting`, async () => {
    const { holding, trade } = await setup();
    await databaseService.prismaClient.securityMetadata.update({ where: { ticker_market: { ticker: "ABC", market: "TSX" } }, data: { quoteCurrency } });
    const before = await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: holding.id } });
    const entries = await databaseService.prismaClient.journalEntry.count();
    await expect(investmentService.recordBuy({ ...trade, date: "2026-01-03" })).rejects.toThrow(/currency/i);
    await expect(investmentService.recordDividend({ ...trade, amount: 5, date: "2026-01-03" })).rejects.toThrow(/currency/i);
    expect(await databaseService.prismaClient.journalEntry.count()).toBe(entries);
    expect(await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: holding.id } })).toEqual(before);
    expect(await databaseService.prismaClient.investmentActivity.count()).toBe(1);
  });
}
it("allows explicit confirmation of missing metadata without rewriting prices or financial history", async () => {
  const { holding, trade } = await setup();
  await databaseService.prismaClient.securityMetadata.deleteMany();
  expect(await investmentService.getPositionDetails(holding.id)).toMatchObject({ marketValue: null });
  await bindSecurityMarket({ accountId: holding.id, expectedMarket: "TSX", market: "TSX", quoteCurrency: "CAD" });
  expect(await investmentService.getPositionDetails(holding.id)).toMatchObject({ marketValue: 24, quoteCurrency: "CAD", quoteCurrencyIssue: null });
  await investmentService.recordBuy({ ...trade, date: "2026-01-03" });
  expect(await databaseService.prismaClient.investmentActivity.count()).toBe(2);
});
it("keeps zero units worth zero while exposing unavailable quote units", async () => {
  const { holding, trade } = await setup();
  await investmentService.recordSell({ ...trade, date: "2026-01-03" });
  await databaseService.prismaClient.securityMetadata.deleteMany();
  expect(await investmentService.getPositionDetails(holding.id)).toMatchObject({ quantity: 0, marketPrice: null, marketValue: 0, quoteCurrencyIssue: expect.stringMatching(/currency/i) });
});

it("treats an empty legacy quote currency as missing so it can be explicitly confirmed", async () => {
  const { holding } = await setup();
  await databaseService.prismaClient.securityMetadata.update({ where: { ticker_market: { ticker: "ABC", market: "TSX" } }, data: { quoteCurrency: "" } });
  expect(await getSecurityPriceContext({ accountId: holding.id })).toMatchObject({ quoteCurrency: null, quoteCurrencyIssue: expect.stringMatching(/unconfirmed/i) });
  await bindSecurityMarket({ accountId: holding.id, expectedMarket: "TSX", market: "TSX", quoteCurrency: "CAD" });
  expect(await investmentService.getPositionDetails(holding.id)).toMatchObject({ marketValue: 24, quoteCurrency: "CAD" });
});
