import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { appSettingsService } from "./appSettingsService";
import { investmentService } from "./investmentService";
import { securityMarketData } from "./securityMarketData";
import { AccountType } from "../shared/accountTypes";
import { bindSecurityMarket } from "./securityMarketBinding";

beforeEach(async () => { await resetTestDatabase(); await appSettingsService.setBaseCurrency("CAD"); });
const report = (id: string, start = "2026-01-01", end = "2026-01-03") => investmentService.getPortfolioPerformance(id, start, end);
async function cashBook() { return investmentService.createInvestmentPortfolio("Dated performance", "CAD"); }
async function stockBook() {
  const portfolio = await cashBook();
  await databaseService.setOpeningBalance({ accountId: portfolio.tradeCashAccount.id, displayAmount: 100, asOfDate: "2025-12-30" });
  const holding = await investmentService.createMarketHolding({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" });
  await investmentService.recordBuy({ portfolioId: portfolio.group.id, securityAccountId: holding.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2025-12-31" });
  return { portfolio, holding };
}
async function quote(price: number, date: string) {
  await securityMarketData.write({ identity: { ticker: "ABC", market: "TSX" }, points: [{ date, price, priceBasis: "raw", barStatus: "complete" }], source: "manual", mode: "correct" });
}
async function transfer(fromAccountId: string, toAccountId: string, amount: number, date: string) {
  expect((await databaseService.createJournalEntry({ fromAccountId, toAccountId, amount, date, transactionType: "transfer" })).skipped).toBe(false);
}

it("values the documented multi-currency period including renamed settlement cash, without future FX or flows", async () => {
  const portfolio = await cashBook(), usd = await investmentService.addTradeCashAccount(portfolio.group.id, "USD");
  const outside = await databaseService.createAccount({ name: "USD bank", type: AccountType.User, currency: "USD" });
  await databaseService.setOpeningBalance({ accountId: portfolio.tradeCashAccount.id, displayAmount: 50, asOfDate: "2026-01-01" });
  await transfer(outside.id, usd.id, 100, "2026-01-02"); await transfer(usd.id, outside.id, 10, "2026-01-03");
  expect((await databaseService.createJournalEntry({ fromAccountId: usd.id, toAccountId: portfolio.tradeCashAccount.id, amountFrom: 10, amountTo: 15, exchangeRate: 1.5, date: "2026-01-03", type: "currency_transfer" })).skipped).toBe(false);
  await databaseService.updateAccount(usd.id, { name: "Broker USD settlement" });
  await transfer(outside.id, usd.id, 999, "2026-01-04");
  await databaseService.prismaClient.fxDailyRate.createMany({ data: [
    { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-01", rate: 1.5 },
    { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-03", rate: 2 },
    { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-04", rate: 9 },
  ] });
  expect(await report(portfolio.group.id)).toMatchObject({ openingDate: "2025-12-31", openingValue: 0, closingValue: 225, currentValue: 225, totalReturn: 45, totalReturnPercent: 22.5, deposits: 200, withdrawals: 20, returnMethod: "time_weighted", returnIssue: null });
});

it("uses opening holdings before the inclusive start and closing holdings at the selected end", async () => {
  const { portfolio, holding } = await stockBook();
  await quote(10, "2025-12-31"); await quote(12, "2026-01-03"); await quote(99, "2026-01-04");
  await investmentService.recordSell({ portfolioId: portfolio.group.id, securityAccountId: holding.id, tickerSymbol: "ABC", quantity: 5, pricePerShare: 99, date: "2026-01-04" });
  expect(await report(portfolio.group.id)).toMatchObject({ openingValue: 100, closingValue: 120, currentValue: 120, deposits: 0, withdrawals: 0, totalReturn: 20, totalReturnPercent: 20 });
  expect((await investmentService.getAssetAllocation(portfolio.group.id, "2026-01-03"))[0]).toMatchObject({ marketValue: 120, percentOfPortfolio: 100 });
});

it("links gains around contributions instead of dividing all gains by contributions", async () => {
  const { portfolio } = await stockBook();
  const bank = await databaseService.createAccount({ name: "CAD bank", type: AccountType.User, currency: "CAD" });
  await quote(10, "2025-12-31"); await quote(11, "2026-01-01"); await quote(12, "2026-01-02");
  await transfer(bank.id, portfolio.tradeCashAccount.id, 110, "2026-01-02");
  // Day one: 10%. Day two: (120 shares + 110 cash)/(110 + 110) - 1.
  expect(await report(portfolio.group.id, "2026-01-01", "2026-01-02")).toMatchObject({ openingValue: 100, closingValue: 230, deposits: 110, totalReturn: 20, totalReturnPercent: 15 });
});

it("treats deposits as start-day capital and withdrawals as end-day flows", async () => {
  const portfolio = await cashBook(), cash = portfolio.tradeCashAccount.id;
  const bank = await databaseService.createAccount({ name: "CAD bank", type: AccountType.User, currency: "CAD" });
  await databaseService.setOpeningBalance({ accountId: cash, displayAmount: 100, asOfDate: "2025-12-31" });
  await transfer(bank.id, cash, 100, "2026-01-02"); await investmentService.recordInterest(portfolio.group.id, 20, "2026-01-02", "Interest", cash);
  await transfer(cash, bank.id, 50, "2026-01-02");
  expect(await report(portfolio.group.id, "2026-01-02", "2026-01-02")).toMatchObject({ openingValue: 100, closingValue: 170, deposits: 100, withdrawals: 50, totalReturn: 20, totalReturnPercent: 10 });
});

it("keeps an unfunded period's zero gain distinct from an unavailable return percentage", async () => {
  const portfolio = await cashBook();
  expect(await report(portfolio.group.id)).toMatchObject({ openingValue: 0, closingValue: 0, totalReturn: 0, totalReturnPercent: null, returnIssue: expect.stringMatching(/capital/i) });
});

it("keeps known endpoint gain when an intermediate flow-day price is unavailable", async () => {
  const portfolio = await cashBook();
  const bank = await databaseService.createAccount({ name: "CAD bank", type: AccountType.User, currency: "CAD" });
  await transfer(bank.id, portfolio.tradeCashAccount.id, 100, "2026-01-01");
  const holding = await investmentService.createSecurityAccount(portfolio.group.id, "ABC");
  await investmentService.recordBuy({ portfolioId: portfolio.group.id, securityAccountId: holding.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2026-01-01" });
  await bindSecurityMarket({ accountId: holding.id, expectedMarket: null, market: "TSX", quoteCurrency: "CAD" });
  await transfer(bank.id, portfolio.tradeCashAccount.id, 50, "2026-01-02"); await quote(12, "2026-01-03");
  expect(await report(portfolio.group.id)).toMatchObject({ openingValue: 0, closingValue: 170, totalReturn: 20, totalReturnPercent: null, returnIssue: expect.stringMatching(/2026-01-01|2026-01-02/) });
});

it("never uses future FX to invent an opening value", async () => {
  const portfolio = await cashBook(), usd = await investmentService.addTradeCashAccount(portfolio.group.id, "USD");
  await databaseService.setOpeningBalance({ accountId: usd.id, displayAmount: 100, asOfDate: "2025-12-30" });
  await databaseService.prismaClient.fxDailyRate.create({ data: { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-03", rate: 2 } });
  expect(await report(portfolio.group.id)).toMatchObject({ openingValue: null, closingValue: 200, totalReturn: null, totalReturnPercent: null });
});

it("keeps legacy dated positions unavailable while retaining posted income facts", async () => {
  const { portfolio, holding } = await stockBook(); await quote(12, "2026-01-03");
  await investmentService.recordDividend({ portfolioId: portfolio.group.id, securityAccountId: holding.id, tickerSymbol: "ABC", amount: 5, date: "2026-01-03" });
  await databaseService.prismaClient.investmentProperties.update({ where: { accountId: holding.id }, data: { hasCompleteActivityHistory: false } });
  expect(await report(portfolio.group.id)).toMatchObject({ openingValue: null, closingValue: null, totalReturn: null, totalReturnPercent: null, dividendIncome: 5 });
});

it("does not let a checkpoint balance substitute for journal cash in a return", async () => {
  const portfolio = await cashBook();
  await databaseService.setOpeningBalance({ accountId: portfolio.tradeCashAccount.id, displayAmount: 100, asOfDate: "2025-12-31" });
  await databaseService.prismaClient.checkpoint.create({ data: { accountId: portfolio.tradeCashAccount.id, date: "2026-01-02", balance: 500 } });
  expect(await report(portfolio.group.id)).toMatchObject({ openingValue: 100, closingValue: null, totalReturn: null, totalReturnPercent: null });
});
