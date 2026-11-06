import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { resetTestDatabase } from "./database.test.utils";
import { getInvestmentSnapshot } from "./investmentActivity";

beforeEach(resetTestDatabase);
async function purchased() {
  const portfolio = await investmentService.createInvestmentPortfolio("Dated holdings");
  const buy = await investmentService.recordBuy({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2026-01-02" });
  const security = await investmentService.getSecurityAccount(portfolio.group.id, "ABC");
  return { ...portfolio, buy, security };
}
it("values the quantity and basis held before a later sale rather than current holdings", async () => {
  const { group, security } = await purchased();
  await investmentService.recordSell({ portfolioId: group.id, tickerSymbol: "ABC", quantity: 4, pricePerShare: 12, date: "2026-01-04" });
  expect(await investmentService.getPositionDetails(security.id, "2026-01-03")).toMatchObject({ quantity: 10, costBasis: 100 });
  expect(await investmentService.getPositionDetails(security.id, "2026-01-04")).toMatchObject({ quantity: 6, costBasis: 60 });
  expect(await investmentService.getPositionDetails(security.id, "2026-01-01")).toMatchObject({ quantity: 0, costBasis: 0 });
});
it("retains pre-split quantities and pre-distribution basis after later activity", async () => {
  const { group, security } = await purchased();
  await investmentService.recordDividend({ portfolioId: group.id, tickerSymbol: "ABC", amount: 10, isReturnOfCapital: true, date: "2026-01-03" });
  await investmentService.recordStockSplit(security.id, 2, "2026-01-04");
  expect(await investmentService.getPositionDetails(security.id, "2026-01-02")).toMatchObject({ quantity: 10, costBasis: 100 });
  expect(await investmentService.getPositionDetails(security.id, "2026-01-03")).toMatchObject({ quantity: 10, costBasis: 90 });
  expect(await investmentService.getPositionDetails(security.id, "2026-01-04")).toMatchObject({ quantity: 20, costBasis: 90 });
});
it("retains dated holdings after a position is fully sold", async () => {
  const { group, security } = await purchased();
  await investmentService.recordSell({ portfolioId: group.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 12, date: "2026-01-04" });
  expect(await investmentService.getPositionDetails(security.id, "2026-01-03")).toMatchObject({ quantity: 10, costBasis: 100 });
});
it("refuses generic journal deletion that would detach a posted investment quantity", async () => {
  const { buy, security } = await purchased();
  await expect(databaseService.deleteJournalEntry(buy.id)).rejects.toThrow(/investment.*correction/i);
  expect(await databaseService.getAccountBalance(security.id)).toBe(100);
});
it("refuses generic journal edits that would leave the investment activity unchanged", async () => {
  const { buy, security, tradeCashAccount } = await purchased();
  await expect(databaseService.updateJournalEntryLine({ lineId: buy.lines[0].id, fromAccountId: tradeCashAccount.id,
    toAccountId: security.id, amount: 200, date: "2026-01-03", description: "Changed" })).rejects.toThrow(/investment.*correction/i);
  expect(await databaseService.getAccountBalance(security.id)).toBe(100);
});
it("refuses an out-of-order posting until dated replay can recompute subsequent basis", async () => {
  const { group } = await purchased();
  await expect(investmentService.recordBuy({ portfolioId: group.id, tickerSymbol: "ABC", quantity: 1, pricePerShare: 20, date: "2026-01-01" })).rejects.toThrow(/backdated.*replay/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(1);
});
it("reports legacy history unavailable rather than inferring a timeline from current lots", async () => {
  const { security } = await purchased();
  await databaseService.prismaClient.investmentProperties.update({ where: { accountId: security.id }, data: { hasCompleteActivityHistory: false } });
  expect(await getInvestmentSnapshot(security.id, "2026-01-03")).toEqual({ status: "unavailable", reason: "legacy_history" });
  await expect(investmentService.getPositionDetails(security.id, "2026-01-03")).rejects.toThrow(/predates tracked/i);
});
it("refuses current and historical reads and further posting after an uncoordinated quantity change", async () => {
  const { group, security } = await purchased();
  await databaseService.prismaClient.investmentProperties.update({ where: { accountId: security.id }, data: { quantity: 99 } });
  expect(await getInvestmentSnapshot(security.id, "2026-01-03")).toEqual({ status: "unavailable", reason: "inconsistent_history" });
  await expect(investmentService.getPositionDetails(security.id)).rejects.toThrow(/history does not match/i);
  await expect(investmentService.recordBuy({ portfolioId: group.id, tickerSymbol: "ABC", quantity: 1, pricePerShare: 10, date: "2026-01-04" })).rejects.toThrow(/inconsistent/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(1);
});
it.each(["buy", "reinvestment", "split"])("rolls back money, position and links when the %s activity cannot be recorded", async (kind) => {
  const { group, security } = await purchased();
  await databaseService.prismaClient.$executeRawUnsafe("CREATE TRIGGER fail_activity BEFORE INSERT ON InvestmentActivity BEGIN SELECT RAISE(ABORT, 'synthetic activity failure'); END");
  try {
    await expect(kind === "buy" ? investmentService.recordBuy({ portfolioId: group.id, tickerSymbol: "ABC", quantity: 1, pricePerShare: 10, date: "2026-01-03" })
      : kind === "split" ? investmentService.recordStockSplit(security.id, 2, "2026-01-03")
      : investmentService.recordReinvestedDividend({ portfolioId: group.id, tickerSymbol: "ABC", dividendAmount: 10, reinvestmentPrice: 5, date: "2026-01-03", recordAsIncome: true })).rejects.toThrow();
    expect(await databaseService.prismaClient.journalEntry.count()).toBe(1);
    expect(await databaseService.prismaClient.investmentActivity.count()).toBe(1);
    expect(await databaseService.prismaClient.investmentActivityJournal.count()).toBe(1);
    expect((await investmentService.getSecurityAccount(group.id, "ABC")).investmentProperties).toEqual(security.investmentProperties);
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_activity"); }
});
it("records two reinvestment journals as one structured activity and ignores edited descriptions", async () => {
  const { group, security } = await purchased();
  const entry = await investmentService.recordReinvestedDividend({ portfolioId: group.id, tickerSymbol: "ABC", dividendAmount: 10, reinvestmentPrice: 5, date: "2026-01-03", recordAsIncome: true });
  const activity = await databaseService.prismaClient.investmentActivity.findFirstOrThrow({ where: { accountId: security.id, sequence: 2 }, include: { journalLinks: true } });
  expect(activity).toMatchObject({ kind: "income_reinvestment", units: 2, price: 5, quantityBefore: 10, quantityAfter: 12, basisBefore: 100, basisAfter: 110 });
  expect(activity.journalLinks).toHaveLength(2);
  await databaseService.prismaClient.journalEntry.update({ where: { id: entry.id }, data: { description: "No ticker or quantity here" } });
  expect(await getInvestmentSnapshot(security.id, "2026-01-03")).toMatchObject({ status: "available", quantity: 12, costBasis: 110 });
  for (const link of activity.journalLinks) await expect(databaseService.deleteJournalEntry(link.entryId)).rejects.toThrow(/investment.*correction/i);
});
it("refuses tampered journal dates or missing journal links rather than using current quantities", async () => {
  const { buy, security } = await purchased();
  await databaseService.prismaClient.journalEntry.update({ where: { id: buy.id }, data: { date: "2026-01-03" } });
  expect((await getInvestmentSnapshot(security.id, "2026-01-04")).status).toBe("unavailable");
  await databaseService.prismaClient.journalEntry.update({ where: { id: buy.id }, data: { date: "2026-01-02" } });
  await databaseService.prismaClient.investmentActivityJournal.deleteMany({});
  expect((await getInvestmentSnapshot(security.id, "2026-01-04")).status).toBe("unavailable");
});
it("protects legacy investment journals from ordinary deletion even without activity links", async () => {
  const { buy } = await purchased();
  await databaseService.prismaClient.investmentActivityJournal.deleteMany({});
  await databaseService.prismaClient.investmentActivity.deleteMany({});
  await expect(databaseService.deleteJournalEntry(buy.id)).rejects.toThrow(/investment.*correction/i);
});
it("imports reverse-ordered statement rows chronologically while preserving their original error row numbers", async () => {
  const { group } = await investmentService.createInvestmentPortfolio("Reverse statement");
  const result = await investmentService.importInvestmentTransactions(group.id,
    "Date,Type,Ticker,Quantity,Price,Amount\n2026-01-04,sell,ABC,4,12,48\n2026-01-03,sell,MISSING,1,10,10\n2026-01-02,buy,ABC,10,10,100",
    { date: "Date", type: "Type", ticker: "Ticker", quantity: "Quantity", price: "Price", amount: "Amount" });
  expect(result).toMatchObject({ imported: 2, skipped: 1, errors: [{ row: 3, error: expect.stringMatching(/MISSING/) }] });
  const security = await investmentService.getSecurityAccount(group.id, "ABC");
  expect(await getInvestmentSnapshot(security.id, "2026-01-03")).toMatchObject({ status: "available", quantity: 10, costBasis: 100 });
});
