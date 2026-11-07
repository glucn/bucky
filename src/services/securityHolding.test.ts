import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { investmentService } from "./investmentService";

beforeEach(resetTestDatabase);
it("creates legacy unresolved holdings in the portfolio's actual cash currency", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("CAD setup", "CAD");
  expect(await investmentService.createSecurityAccount(portfolio.group.id, "ABC")).toMatchObject({ currency: "CAD", groupId: portfolio.group.id, investmentProperties: { quantity: 0, market: null, hasCompleteActivityHistory: true } });
});
it("does not leave an orphan account when holding properties cannot be persisted", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Atomic setup");
  const count = await databaseService.prismaClient.account.count();
  await databaseService.prismaClient.$executeRawUnsafe("CREATE TRIGGER fail_holding_setup BEFORE INSERT ON InvestmentProperties BEGIN SELECT RAISE(ABORT,'synthetic holding failure'); END");
  try { await expect(investmentService.createSecurityAccount(portfolio.group.id, "ABC")).rejects.toThrow(); expect(await databaseService.prismaClient.account.count()).toBe(count); }
  finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_holding_setup"); }
});
it("refuses ambiguous ticker-only lookup instead of selecting the first market", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Two listings");
  await investmentService.createSecurityAccount(portfolio.group.id, "ABC");
  await databaseService.prismaClient.account.create({ data: { name: "Other listing", type: "user", subtype: "asset", currency: "USD", groupId: portfolio.group.id,
    investmentProperties: { create: { tickerSymbol: "ABC", market: "NASDAQ", quantity: 0, hasCompleteActivityHistory: true, costBasisMethod: "FIFO", lots: "[]" } } } });
  await expect(investmentService.getSecurityAccount(portfolio.group.id, "ABC")).rejects.toThrow(/select|ambiguous|explicit/i);
});

it("creates distinct explicit listings without posting money and keeps their buys and sales separate", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Cross-listed", "CAD"), usd = await investmentService.addTradeCashAccount(portfolio.group.id, "USD");
  const setup = { portfolioId: portfolio.group.id, tickerSymbol: "ABC", costBasisMethod: "FIFO", securityType: "stock" };
  const first = await (investmentService as any).createMarketHolding({ ...setup, market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id });
  const second = await (investmentService as any).createMarketHolding({ ...setup, market: "NASDAQ", quoteCurrency: "USD", tradeCashAccountId: usd.id, costBasisMethod: "AVERAGE_COST" });
  expect(first).toMatchObject({ currency: "CAD", investmentProperties: { market: "TSX", quantity: 0, lots: "[]", hasCompleteActivityHistory: true } });
  expect(second).toMatchObject({ currency: "USD", investmentProperties: { market: "NASDAQ", quantity: 0, lots: null } });
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
  await investmentService.recordBuy({ ...setup, securityAccountId: first.id, quantity: 10, pricePerShare: 10, date: "2026-01-02" });
  await investmentService.recordBuy({ ...setup, securityAccountId: second.id, quantity: 2, pricePerShare: 20, date: "2026-01-02" });
  await investmentService.recordSell({ ...setup, securityAccountId: second.id, quantity: 1, pricePerShare: 30, date: "2026-01-03" });
  expect(await investmentService.getPositionDetails(first.id)).toMatchObject({ quantity: 10, costBasis: 100, market: "TSX" });
  expect(await investmentService.getPositionDetails(second.id)).toMatchObject({ quantity: 1, costBasis: 20, market: "NASDAQ" });
});
it("refuses duplicate or unresolved identities and mismatched cash currency before creating any account", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Guarded setup", "CAD");
  const input = { portfolioId: portfolio.group.id, tickerSymbol: "ABC", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" };
  await investmentService.createSecurityAccount(portfolio.group.id, "ABC"); const count = await databaseService.prismaClient.account.count();
  await expect((investmentService as any).createMarketHolding(input)).rejects.toThrow(/existing|resolve|market/i);
  await expect((investmentService as any).createMarketHolding({ ...input, tickerSymbol: "OTHER", quoteCurrency: "USD" })).rejects.toThrow(/currency/i);
  expect(await databaseService.prismaClient.account.count()).toBe(count);
});
it("rolls back new holding creation when shared market currency conflicts", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Metadata conflict", "CAD");
  await databaseService.prismaClient.securityMetadata.create({ data: { ticker: "ABC", market: "TSX", quoteCurrency: "USD" } });
  const count = await databaseService.prismaClient.account.count();
  await expect((investmentService as any).createMarketHolding({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" })).rejects.toThrow(/currency/i);
  expect(await databaseService.prismaClient.account.count()).toBe(count); expect(await databaseService.prismaClient.investmentProperties.count()).toBe(0);
});
it("requires cash selection for fees/interest in a multi-currency portfolio and posts to the selected currency", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Cash selection", "CAD"), usd = await investmentService.addTradeCashAccount(portfolio.group.id, "USD");
  await expect(investmentService.recordInterest(portfolio.group.id, 3, "2026-01-02")).rejects.toThrow(/select|cash|currency/i);
  const interest = await (investmentService.recordInterest as any)(portfolio.group.id, 3, "2026-01-02", "USD interest", usd.id);
  const fee = await (investmentService.recordFee as any)(portfolio.group.id, 2, "USD fee", "2026-01-02", usd.id);
  expect(interest.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: usd.id, amount: 3, currency: "USD" })]));
  expect(fee.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: usd.id, amount: -2, currency: "USD" })]));
  expect(await databaseService.getAccountBalance(portfolio.tradeCashAccount.id)).toBe(0);
});

it("requires an explicit resolved market and cost policy on the new holding boundary", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Explicit setup");
  const input = { portfolioId: portfolio.group.id, tickerSymbol: "ABC", quoteCurrency: "USD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" };
  await expect((investmentService as any).createMarketHolding(input)).rejects.toThrow(/market/i);
  await expect((investmentService as any).createMarketHolding({ ...input, market: "NASDAQ", costBasisMethod: undefined })).rejects.toThrow(/cost/i);
  expect(await databaseService.prismaClient.investmentProperties.count()).toBe(0);
});

it("refuses duplicate listing, foreign and archived cash accounts without changing the book", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Ownership"), foreign = await investmentService.createInvestmentPortfolio("Other");
  const input = { portfolioId: portfolio.group.id, tickerSymbol: "ABC", market: "NASDAQ", quoteCurrency: "USD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" };
  await (investmentService as any).createMarketHolding(input);
  const count = await databaseService.prismaClient.account.count();
  await expect((investmentService as any).createMarketHolding(input)).rejects.toThrow(/already exists/i);
  await expect((investmentService as any).createMarketHolding({ ...input, tickerSymbol: "OTHER", tradeCashAccountId: foreign.tradeCashAccount.id })).rejects.toThrow(/cash/i);
  await databaseService.prismaClient.account.update({ where: { id: portfolio.tradeCashAccount.id }, data: { isArchived: true } });
  await expect(investmentService.recordFee(portfolio.group.id, 2, "Fee", "2026-01-02", portfolio.tradeCashAccount.id)).rejects.toThrow(/cash/i);
  expect(await databaseService.prismaClient.account.count()).toBe(count);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});

it("refuses nonfinite, subcent and invalid-date cash events before persisting anything", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Invalid cash");
  for (const amount of [NaN, Infinity, 0.001]) await expect(investmentService.recordInterest(portfolio.group.id, amount, "2026-01-02")).rejects.toThrow();
  await expect(investmentService.recordInterest(portfolio.group.id, 2, "2026-02-30")).rejects.toThrow(/date/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});
