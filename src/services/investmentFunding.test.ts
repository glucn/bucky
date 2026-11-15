import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { resetTestDatabase } from "./database.test.utils";
import { AccountType } from "../shared/accountTypes";

beforeEach(resetTestDatabase);
async function book(currency = "CAD") {
  const portfolio = await investmentService.createInvestmentPortfolio("Funding", currency);
  const bank = await databaseService.createAccount({ name: "Checking", type: AccountType.User, currency });
  return { ...portfolio, bank };
}
const deposit = (...args: any[]) => (investmentService.depositCash as any)(...args);
const withdraw = (...args: any[]) => (investmentService.withdrawCash as any)(...args);

it("uses the explicit settlement ID and refuses an ambiguous omitted selection", async () => {
  const { group, tradeCashAccount } = await book();
  const usd = await investmentService.addTradeCashAccount(group.id, "USD");
  const bank = await databaseService.createAccount({ name: "USD checking", type: AccountType.User, currency: "USD" });
  await expect(deposit(group.id, 10, bank.id, "2026-01-01")).rejects.toThrow(/select|explicit/i);
  await deposit(group.id, 10, bank.id, "2026-01-01", "USD funding", { tradeCashAccountId: usd.id });
  expect(await databaseService.getAccountBalance(usd.id)).toBe(10);
  expect(await databaseService.getAccountBalance(tradeCashAccount.id)).toBe(0);
});

it("retains both native amounts and directional FX on deposits and withdrawals", async () => {
  const { group, tradeCashAccount } = await book();
  const bank = await databaseService.createAccount({ name: "USD bank", type: AccountType.User, currency: "USD" });
  const incoming = await deposit(group.id, 140, bank.id, "2026-01-01", "FX funding", { tradeCashAccountId: tradeCashAccount.id, counterAmount: 100 });
  expect(incoming.type).toBe("investment_cash_deposit");
  expect(incoming.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ accountId: bank.id, amount: -100, currency: "USD", exchangeRate: 1.4 }),
    expect.objectContaining({ accountId: tradeCashAccount.id, amount: 140, currency: "CAD", exchangeRate: 1.4 }),
  ]));
  const outgoing = await withdraw(group.id, 70, bank.id, "2026-01-02", "FX withdrawal", { tradeCashAccountId: tradeCashAccount.id, counterAmount: 50 });
  expect(outgoing.type).toBe("investment_cash_withdrawal");
  expect(outgoing.lines.find((line: any) => line.accountId === bank.id)).toMatchObject({ amount: 50, currency: "USD" });
  expect(outgoing.lines[0].exchangeRate).toBeCloseTo(50 / 70);
  expect(await databaseService.getAccountBalance(tradeCashAccount.id)).toBe(70);
  expect(await databaseService.getAccountBalance(bank.id)).toBe(-50);
  expect(await databaseService.prismaClient.fxDailyRate.count()).toBe(0);
});

