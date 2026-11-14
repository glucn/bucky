import { beforeEach, expect, it } from "vitest";
import * as correction from "./investmentCorrectionPreview";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { resetTestDatabase } from "./database.test.utils";

beforeEach(resetTestDatabase);
async function setup() {
  const portfolio = await investmentService.createInvestmentPortfolio("Replay", "CAD");
  const holding = await investmentService.createSecurityAccount(portfolio.group.id, "ABC");
  const identity = { portfolioId: portfolio.group.id, tickerSymbol: "ABC", securityAccountId: holding.id };
  await investmentService.recordBuy({ ...identity, date: "2026-01-01", quantity: 10, pricePerShare: 10 });
  await investmentService.recordStockSplit(holding.id, 2, "2026-01-02");
  await investmentService.recordSell({ ...identity, date: "2026-01-03", quantity: 10, pricePerShare: 15 });
  const activity = await databaseService.prismaClient.investmentActivity.findFirstOrThrow({ where: { accountId: holding.id, kind: "buy" } });
  return { holding, activity, cash: portfolio.tradeCashAccount };
}
async function ledger() {
  const db = databaseService.prismaClient;
  return {
    activities: await db.investmentActivity.findMany({ include: { journalLinks: true } }),
    journals: await db.journalEntry.findMany({ include: { lines: true } }),
    positions: await db.investmentProperties.findMany(),
    origins: await db.investmentImportOrigin.findMany(),
  };
}
it("previews a corrected purchase through a split and a later sale without persisting changes", async () => {
  const { activity } = await setup(), before = await ledger();
  const result = await correction.previewInvestmentTradeCorrection({ activityId: activity.id, date: activity.date, quantity: 10, pricePerShare: 12 });
  expect(result).toMatchObject({
    before: { quantity: 10, costBasis: 50 },
    after: { quantity: 10, costBasis: 60 },
    affected: [
      { kind: "buy", before: { basisAfter: 100 }, after: { basisAfter: 120 } },
      { kind: "split", before: { quantityAfter: 20 }, after: { quantityAfter: 20 } },
      { kind: "sell", before: { realizedGain: 100 }, after: { realizedGain: 90 } },
    ],
  });
  expect(await ledger()).toEqual(before);
});

it("rejects a correction that would make a later sale impossible and keeps the original records", async () => {
  const { activity } = await setup(), before = await ledger();
  await expect(correction.previewInvestmentTradeCorrection({ activityId: activity.id, date: activity.date, quantity: 4, pricePerShare: 10 })).rejects.toThrow(/insufficient shares/i);
  expect(await ledger()).toEqual(before);
});

it("commits the reviewed replay and retains original source journals and revision provenance", async () => {
  const { activity, holding } = await setup(), before = await ledger();
  const change = { activityId: activity.id, date: activity.date, quantity: 10, pricePerShare: 12 };
  const preview = await correction.previewInvestmentTradeCorrection(change);
  const saved = await correction.saveInvestmentTradeCorrection(change, preview.reviewToken, "Corrected broker trade confirmation");
  expect(saved.after).toMatchObject({ quantity: 10, costBasis: 60 });
  const revision = await databaseService.prismaClient.investmentCorrection.findUniqueOrThrow({ where: { id: saved.revisionId } });
  expect(revision).toMatchObject({ accountId: holding.id, activityId: activity.id, reason: "Corrected broker trade confirmation" });
  const original = JSON.parse(revision.beforeJson);
  const replacement = JSON.parse(revision.afterJson);
  expect(replacement[0].event.journalLinks[0].entry.description).toBe("Buy 10 shares of ABC @ 12");
  expect(original.map((row: { id: string }) => row.id)).toEqual(before.activities.map((row) => row.id));
  expect(original[0].journalLinks[0].entry.lines.map((line: { amount: number }) => line.amount).sort((a: number,b: number) => a-b)).toEqual([-100, 100]);
  await expect(correction.saveInvestmentTradeCorrection(change, preview.reviewToken, "Duplicate save")).rejects.toThrow();
});

