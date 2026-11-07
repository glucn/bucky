import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { investmentService } from "./investmentService";
import { AccountType } from "../shared/accountTypes";
import { appSettingsService } from "./appSettingsService";
import { investmentCashFlows } from "./investmentCashFlows";

beforeEach(resetTestDatabase);
async function book() {
  await appSettingsService.setBaseCurrency("CAD");
  const portfolio = await investmentService.createInvestmentPortfolio("Flow scope", "CAD");
  const usd = await investmentService.addTradeCashAccount(portfolio.group.id, "USD");
  const outside = await databaseService.createAccount({ name: "Outside USD", type: AccountType.User, currency: "USD" });
  await databaseService.prismaClient.fxDailyRate.createMany({ data: [
    { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-01", rate: 1.5 },
    { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-03", rate: 2 },
  ] });
  return { portfolio, usd, outside };
}
async function transfer(from: string, to: string, amount: number, date: string) {
  const result = await databaseService.createJournalEntry({ fromAccountId: from, toAccountId: to, amount, date, transactionType: "transfer" });
  expect(result.skipped).toBe(false);
  return result.entry;
}
const performance = (id: string) => investmentService.getPortfolioPerformance(id, "2026-01-01", "2026-01-03");

it("counts ordinary transfers across every cash currency at posting-date FX, independent of mutable names and tags", async () => {
  const { portfolio, usd, outside } = await book();
  await transfer(outside.id, usd.id, 100, "2026-01-02");
  await transfer(usd.id, outside.id, 10, "2026-01-03");
  const cad = await databaseService.createAccount({ name: "Outside CAD", type: AccountType.User, currency: "CAD" });
  await transfer(cad.id, portfolio.tradeCashAccount.id, 50, "2026-01-02");
  await databaseService.updateAccount(usd.id, { name: "Broker USD settlement" });
  expect(await performance(portfolio.group.id)).toMatchObject({ deposits: 200, withdrawals: 20,
    cashFlows: { depositsByCurrency: { USD: 100, CAD: 50 }, withdrawalsByCurrency: { USD: 10 }, rows: expect.arrayContaining([
      expect.objectContaining({ accountId: usd.id, date: "2026-01-02", currency: "USD", amount: 100, amountBase: 150 }),
      expect.objectContaining({ accountId: portfolio.tradeCashAccount.id, currency: "CAD", amount: 50, amountBase: 50 }),
      expect.objectContaining({ accountId: usd.id, date: "2026-01-03", amount: -10, amountBase: -20 }),
    ]) } });
});

it("excludes internal FX, trades, income and fees even when an internal journal has a deposit tag", async () => {
  const { portfolio, usd } = await book();
  const internal = await databaseService.createJournalEntry({ fromAccountId: portfolio.tradeCashAccount.id, toAccountId: usd.id, amountFrom: 150, amountTo: 100, exchangeRate: 100 / 150, date: "2026-01-02", type: "currency_transfer" });
  expect(internal.skipped).toBe(false);
  await databaseService.prismaClient.journalEntry.update({ where: { id: internal.entry.id }, data: { type: "investment_cash_deposit" } });
  await investmentService.recordInterest(portfolio.group.id, 5, "2026-01-03", "Interest", usd.id);
  await investmentService.recordFee(portfolio.group.id, 2, "Fee", "2026-01-03", usd.id);
  await investmentService.recordBuy({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", quantity: 1, pricePerShare: 10, date: "2026-01-03", tradeCashAccountId: usd.id });
  expect(await performance(portfolio.group.id)).toMatchObject({ deposits: 0, withdrawals: 0, cashFlows: { rows: [] } });
});

it("treats tagged cash opening funding as a contribution after its system account is renamed", async () => {
  const { portfolio, usd } = await book();
  await databaseService.setOpeningBalance({ accountId: usd.id, displayAmount: 100, asOfDate: "2026-01-02" });
  const equity = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Opening Balances" } });
  await databaseService.updateAccount(equity.id, { name: "Renamed equity" });
  expect(await performance(portfolio.group.id)).toMatchObject({ deposits: 150, withdrawals: 0, cashFlows: { depositsByCurrency: { USD: 100 } } });
});

it("keeps native flows while making only required missing-FX base totals unavailable", async () => {
  const { portfolio, usd, outside } = await book();
  await databaseService.prismaClient.fxDailyRate.deleteMany();
  await transfer(outside.id, usd.id, 100, "2026-01-02");
  await databaseService.prismaClient.fxDailyRate.create({ data: { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-04", rate: 9 } });
  expect(await performance(portfolio.group.id)).toMatchObject({ deposits: null, withdrawals: 0, cashFlows: { depositsByCurrency: { USD: 100 }, rows: [expect.objectContaining({ amountBase: null, fxSource: "unavailable" })] } });
});

it("counts transfers between portfolios once in each scope and respects inclusive date bounds", async () => {
  const { portfolio } = await book();
  const second = await investmentService.createInvestmentPortfolio("Other portfolio", "CAD");
  await transfer(portfolio.tradeCashAccount.id, second.tradeCashAccount.id, 25, "2026-01-02");
  await transfer(second.tradeCashAccount.id, portfolio.tradeCashAccount.id, 7, "2026-01-04");
  expect(await performance(portfolio.group.id)).toMatchObject({ deposits: 0, withdrawals: 25 });
  expect(await performance(second.group.id)).toMatchObject({ deposits: 25, withdrawals: 0 });
});

it("retains FX precision before aggregating small foreign contributions", async () => {
  const { portfolio, usd, outside } = await book();
  for (let index = 0; index < 10; index++) {
    const result = await databaseService.createJournalEntry({ fromAccountId: outside.id, toAccountId: usd.id, amount: 0.01, date: "2026-01-02", transactionType: "transfer", skipDuplicateCheck: false });
    expect(result.skipped).toBe(false);
  }
  const result = await performance(portfolio.group.id);
  expect(result.deposits).toBe(0.15);
  expect(result.cashFlows.rows).toHaveLength(10);
  expect(result.cashFlows.rows[0].amountBase).toBeCloseTo(0.015, 10);
});

it("does not invent contributions from a zero-valued retained opening journal", async () => {
  const { portfolio } = await book();
  const equity = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Opening Balances" } });
  await databaseService.prismaClient.journalEntry.create({ data: { date: "2026-01-02", entryType: "opening-balance", lines: { create: [
    { accountId: portfolio.tradeCashAccount.id, currency: "CAD", amount: 0 }, { accountId: equity.id, currency: "CAD", amount: 0 },
  ] } } });
  expect(await performance(portfolio.group.id)).toMatchObject({ deposits: 0, withdrawals: 0, cashFlows: { rows: [] } });
});

it("refuses to guess fee attribution inside mixed external funding", async () => {
  const { portfolio } = await book();
  const outside = await databaseService.createAccount({ name: "Outside CAD", type: AccountType.User, currency: "CAD" });
  const expense = await databaseService.prismaClient.account.findFirstOrThrow({ where: { type: AccountType.Category } });
  await databaseService.prismaClient.journalEntry.create({ data: { date: "2026-01-02", lines: { create: [
    { accountId: portfolio.tradeCashAccount.id, currency: "CAD", amount: 100 },
    { accountId: outside.id, currency: "CAD", amount: -105 }, { accountId: expense.id, currency: "CAD", amount: 5 },
  ] } } });
  await expect(performance(portfolio.group.id)).rejects.toThrow(/mixed.*funding.*review/i);
});

it("requires review for unclassified system adjustments and user-line currency conflicts", async () => {
  const { portfolio, usd, outside } = await book();
  const entry = await transfer(outside.id, usd.id, 100, "2026-01-02");
  await databaseService.prismaClient.journalLine.updateMany({ where: { entryId: entry.id, accountId: usd.id }, data: { currency: "CAD" } });
  await expect(performance(portfolio.group.id)).rejects.toThrow(/currency.*review/i);
  await databaseService.prismaClient.journalLine.updateMany({ where: { entryId: entry.id, accountId: usd.id }, data: { currency: "USD" } });
  await databaseService.prismaClient.account.update({ where: { id: outside.id }, data: { type: AccountType.System } });
  await expect(performance(portfolio.group.id)).rejects.toThrow(/classification review/i);
});

it("counts archived cash history and refuses in-kind transfers without a reviewed valuation", async () => {
  const { portfolio, usd, outside } = await book();
  await transfer(outside.id, usd.id, 100, "2026-01-02");
  await databaseService.archiveAccount(usd.id);
  expect(await performance(portfolio.group.id)).toMatchObject({ deposits: 150 });
  const security = await investmentService.createSecurityAccount(portfolio.group.id, "ABC");
  await databaseService.prismaClient.journalEntry.create({ data: { date: "2026-01-03", lines: { create: [
    { accountId: security.id, currency: "CAD", amount: 50 }, { accountId: outside.id, currency: "USD", amount: -25 },
  ] } } });
  await expect(investmentCashFlows(portfolio.group.id, "2026-01-01", "2026-01-03", "CAD")).rejects.toThrow(/in-kind.*review/i);
});
