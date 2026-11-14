import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { resetTestDatabase } from "./database.test.utils";
import { AccountSubtype, AccountType } from "../shared/accountTypes";

beforeEach(resetTestDatabase);
async function renamed() {
  const portfolio = await investmentService.createInvestmentPortfolio("Renamed settlement", "CAD");
  await databaseService.updateAccount(portfolio.tradeCashAccount.id, { name: "Broker settlement" });
  return portfolio;
}

it("retains a cash-only portfolio after all editable names change", async () => {
  const portfolio = await renamed();
  await databaseService.updateAccountGroup(portfolio.group.id, { name: "Retirement book" });
  expect((await investmentService.getInvestmentPortfolios()).map((group) => group.id)).toEqual([portfolio.group.id]);
  expect((await investmentService.getTradeCashAccount(portfolio.group.id, "CAD"))?.id).toBe(portfolio.tradeCashAccount.id);
  expect((await investmentService.getPortfolioAccounts(portfolio.group.id)).tradeCashAccounts.map((account) => account.id)).toEqual([portfolio.tradeCashAccount.id]);
  await expect(investmentService.addTradeCashAccount(portfolio.group.id, "CAD")).rejects.toThrow(/already exists/i);
});

it("does not classify an ordinary bank group from an account's display name", async () => {
  const group = await databaseService.createAccountGroup({ name: "Bank group", accountType: AccountType.User });
  const account = await databaseService.createAccount({ name: "Trade Cash - Bank group (CAD)", type: AccountType.User, currency: "CAD" });
  await databaseService.addAccountToGroup(account.id, group.id);
  expect(await investmentService.getInvestmentPortfolios()).toEqual([]);
});
it("requires portfolio confirmation before posting investment cash activity in an ordinary bank group", async () => {
  const group = await databaseService.createAccountGroup({ name: "Unconfirmed bank group", accountType: AccountType.User });
  const cash = await databaseService.createAccount({ name: "Checking", type: AccountType.User, currency: "CAD" });
  await databaseService.addAccountToGroup(cash.id, group.id);
  await expect(investmentService.recordInterest(group.id, 10, "2026-01-01", "Interest", cash.id)).rejects.toThrow(/confirm|review.*portfolio/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});

it("uses renamed settlement cash for setup, trades, distributions, fees and statement imports", async () => {
  const portfolio = await renamed(), portfolioId = portfolio.group.id, cashId = portfolio.tradeCashAccount.id;
  await databaseService.setOpeningBalance({ accountId: cashId, displayAmount: 100, asOfDate: "2026-01-01" });
  const holding = await investmentService.createMarketHolding({ portfolioId, tickerSymbol: "ABC", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: cashId, costBasisMethod: "FIFO" });
  await investmentService.recordBuy({ portfolioId, securityAccountId: holding.id, tickerSymbol: "ABC", quantity: 2, pricePerShare: 10, date: "2026-01-02", tradeCashAccountId: cashId });
  await investmentService.recordDividend({ portfolioId, securityAccountId: holding.id, tickerSymbol: "ABC", amount: 3, date: "2026-01-03", tradeCashAccountId: cashId });
  await investmentService.recordSell({ portfolioId, securityAccountId: holding.id, tickerSymbol: "ABC", quantity: 1, pricePerShare: 12, date: "2026-01-04", tradeCashAccountId: cashId });
  await investmentService.recordInterest(portfolioId, 2, "2026-01-05", "Interest", cashId);
  await investmentService.recordFee(portfolioId, 1, "Broker fee", "2026-01-05", cashId);
  const csv = "Date,Type,Ticker,Amount\n2026-01-06,fee,CASH,4";
  expect(await investmentService.importInvestmentTransactions(portfolioId, csv, { date: "Date", type: "Type", ticker: "Ticker", amount: "Amount" }, { tradeCashAccountId: cashId })).toMatchObject({ imported: 1, errors: [] });
  expect(await databaseService.getAccountBalance(cashId)).toBe(92);
});

it("requires explicit selection when two eligible accounts have the same currency", async () => {
  const portfolio = await renamed();
  const second = await databaseService.createAccount({ name: "Second settlement", type: AccountType.User, currency: "CAD" });
  await databaseService.addAccountToGroup(second.id, portfolio.group.id);
  await expect(investmentService.getTradeCashAccount(portfolio.group.id, "CAD")).rejects.toThrow(/explicit|multiple|select/i);
  await expect(investmentService.recordInterest(portfolio.group.id, 1, "2026-01-01", "Interest")).rejects.toThrow(/select/i);
  await investmentService.recordInterest(portfolio.group.id, 1, "2026-01-01", "Interest", second.id);
  expect(await databaseService.getAccountBalance(second.id)).toBe(1);
});

it("does not retain a portfolio marker or orphan group when initial cash creation fails", async () => {
  await databaseService.prismaClient.$executeRawUnsafe("CREATE TRIGGER fail_portfolio_cash BEFORE INSERT ON Account BEGIN SELECT RAISE(ABORT, 'synthetic settlement failure'); END");
  try {
    await expect(investmentService.createInvestmentPortfolio("Must roll back", "CAD")).rejects.toThrow();
    expect(await databaseService.prismaClient.accountGroup.count({ where: { name: "Must roll back" } })).toBe(0);
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_portfolio_cash"); }
});

it("classifies a reviewed legacy cash group only against its displayed membership snapshot", async () => {
  const group = await databaseService.createAccountGroup({ name: "Existing broker", accountType: AccountType.User });
  const cash = await databaseService.createAccount({ name: "Old settlement", type: AccountType.User, currency: "CAD" });
  await databaseService.addAccountToGroup(cash.id, group.id);
  expect((await (investmentService as any).getPortfolioReviewCandidates()).map((candidate: any) => candidate.id)).toContain(group.id);
  await expect((investmentService as any).confirmInvestmentPortfolio(group.id, [])).rejects.toThrow(/changed|membership/i);
  const before = await databaseService.prismaClient.journalEntry.count();
  await (investmentService as any).confirmInvestmentPortfolio(group.id, [cash.id]);
  expect((await investmentService.getInvestmentPortfolios()).map((portfolio) => portfolio.id)).toContain(group.id);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(before);
});