it("refuses stale previews and retains history after a write failure", async () => {
  const { activity, holding } = await setup();
  const change = { activityId: activity.id, date: activity.date, quantity: 10, pricePerShare: 12 };
  const preview = await correction.previewInvestmentTradeCorrection(change);
  await investmentService.recordStockSplit(holding.id, 2, "2026-01-04");
  const before = await ledger();
  await expect(correction.saveInvestmentTradeCorrection(change, preview.reviewToken, "Stale")).rejects.toThrow(/preview|review/i);
  const fresh = await correction.previewInvestmentTradeCorrection(change);
  await databaseService.prismaClient.$executeRawUnsafe("CREATE TRIGGER fail_revision BEFORE INSERT ON InvestmentCorrection BEGIN SELECT RAISE(ABORT, 'synthetic revision failure'); END");
  try {
    await expect(correction.saveInvestmentTradeCorrection(change, fresh.reviewToken, "Fails on audit write")).rejects.toThrow();
    expect(await ledger()).toEqual(before);
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_revision"); }
});

it("refuses changed proposed values and stops at retained settlement checkpoints", async () => {
  const { activity, cash } = await setup(), before = await ledger();
  const change = { activityId: activity.id, date: activity.date, quantity: 10, pricePerShare: 12 };
  const preview = await correction.previewInvestmentTradeCorrection(change);
  await expect(correction.saveInvestmentTradeCorrection({ ...change, pricePerShare: 13 }, preview.reviewToken, "Unreviewed price")).rejects.toThrow(/preview again/i);
  await databaseService.prismaClient.checkpoint.create({ data: { accountId: cash.id, date: "2026-01-03", balance: 50 } });
  await expect(correction.saveInvestmentTradeCorrection(change, preview.reviewToken, "Checkpoint retained")).rejects.toThrow(/checkpoint/i);
  expect(await ledger()).toEqual(before);
  expect(await databaseService.prismaClient.investmentCorrection.count()).toBe(0);
});

it("replays in corrected date order and keeps durable import identity linked to its original journal", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Statement replay", "CAD");
  const portfolioId = portfolio.group.id;
  const csv = "Date,Type,Ticker,Quantity,Price,Amount,Id\n2026-01-01,buy,ABC,10,10,100,one";
  expect(await investmentService.importInvestmentTransactions(portfolioId, csv, {
    date: "Date", type: "Type", ticker: "Ticker", quantity: "Quantity", price: "Price", amount: "Amount", sourceId: "Id",
  })).toMatchObject({ imported: 1, errors: [] });
  const first = await databaseService.prismaClient.investmentActivity.findFirstOrThrow();
  await investmentService.recordBuy({ portfolioId, tickerSymbol: "ABC", date: "2026-01-02", quantity: 10, pricePerShare: 20 });
  await investmentService.recordSell({ portfolioId, tickerSymbol: "ABC", date: "2026-01-04", quantity: 10, pricePerShare: 30 });
  const before = await ledger();
  expect(before.origins[0].entryId).not.toBeNull();
  const preview = await correction.previewInvestmentTradeCorrection({ activityId: first.id, date: "2026-01-03", quantity: 10, pricePerShare: 10 });
  expect(preview.affected.map(({ after }) => after.date)).toEqual(["2026-01-02", "2026-01-03", "2026-01-04"]);
  expect(preview.affected[2]).toMatchObject({ before: { realizedGain: 200 }, after: { realizedGain: 100 } });
  expect(await ledger()).toEqual(before);
  await correction.saveInvestmentTradeCorrection({ activityId: first.id, date: "2026-01-03", quantity: 10, pricePerShare: 10 }, preview.reviewToken, "Confirmed corrected date");
  const origin = await databaseService.prismaClient.investmentImportOrigin.findUniqueOrThrow({ where: { id: before.origins[0].id }, include: { entry: true } });
  expect(origin).toMatchObject({ sourceKey: before.origins[0].sourceKey, fingerprint: before.origins[0].fingerprint, entry: { date: "2026-01-03" } });
  expect(origin.entryId).not.toBe(before.origins[0].entryId);
  expect(await investmentService.importInvestmentTransactions(portfolioId, csv, {
    date: "Date", type: "Type", ticker: "Ticker", quantity: "Quantity", price: "Price", amount: "Amount", sourceId: "Id",
  })).toMatchObject({ imported: 0, skipped: 1, errors: [] });
});

it("replays retained distributions and both reinvestment classifications from their original postings", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Distributions replay", "CAD");
  const identity = { portfolioId: portfolio.group.id, tickerSymbol: "ABC" };
  await investmentService.recordBuy({ ...identity, date: "2026-01-01", quantity: 10, pricePerShare: 10 });
  await investmentService.recordDividend({ ...identity, date: "2026-01-02", amount: 5 });
  await investmentService.recordDividend({ ...identity, date: "2026-01-03", amount: 10, isReturnOfCapital: true });
  for (const [i, recordAsIncome] of [true, false].entries()) {
    await investmentService.recordReinvestedDividend({ ...identity, date: `2026-01-0${4 + i}`, dividendAmount: 10, reinvestmentPrice: 5, recordAsIncome, description: "Broker distribution" });
  }
  const activity = await databaseService.prismaClient.investmentActivity.findFirstOrThrow({ where: { kind: "buy" } }), before = await ledger();
  const preview = await correction.previewInvestmentTradeCorrection({ activityId: activity.id, date: activity.date, quantity: 10, pricePerShare: 12 });
  expect(preview.after).toMatchObject({ quantity: 14, costBasis: 120 });
  expect(preview.affected.map(({ kind, after }) => [kind, after.cashAmount, after.basisAfter])).toEqual([
    ["buy", -120, 120], ["dividend", 5, 120], ["return_of_capital", 10, 110], ["income_reinvestment", 0, 120], ["capital_reinvestment", 0, 120],
  ]);
  expect(await ledger()).toEqual(before);
});
