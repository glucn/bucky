import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { resetTestDatabase } from "./database.test.utils";

beforeEach(resetTestDatabase);
const trade = { tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2026-01-02" };
const cashTotal = (entry: any, id: string) => entry.lines.filter((line: any) => line.accountId === id).reduce((sum: number, line: any) => sum + line.amount, 0);
const balanced = (entry: any) => expect(entry.lines.reduce((sum: number, line: any) => sum + line.amount, 0)).toBeCloseTo(0, 10);

it("capitalizes acquisition fees once in a balanced purchase and its lot", async () => {
  const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Fees");
  const entry = await investmentService.recordBuy({ ...trade, portfolioId: group.id, fee: 1 });
  balanced(entry);
  expect(cashTotal(entry, tradeCashAccount.id)).toBe(-101);
  const account = await investmentService.getSecurityAccount(group.id, "ABC");
  expect(cashTotal(entry, account.id)).toBe(101);
  expect(JSON.parse(account.investmentProperties.lots)[0].amount).toBe(101);
  const expense = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Investment Expenses" } });
  expect(entry.lines.some((line: any) => line.accountId === expense.id)).toBe(false);
});

it("deducts sale fees from proceeds once and realizes the net gain", async () => {
  const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Sale");
  await investmentService.recordBuy({ ...trade, portfolioId: group.id, fee: 1 });
  const entry = await investmentService.recordSell({ ...trade, portfolioId: group.id, quantity: 5, pricePerShare: 12, fee: 1, date: "2026-01-03" });
  balanced(entry);
  expect(cashTotal(entry, tradeCashAccount.id)).toBe(59);
  const account = await investmentService.getSecurityAccount(group.id, "ABC");
  expect(cashTotal(entry, account.id)).toBe(-50.5);
  const gain = await databaseService.prismaClient.account.findFirstOrThrow({ where: { name: "Realized Gains/Losses" } });
  expect(cashTotal(entry, gain.id)).toBe(-8.5);
  expect(JSON.parse(account.investmentProperties.lots)[0]).toMatchObject({ quantity: 5, amount: 50.5 });
});

it("posts a one-cent gain rather than leaving the sale unbalanced", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("Cent");
  await investmentService.recordBuy({ ...trade, portfolioId: group.id, quantity: 1 });
  const entry = await investmentService.recordSell({ ...trade, portfolioId: group.id, quantity: 1, pricePerShare: 10.01 });
  balanced(entry);
});

it.each(["buy", "sell"] as const)("rolls back %s journal lines if the position update fails", async (kind) => {
  const { group } = await investmentService.createInvestmentPortfolio("Rollback");
  await investmentService.recordBuy({ ...trade, portfolioId: group.id });
  const before = await investmentService.getSecurityAccount(group.id, "ABC");
  const count = await databaseService.prismaClient.journalEntry.count();
  await databaseService.prismaClient.$executeRawUnsafe("CREATE TRIGGER fail_position BEFORE UPDATE ON InvestmentProperties BEGIN SELECT RAISE(ABORT, 'synthetic position failure'); END");
  try {
    await expect((kind === "buy" ? investmentService.recordBuy.bind(investmentService) : investmentService.recordSell.bind(investmentService))({ ...trade, portfolioId: group.id, quantity: 1 })).rejects.toThrow();
    expect(await databaseService.prismaClient.journalEntry.count()).toBe(count);
    expect((await investmentService.getSecurityAccount(group.id, "ABC")).investmentProperties).toEqual(before.investmentProperties);
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_position"); }
});

it("rolls back implicit security creation when posting fails", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("New holding");
  const count = await databaseService.prismaClient.account.count();
  await databaseService.prismaClient.$executeRawUnsafe("CREATE TRIGGER fail_trade BEFORE INSERT ON JournalEntry BEGIN SELECT RAISE(ABORT, 'synthetic posting failure'); END");
  try {
    await expect(investmentService.recordBuy({ ...trade, portfolioId: group.id })).rejects.toThrow();
    expect(await databaseService.prismaClient.account.count()).toBe(count);
    expect(await databaseService.prismaClient.investmentProperties.count()).toBe(0);
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_trade"); }
});

it("uses matching-currency cash instead of the first cash account", async () => {
  const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Currencies");
  const euro = await investmentService.addTradeCashAccount(group.id, "EUR");
  const holding = await investmentService.createSecurityAccount(group.id, "ABC");
  await databaseService.prismaClient.account.update({ where: { id: holding.id }, data: { currency: "EUR" } });
  const entry = await investmentService.recordBuy({ ...trade, portfolioId: group.id });
  expect(entry.lines.every((line: any) => line.currency === "EUR")).toBe(true);
  expect(cashTotal(entry, euro.id)).toBe(-100);
  expect(cashTotal(entry, tradeCashAccount.id)).toBe(0);
});

it("refuses to guess currency when creating a holding in a multi-currency portfolio", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("Ambiguous cash");
  await investmentService.addTradeCashAccount(group.id, "EUR");
  await expect(investmentService.recordBuy({ ...trade, portfolioId: group.id })).rejects.toThrow(/select.*cash/i);
  expect(await databaseService.prismaClient.investmentProperties.count()).toBe(0);
});

