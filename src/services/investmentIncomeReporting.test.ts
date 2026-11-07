import { beforeEach, expect, it } from "vitest";
import { resetTestDatabase } from "./database.test.utils";
import { databaseService } from "./database";
import { appSettingsService } from "./appSettingsService";
import { investmentService } from "./investmentService";

beforeEach(async () => { await resetTestDatabase(); await appSettingsService.setBaseCurrency("CAD"); });
async function listings() {
  const portfolio = await investmentService.createInvestmentPortfolio("Report listings", "CAD"), usd = await investmentService.addTradeCashAccount(portfolio.group.id, "USD");
  const common = { portfolioId: portfolio.group.id, tickerSymbol: "ABC", costBasisMethod: "FIFO" as const };
  const cadHolding = await investmentService.createMarketHolding({ ...common, market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id });
  const usdHolding = await investmentService.createMarketHolding({ ...common, market: "NASDAQ", quoteCurrency: "USD", tradeCashAccountId: usd.id });
  return { portfolioId: portfolio.group.id, cad: portfolio.tradeCashAccount, usd, cadHolding, usdHolding };
}
async function fx(date = "2026-01-03", rate = 1.5) {
  await databaseService.prismaClient.fxDailyRate.create({ data: { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: date, rate } });
}
it("reports both cash currencies, transaction-date canonical FX and exact holding identities despite edited descriptions", async () => {
  const book = await listings(); await fx(); await fx("2026-01-04", 9);
  for (const [holding, amount] of [[book.cadHolding, 5], [book.usdHolding, 10]] as const) {
    await investmentService.recordDividend({ portfolioId: book.portfolioId, securityAccountId: holding.id, tickerSymbol: "ABC", amount, date: "2026-01-03", description: "Custom income memo" });
  }
  const report: any = await investmentService.getDividendIncome(book.portfolioId, "2026-01-01", "2026-01-03");
  expect(report).toMatchObject({ baseCurrency: "CAD", total: 20, byCurrency: { CAD: 5, USD: 10 } });
  expect(report.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ accountId: book.cadHolding.id, market: "TSX", currency: "CAD", amount: 5, amountBase: 5 }),
    expect.objectContaining({ accountId: book.usdHolding.id, market: "NASDAQ", currency: "USD", amount: 10, amountBase: 15 }),
  ]));
  expect(await investmentService.getInterestIncome(book.portfolioId, "2026-01-01", "2026-01-03")).toBe(0);
  await investmentService.recordInterest(book.portfolioId, 3, "2026-01-03", "Second cash currency", book.usd.id);
  expect(await investmentService.getInterestIncome(book.portfolioId, "2026-01-01", "2026-01-03")).toBe(4.5);
});
it("preserves native income but refuses a partial or future-rate base total", async () => {
  const book = await listings(); await fx("2026-01-04");
  await investmentService.recordDividend({ portfolioId: book.portfolioId, tickerSymbol: "ABC", securityAccountId: book.usdHolding.id, amount: 10, date: "2026-01-03" });
  const report: any = await investmentService.getDividendIncome(book.portfolioId, "2026-01-01", "2026-01-03");
  expect(report).toMatchObject({ total: null, byCurrency: { USD: 10 }, rows: [expect.objectContaining({ amount: 10, amountBase: null, fxSource: "unavailable" })] });
});
it("reports net sale gains from structured activity even with custom descriptions and a second cash currency", async () => {
  const book = await listings(); await fx();
  const common = { portfolioId: book.portfolioId, tickerSymbol: "ABC", securityAccountId: book.usdHolding.id };
  await investmentService.recordBuy({ ...common, quantity: 2, pricePerShare: 20, date: "2026-01-02" });
  await investmentService.recordSell({ ...common, quantity: 1, pricePerShare: 30, fee: 1, date: "2026-01-03", description: "Custom sale memo" });
  const gains: any[] = await investmentService.getRealizedGains(book.portfolioId, "2026-01-01", "2026-01-03");
  expect(gains).toHaveLength(1);
  expect(gains[0]).toMatchObject({ accountId: book.usdHolding.id, tickerSymbol: "ABC", market: "NASDAQ", currency: "USD", baseCurrency: "CAD", quantity: 1, costBasis: 20, saleProceeds: 29, realizedGain: 9, realizedGainBase: 13.5 });
});
it("includes zero-gain disposals and uses the consumed lots rather than today's remaining lots for age", async () => {
  const book = await listings(), common = { portfolioId: book.portfolioId, tickerSymbol: "ABC", securityAccountId: book.cadHolding.id };
  await investmentService.recordBuy({ ...common, quantity: 1, pricePerShare: 10, date: "2024-01-02" });
  await investmentService.recordBuy({ ...common, quantity: 1, pricePerShare: 20, date: "2026-01-02" });
  await investmentService.recordSell({ ...common, quantity: 1, pricePerShare: 10, date: "2026-01-03" });
  const gains = await investmentService.getRealizedGains(book.portfolioId, "2026-01-03", "2026-01-03");
  expect(gains).toHaveLength(1); expect(gains[0]).toMatchObject({ quantity: 1, realizedGain: 0, holdingPeriod: "long" });
});
it("keeps legacy financial facts visible without inventing quantity or identity from description text", async () => {
  const book = await listings();
  const category = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Realized Gains/Losses" } });
  await databaseService.prismaClient.journalEntry.create({ data: { date: "2026-01-03", type: "investment_sell", description: "Sell 999 shares of FAKE @ 500", lines: { create: [
    { accountId: book.cadHolding.id, amount: -20, currency: "CAD" }, { accountId: book.cad.id, amount: 30, currency: "CAD" }, { accountId: category.id, amount: -10, currency: "CAD" },
  ] } } });
  const gains = await investmentService.getRealizedGains(book.portfolioId, "2026-01-01", "2026-01-03");
  expect(gains).toHaveLength(1); expect(gains[0]).toMatchObject({ accountId: book.cadHolding.id, tickerSymbol: "ABC", quantity: null, realizedGain: 10, holdingPeriod: "unknown" });
});
it("rejects invalid or reversed report ranges instead of returning misleading empty income", async () => {
  await expect(investmentService.getDividendIncome(null, "2026-02-30", "2026-03-01")).rejects.toThrow(/date|range/i);
  await expect(investmentService.getDividendIncome(null, "2026-03-02", "2026-03-01")).rejects.toThrow(/date|range/i);
});
it("counts reinvested income once, excludes return of capital and other portfolios, and retains renamed archived categories", async () => {
  const book = await listings(), common = { portfolioId: book.portfolioId, tickerSymbol: "ABC", securityAccountId: book.cadHolding.id };
  await investmentService.recordBuy({ ...common, quantity: 1, pricePerShare: 100, date: "2026-01-02" });
  await investmentService.recordDividend({ ...common, amount: 5, isReturnOfCapital: true, date: "2026-01-03" });
  await investmentService.recordReinvestedDividend({ ...common, dividendAmount: 10, reinvestmentPrice: 10, recordAsIncome: true, date: "2026-01-04" });
  const other = await investmentService.createInvestmentPortfolio("Other income", "CAD");
  await investmentService.recordDividend({ portfolioId: other.group.id, tickerSymbol: "XYZ", amount: 100, date: "2026-01-04" });
  const category = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Dividend Income" } });
  await databaseService.prismaClient.account.update({ where: { id: category.id }, data: { name: "Retained dividend category", isArchived: true } });
  const report = await investmentService.getDividendIncome(book.portfolioId, "2026-01-01", "2026-01-04");
  expect(report.total).toBe(10); expect(report.rows).toHaveLength(1);
  expect(report.rows[0]).toMatchObject({ accountId: book.cadHolding.id, tickerSymbol: "ABC", amount: 10 });
});
it("classifies a disposal spanning older and newer consumed lots as mixed", async () => {
  const book = await listings(), common = { portfolioId: book.portfolioId, tickerSymbol: "ABC", securityAccountId: book.cadHolding.id };
  await investmentService.recordBuy({ ...common, quantity: 1, pricePerShare: 10, date: "2024-01-02" });
  await investmentService.recordBuy({ ...common, quantity: 1, pricePerShare: 20, date: "2026-01-02" });
  await investmentService.recordSell({ ...common, quantity: 2, pricePerShare: 15, date: "2026-01-03" });
  expect((await investmentService.getRealizedGains(book.portfolioId, "2026-01-03", "2026-01-03"))[0]).toMatchObject({ realizedGain: 0, holdingPeriod: "mixed" });
});
it("refuses contradictory structured sale units instead of printing invented quantities", async () => {
  const book = await listings(), common = { portfolioId: book.portfolioId, tickerSymbol: "ABC", securityAccountId: book.cadHolding.id };
  await investmentService.recordBuy({ ...common, quantity: 1, pricePerShare: 10, date: "2026-01-02" });
  await investmentService.recordSell({ ...common, quantity: 1, pricePerShare: 15, date: "2026-01-03" });
  await databaseService.prismaClient.investmentActivity.updateMany({ where: { accountId: book.cadHolding.id, kind: "sell" }, data: { units: 999 } });
  await expect(investmentService.getRealizedGains(book.portfolioId, "2026-01-03", "2026-01-03")).rejects.toThrow(/activity|journal|quantity/i);
});
it("returns converted performance income and fees with their native currency breakdown", async () => {
  const book = await listings(); await fx();
  const common = { portfolioId: book.portfolioId, tickerSymbol: "ABC", securityAccountId: book.usdHolding.id };
  await investmentService.recordBuy({ ...common, quantity: 2, pricePerShare: 20, date: "2026-01-02" });
  await investmentService.recordSell({ ...common, quantity: 1, pricePerShare: 30, fee: 1, date: "2026-01-03" });
  await investmentService.recordDividend({ ...common, amount: 4, date: "2026-01-03" });
  await investmentService.recordInterest(book.portfolioId, 3, "2026-01-03", "Interest", book.usd.id);
  await investmentService.recordFee(book.portfolioId, 2, "Fee", "2026-01-03", book.usd.id);
  expect(await investmentService.getPortfolioPerformance(book.portfolioId, "2026-01-01", "2026-01-03")).toMatchObject({
    baseCurrency: "CAD", realizedGains: 13.5, dividendIncome: 6, interestIncome: 4.5, fees: 3,
    incomeByCurrency: { dividends: { USD: 4 }, interest: { USD: 3 }, fees: { USD: 2 } },
  });
});
it("does not reclassify a tagged dividend as interest when its category is renamed", async () => {
  const book = await listings();
  await investmentService.recordDividend({ portfolioId: book.portfolioId, tickerSymbol: "ABC", securityAccountId: book.cadHolding.id, amount: 5, date: "2026-01-03" });
  const category = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Dividend Income" } });
  await databaseService.prismaClient.account.update({ where: { id: category.id }, data: { name: "Interest Income" } });
  expect((await investmentService.getDividendIncome(book.portfolioId, "2026-01-03", "2026-01-03")).total).toBe(5);
  expect(await investmentService.getInterestIncome(book.portfolioId, "2026-01-03", "2026-01-03")).toBe(0);
});
it("refuses to assign an ambiguous multi-portfolio income entry to either portfolio", async () => {
  const book = await listings(), other = await investmentService.createInvestmentPortfolio("Other beneficiary", "CAD");
  const category = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Interest Income" } });
  await databaseService.prismaClient.journalEntry.create({ data: { date: "2026-01-03", type: "interest_income", lines: { create: [
    { accountId: book.cad.id, amount: 1, currency: "CAD" }, { accountId: other.tradeCashAccount.id, amount: 1, currency: "CAD" }, { accountId: category.id, amount: -2, currency: "CAD" },
  ] } } });
  await expect(investmentService.getInterestIncome(book.portfolioId, "2026-01-03", "2026-01-03")).rejects.toThrow(/attribution|multiple groups/i);
  expect(await investmentService.getInterestIncome(null, "2026-01-03", "2026-01-03")).toBe(2);
});
it("keeps gross income separate from withholding and refuses an ambiguous renamed multi-category receipt", async () => {
  const book = await listings(); await fx();
  const income = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Dividend Income" } });
  const tax = await databaseService.prismaClient.account.create({ data: { name: "Withholding", type: "category", currency: "USD" } });
  await databaseService.prismaClient.journalEntry.create({ data: { date: "2026-01-03", type: "dividend_cash", lines: { create: [
    { accountId: book.usd.id, amount: 85, currency: "USD" }, { accountId: income.id, amount: -100, currency: "USD" }, { accountId: tax.id, amount: 15, currency: "USD" },
  ] } } });
  expect(await investmentService.getDividendIncome(book.portfolioId, "2026-01-03", "2026-01-03")).toMatchObject({ total: 150, byCurrency: { USD: 100 } });
  await databaseService.prismaClient.account.update({ where: { id: income.id }, data: { name: "Unclassified receipt" } });
  await expect(investmentService.getDividendIncome(book.portfolioId, "2026-01-03", "2026-01-03")).rejects.toThrow(/category|classification|review/i);
});
it("preserves a legacy ledger gain separately from other category costs deducted from cash proceeds", async () => {
  const book = await listings();
  const gain = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Realized Gains/Losses" } });
  const tax = await databaseService.prismaClient.account.create({ data: { name: "Sale withholding", type: "category", currency: "CAD" } });
  await databaseService.prismaClient.journalEntry.create({ data: { date: "2026-01-03", type: "investment_sell", lines: { create: [
    { accountId: book.cadHolding.id, amount: -20, currency: "CAD" }, { accountId: book.cad.id, amount: 15, currency: "CAD" },
    { accountId: gain.id, amount: -10, currency: "CAD" }, { accountId: tax.id, amount: 15, currency: "CAD" },
  ] } } });
  expect((await investmentService.getRealizedGains(book.portfolioId, "2026-01-03", "2026-01-03"))[0]).toMatchObject({ costBasis: 20, saleProceeds: 15, realizedGain: 10, realizedGainBase: 10, otherCategoryAmount: 15 });
});