it("rolls back both journals and opening adjustments when final funding tagging fails", async () => {
  const { group, bank, tradeCashAccount } = await book();
  for (const accountId of [bank.id, tradeCashAccount.id]) await databaseService.setOpeningBalance({ accountId, displayAmount: 100, asOfDate: "2026-01-03" });
  const entries = await databaseService.prismaClient.journalEntry.findMany(), lines = await databaseService.prismaClient.journalLine.findMany();
  await databaseService.prismaClient.$executeRawUnsafe("CREATE TRIGGER fail_funding_tag BEFORE UPDATE ON JournalEntry WHEN NEW.type='investment_cash_deposit' BEGIN SELECT RAISE(ABORT, 'synthetic tag failure'); END");
  try {
    await expect(deposit(group.id, 10, bank.id, "2026-01-01")).rejects.toThrow();
    expect(await databaseService.prismaClient.journalEntry.findMany()).toEqual(entries);
    expect(await databaseService.prismaClient.journalLine.findMany()).toEqual(lines);
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_funding_tag"); }
});

it("lists only active external nonsecurity user accounts for funding", async () => {
  const { group, bank, tradeCashAccount } = await book();
  const other = await investmentService.createInvestmentPortfolio("Other", "CAD"), holding = await investmentService.createSecurityAccount(other.group.id, "ABC");
  const archived = await databaseService.createAccount({ name: "Archived bank", type: AccountType.User, currency: "CAD" });
  await databaseService.prismaClient.account.update({ where: { id: archived.id }, data: { isArchived: true } });
  const ids = (await investmentService.getPortfolioFundingAccounts(group.id)).map((account) => account.id);
  expect(ids).toContain(bank.id); expect(ids).toContain(other.tradeCashAccount.id);
  for (const id of [tradeCashAccount.id, holding.id, archived.id]) expect(ids).not.toContain(id);
});

it("requires both FX amounts and refuses an inconsistent supplied rate", async () => {
  const { group } = await book(), bank = await databaseService.createAccount({ name: "USD bank", type: AccountType.User, currency: "USD" });
  await expect(deposit(group.id, 140, bank.id, "2026-01-01")).rejects.toThrow(/other account.*currency|actual amount/i);
  await expect(deposit(group.id, 140, bank.id, "2026-01-01", "FX", { counterAmount: 100, exchangeRate: 2 })).rejects.toThrow(/inconsistent/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
  expect(await databaseService.prismaClient.fxDailyRate.count()).toBe(0);
});

it("checks concurrent withdrawals and their writes in the same transaction", async () => {
  const { group, bank, tradeCashAccount } = await book();
  await databaseService.setOpeningBalance({ accountId: tradeCashAccount.id, displayAmount: 100, asOfDate: "2026-01-01" });
  const results = await Promise.allSettled([1, 2].map(() => withdraw(group.id, 80, bank.id, "2026-01-02")));
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(await databaseService.getAccountBalance(tradeCashAccount.id)).toBe(20);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(2);
});

it("accepts an agreeing checkpoint while refusing inactive or foreign settlement IDs", async () => {
  const { group, bank, tradeCashAccount } = await book(), other = await investmentService.createInvestmentPortfolio("Other", "CAD");
  await databaseService.setOpeningBalance({ accountId: tradeCashAccount.id, displayAmount: 100, asOfDate: "2026-01-01" });
  await databaseService.prismaClient.checkpoint.create({ data: { accountId: tradeCashAccount.id, date: "2026-01-02", balance: 100 } });
  await withdraw(group.id, 20, bank.id, "2026-01-03");
  await expect(deposit(group.id, 10, bank.id, "2026-01-04", "Wrong cash", { tradeCashAccountId: other.tradeCashAccount.id })).rejects.toThrow(/active|cash/i);
  await databaseService.prismaClient.account.update({ where: { id: tradeCashAccount.id }, data: { isArchived: true } });
  await expect(deposit(group.id, 10, bank.id, "2026-01-04", "Archived", { tradeCashAccountId: tradeCashAccount.id })).rejects.toThrow(/active|cash/i);
  expect(await databaseService.getAccountBalance(tradeCashAccount.id)).toBe(80);
});

it.each(["cash", "counter"])("refuses a stale %s currency snapshot instead of reinterpreting the supplied amounts", async (side) => {
  const { group, tradeCashAccount } = await book();
  const bank = await databaseService.createAccount({ name: "USD bank", type: AccountType.User, currency: "USD" });
  await databaseService.updateAccount(side === "cash" ? tradeCashAccount.id : bank.id, { currency: side === "cash" ? "USD" : "CAD" });
  await expect(deposit(group.id, 100, bank.id, "2026-01-01", "Stale units", {
    tradeCashAccountId: tradeCashAccount.id, counterAmount: 100, expectedCashCurrency: "CAD", expectedCounterCurrency: "USD",
  })).rejects.toThrow(/currency.*changed|currencies.*changed/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});

it("checks outgoing portfolio cash even when a transfer is entered as the other portfolio's deposit", async () => {
  const { group, tradeCashAccount } = await book(), source = await investmentService.createInvestmentPortfolio("Source portfolio", "CAD");
  await databaseService.setOpeningBalance({ accountId: source.tradeCashAccount.id, displayAmount: 20, asOfDate: "2026-01-01" });
  await expect(deposit(group.id, 30, source.tradeCashAccount.id, "2026-01-02")).rejects.toThrow(/insufficient/i);
  expect(await databaseService.getAccountBalance(tradeCashAccount.id)).toBe(0);
  await deposit(group.id, 10, source.tradeCashAccount.id, "2026-01-02");
  await withdraw(source.group.id, 10, tradeCashAccount.id, "2026-01-02");
  expect(await databaseService.getAccountBalance(source.tradeCashAccount.id)).toBe(0);
  expect(await databaseService.getAccountBalance(tradeCashAccount.id)).toBe(20);
});

it("does not use later funding to authorize an earlier withdrawal", async () => {
  const { group, bank, tradeCashAccount } = await book();
  await databaseService.setOpeningBalance({ accountId: tradeCashAccount.id, displayAmount: 100, asOfDate: "2026-01-03" });
  const before = await databaseService.prismaClient.journalLine.findMany();
  await expect(withdraw(group.id, 50, bank.id, "2026-01-02")).rejects.toThrow(/insufficient/i);
  expect(await databaseService.prismaClient.journalLine.findMany()).toEqual(before);
});

it("requires reconciliation when a checkpoint invents spendable cash beyond the journal", async () => {
  const { group, bank, tradeCashAccount } = await book();
  await databaseService.setOpeningBalance({ accountId: tradeCashAccount.id, displayAmount: 100, asOfDate: "2026-01-01" });
  await databaseService.prismaClient.checkpoint.create({ data: { accountId: tradeCashAccount.id, date: "2026-01-02", balance: 500 } });
  await expect(withdraw(group.id, 200, bank.id, "2026-01-03")).rejects.toThrow(/reconcil|journal|review/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(1);
});

it("retains cents in dated cash valuation and withdrawal checks after large offsetting entries", async () => {
  const { group, bank, tradeCashAccount } = await book("USD");
  const date = "2026-02-01";
  await databaseService.prismaClient.appSetting.upsert({ where: { key: "baseCurrency" },
    create: { key: "baseCurrency", jsonValue: '"USD"' }, update: { jsonValue: '"USD"' } });
  for (const amount of [80_000_000_000_000.06, -80_000_000_000_000.05]) {
    await databaseService.prismaClient.journalEntry.create({ data: { date, lines: { create: [
      { accountId: tradeCashAccount.id, amount, currency: "USD" },
      { accountId: bank.id, amount: -amount, currency: "USD" },
    ] } } });
  }
  expect((await investmentService.getPortfolioPerformance(group.id, date, date)).currentValue).toBe(0.01);
  await withdraw(group.id, 0.01, bank.id, date);
  expect(await databaseService.getAccountBalanceAtDate(tradeCashAccount.id, date)).toBe(0);
});

it("rejects security counterparties rather than changing basis without activity", async () => {
  const { group } = await book(), other = await investmentService.createInvestmentPortfolio("Other", "CAD");
  const holding = await investmentService.createSecurityAccount(other.group.id, "ABC");
  await expect(deposit(group.id, 10, holding.id, "2026-01-01")).rejects.toThrow(/security|cash|holding/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});

it("does not accept different amounts for two accounts with the same currency", async () => {
  const { group, bank } = await book();
  await expect(deposit(group.id, 10, bank.id, "2026-01-01", "Bad amounts", { counterAmount: 20 })).rejects.toThrow(/same currency|equal|amount/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});

it.each([NaN, Infinity, -1, 0, 0.001])("rejects invalid funding amount %s without a journal", async (amount) => {
  const { group, bank } = await book();
  await expect(deposit(group.id, amount, bank.id, "2026-01-01")).rejects.toThrow();
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});