it.each([
  { quantity: NaN }, { quantity: Infinity }, { pricePerShare: NaN }, { pricePerShare: Infinity },
  { fee: NaN }, { fee: Infinity }, { date: "2026-02-30" }, { quantity: Number.MAX_VALUE },
])("rejects invalid trade input before creating accounts: %j", async (invalid) => {
  const { group } = await investmentService.createInvestmentPortfolio("Invalid");
  await expect(investmentService.recordBuy({ ...trade, ...invalid, portfolioId: group.id })).rejects.toThrow();
  expect(await databaseService.prismaClient.investmentProperties.count()).toBe(0);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});

it("conserves a one-cent FIFO lot through successive partial sales", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("Rounding");
  await investmentService.recordBuy({ ...trade, portfolioId: group.id, quantity: 3, pricePerShare: 0.003 });
  const account = await investmentService.getSecurityAccount(group.id, "ABC");
  for (let i = 0; i < 3; i++) {
    const entry = await investmentService.recordSell({ ...trade, portfolioId: group.id, quantity: 1, pricePerShare: 1 });
    balanced(entry);
  }
  expect(await databaseService.getAccountBalance(account.id)).toBe(0);
  expect((await investmentService.getSecurityAccount(group.id, "ABC")).investmentProperties.quantity).toBe(0);
});

it("creates a new security in explicitly selected cash currency and normalizes its date", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("Explicit cash");
  const cash = await investmentService.addTradeCashAccount(group.id, "CAD");
  const entry = await investmentService.recordBuy({ ...trade, portfolioId: group.id, tradeCashAccountId: cash.id, date: "1/2/2026" });
  expect(entry.date).toBe("2026-01-02");
  const security = await investmentService.getSecurityAccount(group.id, "ABC");
  expect(security.currency).toBe("CAD");
  expect(JSON.parse(security.investmentProperties.lots)[0].date).toBe("2026-01-02");
  balanced(entry);
});

it("refuses ambiguous tickers and trades only the explicitly selected holding", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("Two listings");
  const first = await investmentService.createSecurityAccount(group.id, "ABC");
  const second = await databaseService.prismaClient.account.create({ data: {
    name: "ABC other exchange", groupId: group.id, type: "user", currency: "USD",
    investmentProperties: { create: { tickerSymbol: "ABC", market: "NYSE", quantity: 0, costBasisMethod: "FIFO", lots: "[]" } },
  } });
  await expect(investmentService.recordBuy({ ...trade, portfolioId: group.id })).rejects.toThrow(/select.*security/i);
  await investmentService.recordBuy({ ...trade, portfolioId: group.id, securityAccountId: second.id });
  expect((await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: first.id } })).quantity).toBe(0);
  expect((await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: second.id } })).quantity).toBe(10);
});

it("rejects a cash selection outside the portfolio without creating a holding", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("Owned");
  const other = await investmentService.createInvestmentPortfolio("Other");
  await expect(investmentService.recordBuy({ ...trade, portfolioId: group.id, tradeCashAccountId: other.tradeCashAccount.id })).rejects.toThrow();
  expect(await databaseService.prismaClient.investmentProperties.count()).toBe(0);
});

it.each(["FIFO", "AVERAGE_COST"] as const)("fully releases zero basis positions with %s", async (method) => {
  const { group } = await investmentService.createInvestmentPortfolio("Zero basis");
  const security = await investmentService.createSecurityAccount(group.id, "ABC", "stock", method);
  await investmentService.recordBuy({ ...trade, portfolioId: group.id, pricePerShare: 0 });
  const entry = await investmentService.recordSell({ ...trade, portfolioId: group.id, pricePerShare: 1 });
  balanced(entry);
  expect(await databaseService.getAccountBalance(security.id)).toBe(0);
});

it("never loses an acknowledged concurrent buy or partially commits a rejected save", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("Concurrent");
  const security = await investmentService.createSecurityAccount(group.id, "ABC");
  const results = await Promise.allSettled([1, 2].map((quantity) => investmentService.recordBuy({ ...trade, portfolioId: group.id, quantity })));
  const acknowledged = results.flatMap((result, index) => result.status === "fulfilled" ? [index + 1] : []);
  expect(acknowledged.length).toBeGreaterThan(0);
  const props = await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: security.id } });
  expect(props.quantity).toBe(acknowledged.reduce((sum, quantity) => sum + quantity, 0));
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(acknowledged.length);
});
