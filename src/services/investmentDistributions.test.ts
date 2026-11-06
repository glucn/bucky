import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { resetTestDatabase } from "./database.test.utils";

beforeEach(resetTestDatabase);
const dividend = { tickerSymbol: "ABC", dividendAmount: 10, reinvestmentPrice: 5, date: "2026-01-03", recordAsIncome: true };
async function position() {
  const portfolio = await investmentService.createInvestmentPortfolio("Distributions");
  await investmentService.recordBuy({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2026-01-02" });
  const security = await investmentService.getSecurityAccount(portfolio.group.id, "ABC");
  return { ...portfolio, security };
}
it.each(["second-entry", "position-update"])("rolls back both reinvestment journals on %s failure", async (failure) => {
  const { group, security } = await position(), count = await databaseService.prismaClient.journalEntry.count();
  await databaseService.prismaClient.$executeRawUnsafe(failure === "second-entry"
    ? "CREATE TRIGGER fail_distribution BEFORE INSERT ON JournalEntry WHEN NEW.type = 'dividend_reinvest' BEGIN SELECT RAISE(ABORT, 'synthetic purchase failure'); END"
    : "CREATE TRIGGER fail_distribution BEFORE UPDATE ON InvestmentProperties BEGIN SELECT RAISE(ABORT, 'synthetic position failure'); END");
  try {
    await expect(investmentService.recordReinvestedDividend({ ...dividend, portfolioId: group.id })).rejects.toThrow();
    expect(await databaseService.prismaClient.journalEntry.count()).toBe(count);
    expect((await investmentService.getSecurityAccount(group.id, "ABC")).investmentProperties).toEqual(security.investmentProperties);
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_distribution"); }
});
it("rolls back a newly created reinvestment holding when income posting fails", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("New");
  const count = await databaseService.prismaClient.account.count();
  await databaseService.prismaClient.$executeRawUnsafe("CREATE TRIGGER fail_distribution BEFORE INSERT ON JournalEntry BEGIN SELECT RAISE(ABORT, 'synthetic income failure'); END");
  try {
    await expect(investmentService.recordReinvestedDividend({ ...dividend, portfolioId: group.id })).rejects.toThrow();
    expect(await databaseService.prismaClient.account.count()).toBe(count);
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_distribution"); }
});
it("rolls back split quantities and lots when its journal record fails", async () => {
  const { group, security } = await position();
  await databaseService.prismaClient.$executeRawUnsafe("CREATE TRIGGER fail_distribution BEFORE INSERT ON JournalEntry WHEN NEW.type = 'stock_split' BEGIN SELECT RAISE(ABORT, 'synthetic split failure'); END");
  try {
    await expect(investmentService.recordStockSplit(security.id, 2, "2026-01-03")).rejects.toThrow();
    expect((await investmentService.getSecurityAccount(group.id, "ABC")).investmentProperties).toEqual(security.investmentProperties);
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_distribution"); }
});
it("reduces FIFO lot basis for cash return of capital before a later sale", async () => {
  const { group, security } = await position();
  await investmentService.recordDividend({ portfolioId: group.id, tickerSymbol: "ABC", amount: 10, date: "2026-01-03", isReturnOfCapital: true });
  expect(JSON.parse((await investmentService.getSecurityAccount(group.id, "ABC")).investmentProperties.lots)[0].amount).toBe(90);
  await investmentService.recordSell({ portfolioId: group.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 12, date: "2026-01-04" });
  expect(await databaseService.getAccountBalance(security.id)).toBe(0);
});
it("reinvests returned capital without inventing equity, income or additional total basis", async () => {
  const { group, security, tradeCashAccount } = await position();
  await investmentService.recordReinvestedDividend({ ...dividend, portfolioId: group.id, recordAsIncome: false });
  const updated = await investmentService.getSecurityAccount(group.id, "ABC");
  expect(updated.investmentProperties.quantity).toBe(12);
  expect(JSON.parse(updated.investmentProperties.lots).map((lot: any) => lot.amount)).toEqual([90, 10]);
  expect(await databaseService.getAccountBalance(security.id)).toBe(100);
  expect(await databaseService.getAccountBalance(tradeCashAccount.id)).toBe(-100);
  const equity = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Opening Balances" } });
  expect(await databaseService.getAccountBalance(equity.id)).toBe(0);
});
it.each([false, true])("refuses return of capital exceeding basis (reinvest=%s) without changing the book", async (reinvest) => {
  const { group, security } = await position();
  const operation = reinvest
    ? investmentService.recordReinvestedDividend({ ...dividend, portfolioId: group.id, dividendAmount: 101, recordAsIncome: false })
    : investmentService.recordDividend({ portfolioId: group.id, tickerSymbol: "ABC", amount: 101, date: dividend.date, isReturnOfCapital: true });
  await expect(operation).rejects.toThrow(/basis/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(1);
  expect((await investmentService.getSecurityAccount(group.id, "ABC")).investmentProperties).toEqual(security.investmentProperties);
});
it.each([false, true])("uses the holding currency for cash dividends (returnOfCapital=%s)", async (isReturnOfCapital) => {
  const { group, security, tradeCashAccount } = await position();
  const euro = await investmentService.addTradeCashAccount(group.id, "EUR");
  await databaseService.prismaClient.account.update({ where: { id: security.id }, data: { currency: "EUR" } });
  const entry = await investmentService.recordDividend({ portfolioId: group.id, tickerSymbol: "ABC", amount: 10, date: dividend.date, isReturnOfCapital });
  expect(entry.lines.every((line: any) => line.currency === "EUR")).toBe(true);
  expect(entry.lines.find((line: any) => line.accountId === euro.id)?.amount).toBe(10);
  expect(entry.lines.some((line: any) => line.accountId === tradeCashAccount.id)).toBe(false);
});
it("creates reinvestment holdings in the selected portfolio currency", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("CAD", "CAD");
  const entry = await investmentService.recordReinvestedDividend({ ...dividend, portfolioId: group.id });
  expect(entry.lines.every((line: any) => line.currency === "CAD")).toBe(true);
  expect((await investmentService.getSecurityAccount(group.id, "ABC")).currency).toBe("CAD");
});
it.each([{ dividendAmount: NaN }, { dividendAmount: Infinity }, { reinvestmentPrice: NaN }, { reinvestmentPrice: Infinity }, { date: "2026-02-30" }])("rejects invalid reinvestment before writing: %j", async (invalid) => {
  const { group } = await investmentService.createInvestmentPortfolio("Invalid");
  await expect(investmentService.recordReinvestedDividend({ ...dividend, ...invalid, portfolioId: group.id })).rejects.toThrow();
  expect(await databaseService.prismaClient.investmentProperties.count()).toBe(0);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});
it.each([NaN, Infinity, Number.MIN_VALUE])("rejects non-finite or overflowing split ratio %s before changing holdings", async (ratio) => {
  const { group, security } = await position();
  await expect(investmentService.recordStockSplit(security.id, ratio, dividend.date)).rejects.toThrow();
  expect((await investmentService.getSecurityAccount(group.id, "ABC")).investmentProperties).toEqual(security.investmentProperties);
});
it("allocates a distribution across all held shares, independent of each lot's purchase price", async () => {
  const { group } = await position();
  await investmentService.recordBuy({ portfolioId: group.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 20, date: dividend.date });
  await investmentService.recordDividend({ portfolioId: group.id, tickerSymbol: "ABC", amount: 20, date: "2026-01-04", isReturnOfCapital: true });
  const lots = JSON.parse((await investmentService.getSecurityAccount(group.id, "ABC")).investmentProperties.lots);
  expect(lots.map((lot: any) => lot.amount)).toEqual([90, 190]);
});
it("refuses a per-share distribution that exceeds one lot's basis even if other lots have enough basis", async () => {
  const { group } = await position();
  await investmentService.recordBuy({ portfolioId: group.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 0, date: dividend.date });
  await expect(investmentService.recordDividend({ portfolioId: group.id, tickerSymbol: "ABC", amount: 10, date: "2026-01-04", isReturnOfCapital: true })).rejects.toThrow(/lot.*basis/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(2);
});
it.each([false, true])("rolls back return-of-capital basis when final posting fails (reinvest=%s)", async (reinvest) => {
  const { group, security } = await position();
  await databaseService.prismaClient.$executeRawUnsafe(reinvest
    ? "CREATE TRIGGER fail_distribution BEFORE UPDATE ON InvestmentProperties BEGIN SELECT RAISE(ABORT, 'synthetic reinvestment failure'); END"
    : "CREATE TRIGGER fail_distribution BEFORE INSERT ON JournalEntry WHEN NEW.type = 'dividend_cash' BEGIN SELECT RAISE(ABORT, 'synthetic distribution failure'); END");
  try {
    await expect(reinvest ? investmentService.recordReinvestedDividend({ ...dividend, portfolioId: group.id, recordAsIncome: false })
      : investmentService.recordDividend({ portfolioId: group.id, tickerSymbol: "ABC", amount: 10, date: dividend.date, isReturnOfCapital: true })).rejects.toThrow();
    expect(await databaseService.prismaClient.journalEntry.count()).toBe(1);
    expect((await investmentService.getSecurityAccount(group.id, "ABC")).investmentProperties).toEqual(security.investmentProperties);
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_distribution"); }
});
it("conserves a one-cent reduction across fractional lots with deterministic remainders", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("Fractional");
  for (let i = 0; i < 3; i++) await investmentService.recordBuy({ portfolioId: group.id, tickerSymbol: "ABC", quantity: 0.1, pricePerShare: 10, date: `2026-01-0${i + 1}` });
  await investmentService.recordDividend({ portfolioId: group.id, tickerSymbol: "ABC", amount: 0.01, date: "2026-01-04", isReturnOfCapital: true });
  const account = await investmentService.getSecurityAccount(group.id, "ABC");
  expect(JSON.parse(account.investmentProperties.lots).map((lot: any) => lot.amount)).toEqual([0.99, 1, 1]);
  expect(await databaseService.getAccountBalance(account.id)).toBe(2.99);
});
it("keeps average-cost return of capital and subsequent disposal consistent", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("Average");
  const account = await investmentService.createSecurityAccount(group.id, "ABC", "stock", "AVERAGE_COST");
  await investmentService.recordBuy({ portfolioId: group.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2026-01-02" });
  await investmentService.recordReinvestedDividend({ ...dividend, portfolioId: group.id, recordAsIncome: false });
  await investmentService.recordSell({ portfolioId: group.id, tickerSymbol: "ABC", quantity: 12, pricePerShare: 12, date: "2026-01-04" });
  expect(await databaseService.getAccountBalance(account.id)).toBe(0);
});
it("normalizes reverse-split dates and preserves all journal amounts and lot cost", async () => {
  const { group, security } = await position();
  const lines = await databaseService.prismaClient.journalLine.findMany({ orderBy: { id: "asc" } });
  const entry = await investmentService.recordStockSplit(security.id, 0.5, "1/3/2026");
  expect(entry).toMatchObject({ date: "2026-01-03", lines: [] });
  const updated = await investmentService.getSecurityAccount(group.id, "ABC");
  expect(updated.investmentProperties.quantity).toBe(5);
  expect(JSON.parse(updated.investmentProperties.lots)[0]).toMatchObject({ quantity: 5, pricePerShare: 20, amount: 100 });
  expect(await databaseService.prismaClient.journalLine.findMany({ orderBy: { id: "asc" } })).toEqual(lines);
});
it.each([{ amount: NaN }, { amount: Infinity }, { date: "2026-02-30" }])("refuses invalid cash distribution %j before posting", async (invalid) => {
  const { group } = await investmentService.createInvestmentPortfolio("Invalid cash");
  await expect(investmentService.recordDividend({ portfolioId: group.id, tickerSymbol: "ABC", amount: 10, date: dividend.date, ...invalid })).rejects.toThrow();
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});
