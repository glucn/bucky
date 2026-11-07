import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { investmentService } from "./investmentService";
import { AccountType } from "../shared/accountTypes";

beforeEach(resetTestDatabase);
const bank = () => databaseService.createAccount({ name: "Bank", type: AccountType.User, currency: "USD" });

it("refuses to relabel posted money even when the account has returned to zero, atomically preserving its name", async () => {
  const account = await bank();
  const category = await databaseService.createAccount({ name: "Income", type: AccountType.Category });
  for (const [from, to] of [[category.id, account.id], [account.id, category.id]]) {
    const result = await databaseService.createJournalEntry({ date: "2026-01-02", description: "Posted money", fromAccountId: from, toAccountId: to, amount: 100 });
    expect(result.skipped).toBe(false);
  }
  expect(await databaseService.prismaClient.journalLine.count({ where: { accountId: account.id } })).toBe(2);
  await expect(databaseService.updateAccount(account.id, { name: "Relabeled", currency: "CAD" })).rejects.toThrow(/currency.*history/i);
  expect(await databaseService.getAccount(account.id)).toMatchObject({ name: "Bank", currency: "USD" });
  await expect(databaseService.updateAccount(account.id, { name: "Renamed", currency: "USD" })).resolves.toMatchObject({ name: "Renamed" });
  // A category's default currency does not define the units of its multi-currency postings.
  await expect(databaseService.updateAccount(category.id, { currency: "CAD" })).resolves.toMatchObject({ currency: "CAD" });
});

it("protects checkpoint-only history including a zero balance", async () => {
  const account = await bank();
  await databaseService.prismaClient.checkpoint.create({ data: { accountId: account.id, date: "2026-01-02", balance: 0 } });
  await expect(databaseService.updateAccount(account.id, { currency: "CAD" })).rejects.toThrow(/currency.*history/i);
});

it.each([
  { quantity: 2, lots: null },
  { quantity: 0, lots: '[{"quantity":2,"amount":10}]' },
  { quantity: 0, lots: 'damaged legacy lots' },
])("protects retained legacy positions without journals: %j", async (properties) => {
  const portfolio = await investmentService.createInvestmentPortfolio("Legacy position");
  const holding = await investmentService.createSecurityAccount(portfolio.group.id, "ABC");
  await databaseService.prismaClient.investmentProperties.update({ where: { accountId: holding.id }, data: properties });
  await expect(databaseService.updateAccount(holding.id, { currency: "CAD" })).rejects.toThrow(/currency.*history/i);
});

it("protects dividend-only holding history without security journal lines or units", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Income only");
  const holding = await investmentService.createSecurityAccount(portfolio.group.id, "ABC");
  await investmentService.recordDividend({ portfolioId: portfolio.group.id, securityAccountId: holding.id, tickerSymbol: "ABC", amount: 5, date: "2026-01-02" });
  expect(await databaseService.prismaClient.journalLine.count({ where: { accountId: holding.id } })).toBe(0);
  await expect(databaseService.updateAccount(holding.id, { currency: "CAD" })).rejects.toThrow(/currency.*history/i);
});

it("keeps the known quote unit of an unused bound holding", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Unused listing");
  const holding = await investmentService.createMarketHolding({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", market: "NASDAQ", quoteCurrency: "USD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" });
  await expect(databaseService.updateAccount(holding.id, { currency: "CAD" })).rejects.toThrow(/quote.*currency/i);
  await databaseService.prismaClient.securityMetadata.update({ where: { ticker_market: { ticker: "ABC", market: "NASDAQ" } }, data: { quoteCurrency: null } });
  await expect(databaseService.updateAccount(holding.id, { currency: "CAD" })).rejects.toThrow(/quote.*currency/i);
});

it("allows unused account corrections but rejects malformed currency codes", async () => {
  const account = await bank();
  await expect(databaseService.updateAccount(account.id, { currency: "CAD" })).resolves.toMatchObject({ currency: "CAD" });
  for (const currency of ["", "usd", "US", " USD "]) {
    await expect(databaseService.updateAccount(account.id, { currency })).rejects.toThrow(/currency/i);
  }
});
