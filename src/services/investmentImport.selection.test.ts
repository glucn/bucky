import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { previewInvestmentImport, importInvestments } from "./investmentImport";
import { resetTestDatabase } from "./database.test.utils";
import type { InvestmentImportOptions } from "../shared/investmentImport";

beforeEach(resetTestDatabase);
const mapping = { date: "Date", type: "Type", ticker: "Ticker", quantity: "Quantity", price: "Price", amount: "Amount", sourceId: "Id" };
const data = (ids = ["one", "two"]) => "Date,Type,Ticker,Quantity,Price,Amount,Id\n" + ids.map((id) => `2026-01-02,buy,ABC,1,10,10,${id}`).join("\n");
let bookNumber = 0;
async function book(secondCurrency = "CAD") {
  const portfolio = await investmentService.createInvestmentPortfolio(`Selected imports ${++bookNumber}`, "CAD");
  const cash = secondCurrency === "CAD" ? portfolio.tradeCashAccount : await investmentService.addTradeCashAccount(portfolio.group.id, secondCurrency);
  const first = await investmentService.createMarketHolding({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", market: "TSX", quoteCurrency: "CAD", tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO" });
  const second = await investmentService.createMarketHolding({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", market: "NASDAQ", quoteCurrency: secondCurrency, tradeCashAccountId: cash.id, costBasisMethod: "FIFO" });
  return { id: portfolio.group.id, first, second };
}
const selection = (first: string, second?: string): InvestmentImportOptions => {
  const choices: Record<number, string> = { 2: first };
  if (second) choices[3] = second;
  return { securityAccountsByRow: choices };
};
const quantity = async (id: string) => (await databaseService.prismaClient.investmentProperties.findUniqueOrThrow({ where: { accountId: id } })).quantity;

it("previews ambiguous rows for holding selection without changing the book", async () => {
  const { id } = await book();
  expect(await previewInvestmentImport(id, data(["one"]), mapping)).toMatchObject({ valid: true, preview: [{ row: 2, status: "review", requiresHoldingSelection: true }] });
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});

it("posts each same-ticker row to its explicitly selected holding and native cash currency", async () => {
  const { id, first, second } = await book("USD"), options = selection(first.id, second.id);
  expect(await importInvestments(id, data(), mapping, options)).toMatchObject({ imported: 2, skipped: 0, errors: [] });
  expect(await quantity(first.id)).toBe(1); expect(await quantity(second.id)).toBe(1);
  const origins = await databaseService.prismaClient.investmentImportOrigin.findMany({ orderBy: { sourceId: "asc" } });
  expect(origins.map((origin) => JSON.parse(origin.payload).selection.securityAccountId)).toEqual([first.id, second.id]);
  expect(origins.map((origin) => origin.currency)).toEqual(["CAD", "USD"]);
  expect(await importInvestments(id, data(), mapping, options)).toMatchObject({ imported: 0, skipped: 2, errors: [] });
});

it("keeps identical no-ID rows on different holdings distinct even in the same currency", async () => {
  const { id, first, second } = await book(), options = selection(first.id, second.id);
  const noIds = { ...mapping, sourceId: undefined };
  expect(await importInvestments(id, data(), noIds, options)).toMatchObject({ imported: 2, skipped: 0, errors: [] });
  expect(await importInvestments(id, data(), noIds, options)).toMatchObject({ imported: 0, skipped: 2, errors: [] });
  expect(await quantity(first.id)).toBe(1); expect(await quantity(second.id)).toBe(1);
});

it("refuses to retarget an existing broker ID, including an explicit additional decision", async () => {
  const { id, first, second } = await book();
  expect((await importInvestments(id, data(["one"]), mapping, selection(first.id))).imported).toBe(1);
  const options = { ...selection(second.id), additionalRows: [2] };
  expect((await previewInvestmentImport(id, data(["one"]), mapping, options)).preview[0]).toMatchObject({ status: "conflict" });
  const result = await importInvestments(id, data(["one"]), mapping, options);
  expect(result.imported).toBe(0); expect(result.errors[0]?.error).toMatch(/holding|security|conflict/i);
  expect(await quantity(first.id)).toBe(1); expect(await quantity(second.id)).toBe(0);
  const noIds = { ...mapping, sourceId: undefined }, reviewed = { ...selection(first.id), additionalRows: [2], reviewId: "b9176570-4978-4bb6-89dc-a0c89ad32873" };
  expect((await importInvestments(id, data(["one"]), noIds, reviewed)).imported).toBe(1);
  const retry = await importInvestments(id, data(["one"]), noIds, { ...reviewed, ...selection(second.id) });
  expect(retry.imported).toBe(0); expect(retry.errors[0]?.error).toMatch(/holding/i);
  expect(await quantity(first.id)).toBe(2); expect(await quantity(second.id)).toBe(0);
});

it.each(["broker ID", "financial key"])("recognizes legacy %s origins from linked activity without rewriting them", async (kind) => {
  const { id, first } = await book();
  const columns = kind === "broker ID" ? mapping : { ...mapping, sourceId: undefined };
  await importInvestments(id, data(["one"]), columns, selection(first.id));
  const origin = await databaseService.prismaClient.investmentImportOrigin.findFirstOrThrow();
  const payload = JSON.parse(origin.payload); delete payload.selection;
  await databaseService.prismaClient.investmentImportOrigin.update({ where: { id: origin.id }, data: { payload: JSON.stringify(payload), sourceKey: origin.sourceKey.split(":holding:")[0] } });
  expect(await importInvestments(id, data(["one"]), columns, selection(first.id))).toMatchObject({ imported: 0, skipped: 1, errors: [] });
  expect((await databaseService.prismaClient.investmentImportOrigin.findUniqueOrThrow({ where: { id: origin.id } })).payload).toBe(JSON.stringify(payload));
});

it("targets sales, dividends, reinvestments and splits without changing the other listing", async () => {
  const { id, first, second } = await book();
  const statement = data(["buy"]) + "\n2026-01-03,split,ABC,,,2,split\n2026-01-04,sell,ABC,1,12,12,sell\n2026-01-05,dividend,ABC,,,2,dividend\n2026-01-06,dividend_reinvest,ABC,,2,2,reinvest";
  const options = { securityAccountsByRow: Object.fromEntries([2, 3, 4, 5, 6].map((row) => [row, second.id])) };
  expect(await importInvestments(id, statement, mapping, options)).toMatchObject({ imported: 5, skipped: 0, errors: [] });
  expect(await quantity(first.id)).toBe(0); expect(await quantity(second.id)).toBe(2);
  const origins = await databaseService.prismaClient.investmentImportOrigin.findMany();
  expect(origins.every((origin) => JSON.parse(origin.payload).selection.securityAccountId === second.id)).toBe(true);
  expect(await importInvestments(id, statement, mapping, options)).toMatchObject({ imported: 0, skipped: 5, errors: [] });
});

it("refuses different holding choices for one broker ID before posting any row", async () => {
  const { id, first, second } = await book();
  await expect(importInvestments(id, data(["one", "one"]), mapping, selection(first.id, second.id))).rejects.toThrow(/identifier.*different holdings/i);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});

it("rejects a selected holding from another portfolio before any financial write", async () => {
  const own = await book(), other = await book();
  const result = await importInvestments(own.id, data(["one"]), mapping, selection(other.first.id));
  expect(result.imported).toBe(0); expect(result.errors[0]?.error).toMatch(/portfolio|holding|security/i);
  expect(await databaseService.prismaClient.investmentImportOrigin.count()).toBe(0);
  expect(await databaseService.prismaClient.journalEntry.count()).toBe(0);
});
it("requires an active holding for new rows but retains matching archived import origins", async () => {
  const { id, first, second } = await book();
  await importInvestments(id, data(["one"]), mapping, selection(first.id));
  await databaseService.prismaClient.account.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { isArchived: true } });
  expect(await importInvestments(id, data(["one"]), mapping, selection(first.id))).toMatchObject({ imported: 0, skipped: 1, errors: [] });
  expect((await previewInvestmentImport(id, data(["new"]), mapping, selection(second.id))).preview[0]).toMatchObject({ requiresHoldingSelection: true });
  const result = await importInvestments(id, data(["new"]), mapping, selection(second.id));
  expect(result.imported).toBe(0); expect(result.errors[0]?.error).toMatch(/archived/i);
  expect(await databaseService.prismaClient.investmentImportOrigin.count()).toBe(1);
});
