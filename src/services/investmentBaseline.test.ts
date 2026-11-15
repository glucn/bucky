import { beforeEach, expect, it } from "vitest";
import * as history from "./investmentActivity";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { resetTestDatabase } from "./database.test.utils";

beforeEach(resetTestDatabase);
async function legacy() {
  const portfolio = await investmentService.createInvestmentPortfolio("Legacy", "CAD");
  const holding = await investmentService.createSecurityAccount(portfolio.group.id, "ABC");
  await databaseService.setOpeningBalance({ accountId: holding.id, displayAmount: 100, asOfDate: "2026-01-01" });
  const lots = [{ date: "2025-12-29", quantity: 10, pricePerShare: 10, amount: 100 }];
  await databaseService.prismaClient.investmentProperties.update({ where: { accountId: holding.id }, data: {
    quantity: 10, lots: JSON.stringify(lots), hasCompleteActivityHistory: false,
  } });
  return { portfolio, holding, lots };
}
const confirm = history.confirmInvestmentBaseline;
const reviewed = (accountId: string, lots: history.InvestmentBaselineReview["lots"]) => ({ accountId, date: "2026-01-02", currency: "CAD", quantity: 10, costBasis: 100, lots });

it("establishes a verified cutover without rewriting holdings or posting new money", async () => {
  const { portfolio, holding, lots } = await legacy();
  const before = await databaseService.prismaClient.journalEntry.findMany({ include: { lines: true } });
  await confirm(reviewed(holding.id, lots));
  expect(await databaseService.prismaClient.journalEntry.findMany({ include: { lines: true } })).toEqual(before);
  expect(await history.getInvestmentSnapshot(holding.id, "2026-01-01")).toEqual({ status: "unavailable", reason: "legacy_history" });
  expect(await history.getInvestmentSnapshot(holding.id, "2026-01-02")).toMatchObject({ status: "available", quantity: 10, costBasis: 100 });
  await expect(investmentService.recordDividend({ portfolioId: portfolio.group.id, securityAccountId: holding.id, tickerSymbol: "ABC", date: "2026-01-02", amount: 3 })).rejects.toThrow(/cutover date/i);
  await investmentService.recordSell({ portfolioId: portfolio.group.id, securityAccountId: holding.id, tickerSymbol: "ABC", date: "2026-01-03", quantity: 4, pricePerShare: 15 });
  expect(await history.getInvestmentSnapshot(holding.id, "2026-01-03")).toMatchObject({ status: "available", quantity: 6, costBasis: 60 });
  expect(await history.getInvestmentSnapshot(holding.id, "2026-01-02")).toMatchObject({ quantity: 10, costBasis: 100 });
  await expect(databaseService.setOpeningBalance({ accountId: holding.id, displayAmount: 120, asOfDate: "2026-01-01" })).rejects.toThrow(/reviewed baseline/i);
  expect(await databaseService.createJournalEntry({ fromAccountId: portfolio.tradeCashAccount.id, toAccountId: holding.id, amount: 10, date: "2026-01-04" })).toMatchObject({ skipped: true, reason: expect.stringMatching(/baseline/i) });
  await expect(databaseService.deleteJournalEntry(before[0].id)).rejects.toThrow(/investment corrections/i);
});

it("rejects stale reviewed figures, bad lots and a cutoff before retained activity", async () => {
  const { portfolio, holding, lots } = await legacy();
  const input = reviewed(holding.id, lots);
  await expect(confirm({ ...input, quantity: 11 })).rejects.toThrow(/quantity/i);
  await expect(confirm({ ...input, costBasis: 110 })).rejects.toThrow(/basis/i);
  await expect(confirm({ ...input, lots: [{ ...lots[0], amount: 99 }] })).rejects.toThrow(/basis/i);
  await investmentService.recordDividend({ portfolioId: portfolio.group.id, securityAccountId: holding.id, tickerSymbol: "ABC", date: "2026-01-03", amount: 3 });
  await expect(confirm(input)).rejects.toThrow(/date|cutover/i);
  expect(await history.getInvestmentSnapshot(holding.id, "2026-01-03")).toEqual({ status: "unavailable", reason: "legacy_history" });
});

it("accepts existing tracked suffix activity before the cutover and refuses a second baseline", async () => {
  const { portfolio, holding, lots } = await legacy();
  await investmentService.recordDividend({ portfolioId: portfolio.group.id, securityAccountId: holding.id, tickerSymbol: "ABC", date: "2026-01-02", amount: 3 });
  const input = reviewed(holding.id, lots);
  await confirm(input);
  await expect(confirm(input)).rejects.toThrow(/already|complete/i);
  expect(await history.getInvestmentSnapshot(holding.id, "2026-01-02")).toMatchObject({ status: "available", quantity: 10, costBasis: 100 });
});

it("validates the retained journal and rolls back the cutover if its counterposting does not balance", async () => {
  const { holding, lots } = await legacy();
  const line = await databaseService.prismaClient.journalLine.findFirstOrThrow({ where: { accountId: { not: holding.id } } });
  await databaseService.prismaClient.journalLine.update({ where: { id: line.id }, data: { amount: -99, amountCents: "-9900" } });
  await expect(confirm(reviewed(holding.id, lots))).rejects.toThrow(/cutover verification/i);
  expect(await databaseService.prismaClient.investmentActivity.count({ where: { accountId: holding.id } })).toBe(0);
  expect(await history.getInvestmentSnapshot(holding.id, "2026-01-03")).toEqual({ status: "unavailable", reason: "legacy_history" });
});

it("supports reviewed average cost without inventing lots", async () => {
  const { portfolio, holding } = await legacy();
  await databaseService.prismaClient.investmentProperties.update({ where: { accountId: holding.id }, data: { costBasisMethod: "AVERAGE_COST", lots: null } });
  expect(await history.getInvestmentBaselineReview(holding.id)).toMatchObject({ earliestDate: "2026-01-01", quantity: 10, costBasis: 100, method: "AVERAGE_COST", lots: null });
  await confirm(reviewed(holding.id, null));
  await investmentService.recordSell({ portfolioId: portfolio.group.id, securityAccountId: holding.id, tickerSymbol: "ABC", date: "2026-01-03", quantity: 2, pricePerShare: 15 });
  expect(await history.getInvestmentSnapshot(holding.id, "2026-01-03")).toEqual({ status: "available", quantity: 8, costBasis: 80, lots: null });
});
