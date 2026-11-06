import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { resetTestDatabase } from "./database.test.utils";
import { previewInvestmentImport } from "./investmentImport";

beforeEach(resetTestDatabase);
const header = "Date,Type,Ticker,Quantity,Price,Amount,Fee,Description,Id";
const mapping = { date: "Date", type: "Type", ticker: "Ticker", quantity: "Quantity", price: "Price", amount: "Amount", fee: "Fee", description: "Description" };
const buy = "2026-01-02,buy,ABC,10,10,100,1,Original purchase,buy-1";
const csv = (...rows: string[]) => [header, ...rows].join("\n");
async function portfolio() { return (await investmentService.createInvestmentPortfolio("Imported")).group.id; }
it("reimports a trade without posting it again after descriptions change", async () => {
  const id = await portfolio();
  expect(await investmentService.importInvestmentTransactions(id, csv(buy), mapping)).toMatchObject({ imported: 1, skipped: 0 });
  await databaseService.prismaClient.journalEntry.updateMany({ data: { description: "Corrected display description" } });
  expect(await investmentService.importInvestmentTransactions(id, csv(buy.replace("Original purchase", "Broker changed wording")), mapping)).toMatchObject({ imported: 0, skipped: 1, errors: [] });
  expect((await investmentService.getSecurityAccount(id, "ABC")).investmentProperties.quantity).toBe(10);
});
it("imports only new rows from an overlapping statement before checking posting order", async () => {
  const id = await portfolio(), sell = "2026-01-04,sell,ABC,4,12,48,0,Sale,sell-1";
  await investmentService.importInvestmentTransactions(id, csv(buy, sell), mapping);
  const result = await investmentService.importInvestmentTransactions(id, csv(sell, "2026-01-05,buy,ABC,1,11,11,0,New,new-1"), mapping);
  expect(result).toMatchObject({ imported: 1, skipped: 1, errors: [] });
  expect((await investmentService.getSecurityAccount(id, "ABC")).investmentProperties.quantity).toBe(7);
});
it("does not confuse equal-sized buys and sells or different commission amounts", async () => {
  const id = await portfolio();
  const result = await investmentService.importInvestmentTransactions(id, csv(buy, buy.replace(",1,Original", ",2,Original"), "2026-01-02,sell,ABC,10,10,100,0,Sale,sale-1"), mapping);
  expect(result).toMatchObject({ imported: 3, skipped: 0, errors: [] });
  expect((await investmentService.getSecurityAccount(id, "ABC")).investmentProperties.quantity).toBe(10);
});
it("keeps identical trades with distinct broker IDs and skips their later reimport", async () => {
  const id = await portfolio(), withIds = { ...mapping, sourceId: "Id" };
  const data = csv(buy, buy.replace("buy-1", "buy-2"));
  expect(await investmentService.importInvestmentTransactions(id, data, withIds)).toMatchObject({ imported: 2, skipped: 0, errors: [] });
  expect(await investmentService.importInvestmentTransactions(id, data, withIds)).toMatchObject({ imported: 0, skipped: 2, errors: [] });
  expect((await investmentService.getSecurityAccount(id, "ABC")).investmentProperties.quantity).toBe(20);
});
it("reports changed financial data under an existing broker ID rather than replacing or duplicating it", async () => {
  const id = await portfolio(), withIds = { ...mapping, sourceId: "Id" };
  await investmentService.importInvestmentTransactions(id, csv(buy), withIds);
  const result = await investmentService.importInvestmentTransactions(id, csv(buy.replace(",10,10,100,", ",5,10,50,")), withIds);
  expect(result.imported).toBe(0); expect(result.errors[0]?.error).toMatch(/identifier.*different|conflict/i);
  expect((await investmentService.getSecurityAccount(id, "ABC")).investmentProperties.quantity).toBe(10);
});
it.each(["12garbage", "Infinity", "NaN", "0x10"])("rejects malformed numbers %s before any posting", async (value) => {
  const id = await portfolio();
  const result = await investmentService.importInvestmentTransactions(id, csv(buy.replace(",10,10,100,", `,${value},10,100,`)), mapping);
  expect(result.imported).toBe(0); expect(result.errors.length).toBeGreaterThan(0);
  expect(await databaseService.prismaClient.investmentProperties.count()).toBe(0);
});
it("rejects invalid calendar dates and mismatched gross consideration", async () => {
  for (const row of [buy.replace("2026-01-02", "2026-02-30"), buy.replace(",100,1,", ",999,1,")]) {
    const result = await investmentService.importInvestmentTransactions(await portfolio(), csv(row), mapping);
    expect(result.imported).toBe(0); expect(result.errors.length).toBeGreaterThan(0);
    await resetTestDatabase();
  }
});
it("parses quoted multiline descriptions as one record without using them as identity", async () => {
  const id = await portfolio(), data = csv('2026-01-02,buy,ABC,10,10,100,1,"Trade, with a\nsecond line and ""quotes""",id-1');
  expect(await investmentService.importInvestmentTransactions(id, data, mapping)).toMatchObject({ imported: 1, skipped: 0, errors: [] });
});
it("rolls back the journal, activity, holding and origin when provenance persistence fails", async () => {
  const id = await portfolio();
  await databaseService.prismaClient.$executeRawUnsafe("CREATE TRIGGER fail_import_origin BEFORE INSERT ON InvestmentImportOrigin BEGIN SELECT RAISE(ABORT, 'synthetic origin failure'); END");
  try {
    expect(await investmentService.importInvestmentTransactions(id, csv(buy), mapping)).toMatchObject({ imported: 0, skipped: 1 });
    expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
    expect(await databaseService.prismaClient.investmentActivity.count()).toBe(0);
    expect(await databaseService.prismaClient.investmentProperties.count()).toBe(0);
    expect(await databaseService.prismaClient.investmentImportOrigin.count()).toBe(0);
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_import_origin"); }
  expect(await investmentService.importInvestmentTransactions(id, csv(buy), mapping)).toMatchObject({ imported: 1, skipped: 0, errors: [] });
});
it("requires review of matching manual activity rather than silently assigning it an origin", async () => {
  const id = await portfolio();
  await investmentService.recordBuy({ portfolioId: id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, fee: 1, date: "2026-01-02" });
  expect((await previewInvestmentImport(id, csv(buy), mapping)).preview[0].status).toBe("review");
  const refused = await investmentService.importInvestmentTransactions(id, csv(buy), mapping);
  expect(refused.imported).toBe(0); expect(refused.errors[0].error).toMatch(/review/i);
  expect(await databaseService.prismaClient.investmentImportOrigin.count()).toBe(0);
  expect(await investmentService.importInvestmentTransactions(id, csv(buy), mapping, { skipRows: [2] })).toMatchObject({ imported: 0, skipped: 1, errors: [] });
});
it("preserves explicitly reviewed identical additional trades and makes retries idempotent", async () => {
  const id = await portfolio(), data = csv(buy, buy);
  const options = { additionalRows: [3], reviewId: "b9176570-4978-4bb6-89dc-a0c89ad32873" };
  expect(await investmentService.importInvestmentTransactions(id, data, mapping, options)).toMatchObject({ imported: 2, skipped: 0, errors: [] });
  expect(await investmentService.importInvestmentTransactions(id, data, mapping, options)).toMatchObject({ imported: 0, skipped: 2, errors: [] });
  expect((await investmentService.getSecurityAccount(id, "ABC")).investmentProperties.quantity).toBe(20);
  expect(await databaseService.prismaClient.investmentImportOrigin.count()).toBe(2);
});
it("accepts net consideration only with explicit policy and deducts each commission once", async () => {
  const id = await portfolio(), data = csv(buy.replace(",100,1,", ",101,1,"), "2026-01-03,sell,ABC,10,12,119,1,Sale,sell-1");
  expect((await investmentService.importInvestmentTransactions(id, data, mapping)).imported).toBe(0);
  expect(await investmentService.importInvestmentTransactions(id, data, mapping, { amountBasis: "net" })).toMatchObject({ imported: 2, skipped: 0, errors: [] });
  const cash = (await investmentService.getPortfolioAccounts(id)).tradeCash;
  expect(await databaseService.getAccountBalance(cash.id)).toBe(18);
});
it("retains origin identity after an imported cash transaction is corrected and deleted", async () => {
  const id = await portfolio(), data = csv("2026-01-02,interest,CASH,,,10,0,Interest,cash-1");
  await investmentService.importInvestmentTransactions(id, data, mapping);
  const origin = await databaseService.prismaClient.investmentImportOrigin.findFirstOrThrow();
  const entry = await databaseService.prismaClient.journalEntry.findUniqueOrThrow({ where: { id: origin.entryId! }, include: { lines: true } });
  await databaseService.updateJournalEntryLine({ lineId: entry.lines[0].id, fromAccountId: entry.lines[0].accountId, toAccountId: entry.lines[1].accountId, amount: 11, date: entry.date, description: "Corrected", transactionType: "income" });
  expect(await investmentService.importInvestmentTransactions(id, data, mapping)).toMatchObject({ imported: 0, skipped: 1, errors: [] });
  await databaseService.deleteJournalEntry(entry.id);
  expect((await databaseService.prismaClient.investmentImportOrigin.findUniqueOrThrow({ where: { id: origin.id } })).entryId).toBeNull();
  expect(await investmentService.importInvestmentTransactions(id, data, mapping)).toMatchObject({ imported: 0, skipped: 1, errors: [] });
});
it("does not post any row when one broker identifier has conflicting data within the file", async () => {
  const id = await portfolio(), data = csv(buy, buy.replace(",10,10,100,", ",5,10,50,"));
  const result = await investmentService.importInvestmentTransactions(id, data, { ...mapping, sourceId: "Id" });
  expect(result.imported).toBe(0); expect(result.errors[0].error).toMatch(/identifier.*different/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});
it("preserves leading zeros in broker identifiers", async () => {
  const id = await portfolio();
  expect(await investmentService.importInvestmentTransactions(id, csv(buy.replace("buy-1", "001"), buy.replace("buy-1", "1")), { ...mapping, sourceId: "Id" })).toMatchObject({ imported: 2, errors: [] });
});
it("reports physical source rows after multiline quoted records", async () => {
  const id = await portfolio(), data = csv(buy.replace("Original purchase", '"First\nsecond"'), "2026-01-03,buy,ABC,12junk,10,120,0,Bad,bad-1");
  const result = await investmentService.importInvestmentTransactions(id, data, mapping);
  expect(result.imported).toBe(0); expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 4 })]));
});
it("rejects duplicate header names rather than reading the wrong column", async () => {
  const result = await investmentService.validateImportData("Date,Type,Ticker,Amount,Amount\n2026-01-02,interest,CASH,10,20", mapping);
  expect(result.valid).toBe(false); expect(result.errors[0].error).toMatch(/unique/i);
});
it("never acknowledges a double posting when concurrent imports race on one origin", async () => {
  const id = await portfolio();
  const results = await Promise.all([1, 2].map(() => investmentService.importInvestmentTransactions(id, csv(buy), mapping)));
  expect(results.reduce((sum, result) => sum + result.imported, 0)).toBe(1);
  expect(await databaseService.prismaClient.investmentImportOrigin.count()).toBe(1);
  expect(await databaseService.prismaClient.investmentActivity.count()).toBe(1);
  expect((await investmentService.getSecurityAccount(id, "ABC")).investmentProperties.quantity).toBe(10);
});
it("accepts a negative net sale when commissions exceed gross proceeds", async () => {
  const id = await portfolio(), data = csv("2026-01-02,buy,ABC,1,0.5,0.5,0,Buy,buy-1", "2026-01-03,sell,ABC,1,0.5,-0.5,1,Sale,sell-1");
  expect(await investmentService.importInvestmentTransactions(id, data, mapping, { amountBasis: "net" })).toMatchObject({ imported: 2, skipped: 0, errors: [] });
  const cash = (await investmentService.getPortfolioAccounts(id)).tradeCash;
  expect(await databaseService.getAccountBalance(cash.id)).toBe(-1);
});
it("keeps physical row references correct with multiline fields followed by literal quotes", async () => {
  const id = await portfolio(), data = csv(buy.replace("Original purchase", '"First\nsecond"'), '2026-01-03,interest,CASH,,,10,0,Literal"note,id-2', "2026-01-04,buy,ABC,bad,10,100,0,Bad,id-3");
  const result = await investmentService.importInvestmentTransactions(id, data, mapping);
  expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 5 })]));
});
it("requires review when a later statement changes same-day financial data without a broker ID", async () => {
  const id = await portfolio();
  await investmentService.importInvestmentTransactions(id, csv(buy), mapping);
  const changed = csv(buy.replace(",100,1,", ",100,2,"));
  expect((await previewInvestmentImport(id, changed, mapping)).preview[0].status).toBe("review");
  const result = await investmentService.importInvestmentTransactions(id, changed, mapping);
  expect(result.imported).toBe(0); expect(result.errors[0].error).toMatch(/review|correction/i);
  expect((await investmentService.getSecurityAccount(id, "ABC")).investmentProperties.quantity).toBe(10);
});
it("uses broker IDs where present and financial matching for cash rows without IDs", async () => {
  const id = await portfolio(), data = csv(buy, "2026-01-03,interest,CASH,,,10,0,Interest,");
  const withIds = { ...mapping, sourceId: "Id" };
  expect(await investmentService.importInvestmentTransactions(id, data, withIds)).toMatchObject({ imported: 2, skipped: 0, errors: [] });
  expect(await investmentService.importInvestmentTransactions(id, data, withIds)).toMatchObject({ imported: 0, skipped: 2, errors: [] });
});
it("keeps equal no-ID cash transactions in different currencies separate", async () => {
  const id = await portfolio(), usd = (await investmentService.getPortfolioAccounts(id)).tradeCash;
  const cad = await investmentService.addTradeCashAccount(id, "CAD"), data = csv("2026-01-02,fee,CASH,,,5,0,Charge,");
  expect(await investmentService.importInvestmentTransactions(id, data, mapping, { tradeCashAccountId: usd.id })).toMatchObject({ imported: 1, errors: [] });
  expect(await investmentService.importInvestmentTransactions(id, data, mapping, { tradeCashAccountId: cad.id })).toMatchObject({ imported: 1, errors: [] });
  expect(await databaseService.getAccountBalance(usd.id)).toBe(-5);
  expect(await databaseService.getAccountBalance(cad.id)).toBe(-5);
});
it("reports a broker-ID currency change as a conflict without posting in another cash account", async () => {
  const id = await portfolio(), usd = (await investmentService.getPortfolioAccounts(id)).tradeCash;
  const cad = await investmentService.addTradeCashAccount(id, "CAD"), data = csv("2026-01-02,fee,CASH,,,5,0,Charge,cash-1"), withIds = { ...mapping, sourceId: "Id" };
  await investmentService.importInvestmentTransactions(id, data, withIds, { tradeCashAccountId: usd.id });
  const result = await investmentService.importInvestmentTransactions(id, data, withIds, { tradeCashAccountId: cad.id });
  expect(result.imported).toBe(0); expect(result.errors[0]?.error).toMatch(/different|conflict/i);
  expect(await databaseService.getAccountBalance(cad.id)).toBe(0);
});
