import { beforeEach, expect, it } from "vitest";
import { AccountType } from "../shared/accountTypes";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { verifyBook } from "./bookVerification";
import { investmentService } from "./investmentService";
import { withPostingCents } from "./journalPrecision";

const db = () => databaseService.prismaClient;
beforeEach(async () => { await resetTestDatabase(); });

async function fixture(date = "2026-11-01") {
  const [cad, usd, category, equity] = await Promise.all([
    db().account.create({ data: { name: "Checker CAD", currency: "CAD", type: AccountType.User } }),
    db().account.create({ data: { name: "Checker USD", currency: "USD", type: AccountType.User } }),
    db().account.create({ data: { name: "Checker expenses", currency: "USD", type: AccountType.Category } }),
    db().account.create({ data: { name: "Checker equity", currency: "USD", type: AccountType.System } }),
  ]);
  const entry = (lines: Array<{ accountId: string; amount: number; currency: string; exchangeRate?: number }>, type?: string) =>
    db().journalEntry.create({ data: { date, type, lines: { create: lines.map(withPostingCents) } }, include: { lines: true } });
  return { cad, usd, category, equity, entry };
}

it("accepts balanced native-currency postings, portfolio FX and nonfinancial splits", async () => {
  const { cad, usd, category, equity, entry } = await fixture();
  await entry([{ accountId: cad.id, amount: -12, currency: "CAD" }, { accountId: category.id, amount: 12, currency: "CAD" }]);
  await entry([{ accountId: cad.id, amount: 12, currency: "CAD" }, { accountId: equity.id, amount: -12, currency: "CAD" }]);
  await entry([{ accountId: cad.id, amount: -12, currency: "CAD", exchangeRate: 0.75 }, { accountId: usd.id, amount: 9, currency: "USD", exchangeRate: 0.75 }], "investment_cash_deposit");
  await entry([], "stock_split");
  expect(await verifyBook()).toEqual({ findings: [] });
});

it("reports a retained posting whose original precision needs review", async () => {
  const { cad, category } = await fixture();
  const saved = await db().journalEntry.create({ data: { date: "2026-11-01", lines: { create: [
    { accountId: cad.id, amount: -1.005, currency: "CAD" },
    { accountId: category.id, amount: 1.005, currency: "CAD" },
  ] } } });
  expect((await verifyBook()).findings).toEqual([
    expect.objectContaining({ entryId: saved.id, code: "journal-legacy-precision", severity: "warning" }),
    expect.objectContaining({ entryId: saved.id, code: "journal-legacy-precision", severity: "warning" }),
  ]);
});

it("reports persisted posting discrepancies by record and leaves the book unchanged", async () => {
  const { cad, usd, category, entry } = await fixture();
  const uneven = await entry([{ accountId: cad.id, amount: -12, currency: "CAD" }, { accountId: category.id, amount: 11.99, currency: "CAD" }]);
  const mislabeled = await entry([{ accountId: cad.id, amount: -12, currency: "USD" }, { accountId: category.id, amount: 12, currency: "USD" }]);
  const mixed = await entry([{ accountId: cad.id, amount: -12, currency: "CAD" }, { accountId: usd.id, amount: 12, currency: "USD" }]);
  const badFx = await entry([{ accountId: cad.id, amount: -12, currency: "CAD", exchangeRate: 0.75 }, { accountId: usd.id, amount: 10, currency: "USD", exchangeRate: 0.75 }], "currency_transfer");
  const mismatchedRate = await entry([{ accountId: cad.id, amount: -12, currency: "CAD", exchangeRate: 0.75 }, { accountId: usd.id, amount: 9, currency: "USD", exchangeRate: 0.8 }], "investment_cash_withdrawal");
  const missing = await entry([]);
  const snapshot = () => db().journalEntry.findMany({ orderBy: { id: "asc" }, include: { lines: { orderBy: { id: "asc" } } } });
  const before = await snapshot();

  expect((await verifyBook()).findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "journal-unbalanced", entryId: uneven.id }),
    expect.objectContaining({ code: "journal-account-currency", entryId: mislabeled.id, lineId: mislabeled.lines.find((line) => line.accountId === cad.id)?.id }),
    expect.objectContaining({ code: "journal-unbalanced", entryId: mixed.id }),
    expect.objectContaining({ code: "journal-fx", entryId: badFx.id }),
    expect.objectContaining({ code: "journal-fx", entryId: mismatchedRate.id }),
    expect.objectContaining({ code: "journal-postings", entryId: missing.id }),
  ]));
  expect(await snapshot()).toEqual(before);
});

it("keeps foreign-currency checkpoint postings balanced and verifies the stored assertion against the journal", async () => {
  const { cad, category, entry } = await fixture();
  const { checkpoint, journalEntry } = await databaseService.createCheckpoint({ accountId: cad.id, date: "2026-11-01", balance: 200 });
  const offsets = await db().journalLine.findMany({ where: { entryId: journalEntry.id } });
  expect(offsets.map(({ currency }) => currency)).toEqual(["CAD", "CAD"]);
  expect(await verifyBook()).toEqual({ findings: [] });

  await entry([{ accountId: cad.id, amount: -12, currency: "CAD" }, { accountId: category.id, amount: 12, currency: "CAD" }]);
  expect(await verifyBook()).toEqual({ findings: [expect.objectContaining({
    code: "checkpoint-balance", checkpointId: checkpoint.id, accountId: cad.id,
    expected: 200, actual: 188, currency: "CAD",
  })] });
  expect((await db().checkpoint.findUniqueOrThrow({ where: { id: checkpoint.id } })).balance).toBe(200);
});

it("preserves a cent between large offsetting postings when creating and verifying checkpoints", async () => {
  const { cad, category, entry } = await fixture("2026-02-01");
  for (const amount of [80_000_000_000_000, 0.01, -80_000_000_000_000]) {
    await entry([{ accountId: cad.id, amount, currency: "CAD" }, { accountId: category.id, amount: -amount, currency: "CAD" }]);
  }
  expect(await databaseService.getAccountBalanceAtDate(cad.id, "2026-02-01")).toBe(0.01);
  const result = await databaseService.createCheckpoint({ accountId: cad.id, date: "2026-02-01", balance: 0.02 });
  expect(result.adjustmentAmount).toBe(0.01);
  expect(await verifyBook("2026-02-01")).toEqual({ findings: [] });
});

it("calculates balances and verifies a posted entry from its exact stored cents", async () => {
  const { cad, category } = await fixture();
  const saved = await databaseService.createJournalEntry({
    fromAccountId: cad.id, toAccountId: category.id, amount: 12.34, date: "2026-11-01",
  });
  const posting = saved.entry!.lines.find((line: { accountId: string }) => line.accountId === cad.id)!;
  expect(posting.amountCents).toBe("-1234");
  await db().journalLine.update({ where: { id: posting.id }, data: { amount: -999 } });
  expect(await databaseService.getAccountBalanceAtDate(cad.id, "2026-11-01")).toBe(-12.34);
  expect(await verifyBook()).toEqual({ findings: [] });
});

it("uses persisted exact checkpoint cents and calls out a legacy checkpoint awaiting review", async () => {
  const { cad } = await fixture();
  const { checkpoint } = await databaseService.createCheckpoint({ accountId: cad.id, date: "2026-11-01", balance: 10.01 });
  expect(checkpoint.balanceCents).toBe("1001");
  await db().checkpoint.update({ where: { id: checkpoint.id }, data: { balance: 99 } });
  expect(await databaseService.getAccountBalanceAtDate(cad.id, "2026-11-01")).toBe(10.01);
  expect((await databaseService.getLatestCheckpointForAccount(cad.id))?.balance).toBe(10.01);
  expect(await verifyBook()).toEqual({ findings: [] });
  const legacy = await db().checkpoint.create({ data: { accountId: cad.id, date: "2026-11-02", balance: 10.011 } });
  expect((await verifyBook()).findings).toContainEqual(expect.objectContaining({
    severity: "warning", code: "checkpoint-legacy-precision", checkpointId: legacy.id,
  }));
});

it("requires review before replacing a checkpoint with ambiguous legacy precision", async () => {
  const { cad } = await fixture();
  const legacy = await db().checkpoint.create({ data: { accountId: cad.id, date: "2026-11-02", balance: 10.011 } });
  await expect(databaseService.reconcileCheckpoint(legacy.id)).rejects.toThrow(/review.*statement/i);
  expect(await db().checkpoint.findUnique({ where: { id: legacy.id } })).toEqual(legacy);
});

it("deletes only the checkpoint adjustment and retains unrelated same-day transactions", async () => {
  const { cad, category, entry } = await fixture();
  const ordinary = await entry([{ accountId: cad.id, amount: -12, currency: "CAD" }, { accountId: category.id, amount: 12, currency: "CAD" }]);
  const saved = await databaseService.createCheckpoint({ accountId: cad.id, date: "2026-11-01", balance: 200, description: "Statement" });
  expect(saved.checkpoint.journalEntryId).toBe(saved.journalEntry.id);
  await expect(databaseService.deleteJournalEntry(saved.journalEntry.id)).rejects.toThrow(/checkpoint/i);
  await databaseService.deleteCheckpoint(saved.checkpoint.id);
  expect(await db().journalEntry.findUnique({ where: { id: ordinary.id }, include: { lines: true } })).toEqual(ordinary);
  expect(await db().journalEntry.findUnique({ where: { id: saved.journalEntry.id } })).toBeNull();
  expect(await databaseService.getAccountBalanceAtDate(cad.id, "2026-11-01")).toBe(-12);
});

it("keeps an ambiguous legacy checkpoint and its possible adjustments intact", async () => {
  const { cad } = await fixture();
  const data = { accountId: cad.id, date: "2026-11-01", balance: 200, description: "Statement" };
  const first = await databaseService.createCheckpoint(data);
  await databaseService.createCheckpoint(data);
  await db().checkpoint.updateMany({ data: { journalEntryId: null } });
  await db().journalEntry.updateMany({ data: { entryType: null } });
  await expect(databaseService.deleteCheckpoint(first.checkpoint.id)).rejects.toThrow(/ambiguous/i);
  expect(await db().checkpoint.count()).toBe(2);
  expect(await db().journalEntry.count()).toBe(2);
});

it("reconciles the destination of an FX transfer without reversing the stored rate", async () => {
  const { cad, usd, entry } = await fixture();
  const transfer = await entry([
    { accountId: usd.id, amount: -100, currency: "USD", exchangeRate: 1.4 },
    { accountId: cad.id, amount: 140, currency: "CAD", exchangeRate: 1.4 },
  ], "currency_transfer");
  const saved = await databaseService.createCheckpoint({ accountId: cad.id, date: "2026-11-01", balance: 140 });
  const reconciled = await databaseService.reconcileCheckpoint(saved.checkpoint.id);
  expect(reconciled.checkpoint.balance).toBe(140);
  expect(await db().journalEntry.findUnique({ where: { id: transfer.id }, include: { lines: true } })).toEqual(transfer);
  await db().journalLine.updateMany({ where: { entryId: transfer.id }, data: { exchangeRate: 2 } });
  await expect(databaseService.reconcileCheckpoint(reconciled.checkpoint.id)).rejects.toThrow(/currency transfer inconsistency/i);
  expect(await db().checkpoint.findUnique({ where: { id: reconciled.checkpoint.id } })).not.toBeNull();
});

it("checks retained investment activity and distinguishes legacy history from inconsistent lots", async () => {
  const portfolio = await investmentService.createInvestmentPortfolio("Verifier portfolio", "CAD");
  const holding = await investmentService.createSecurityAccount(portfolio.group.id, "ABC");
  const legacy = await investmentService.createSecurityAccount(portfolio.group.id, "XYZ");
  await investmentService.recordBuy({ portfolioId: portfolio.group.id, securityAccountId: holding.id, tickerSymbol: "ABC",
    date: "2026-01-01", quantity: 10, pricePerShare: 10 });
  await db().investmentProperties.update({ where: { accountId: legacy.id }, data: { hasCompleteActivityHistory: false } });
  const historyGap = expect.objectContaining({ code: "investment-legacy", accountId: legacy.id, severity: "warning" });
  expect((await verifyBook()).findings).toEqual(expect.arrayContaining([historyGap]));

  await db().investmentProperties.update({ where: { accountId: holding.id }, data: { lots: "[]" } });
  expect((await verifyBook()).findings).toEqual(expect.arrayContaining([
    historyGap,
    expect.objectContaining({ code: "investment-inconsistent", accountId: holding.id, severity: "error" }),
  ]));
});

it("uses completed raw prices for the exact listing and dated FX for current exposures", async () => {
  const date = "2026-02-10";
  await db().appSetting.upsert({ where: { key: "baseCurrency" },
    create: { key: "baseCurrency", jsonValue: '"CAD"' }, update: { jsonValue: '"CAD"' } });
  const portfolio = await investmentService.createInvestmentPortfolio("Coverage", "USD");
  const holding = await investmentService.createMarketHolding({
    portfolioId: portfolio.group.id, tickerSymbol: "ABC", market: "NASDAQ", quoteCurrency: "USD",
    tradeCashAccountId: portfolio.tradeCashAccount.id, costBasisMethod: "FIFO",
  });
  await investmentService.recordBuy({ portfolioId: portfolio.group.id, securityAccountId: holding.id,
    tickerSymbol: "ABC", date: "2026-02-01", quantity: 10, pricePerShare: 10 });
  const { cad, usd, entry } = await fixture(date);
  await entry([{ accountId: usd.id, amount: -12, currency: "USD", exchangeRate: 1.25 },
    { accountId: cad.id, amount: 15, currency: "CAD", exchangeRate: 1.25 }], "currency_transfer");
  await db().securityPriceHistory.create({ data: { tickerSymbol: "ABC", date, price: 30 } });
  const price = { ticker: "ABC", market: "NASDAQ", marketDate: date, close: 20, priceBasis: "raw", barStatus: "complete" };
  await db().securityDailyPrice.createMany({ data: [
    { ...price, market: "TSX" }, { ...price, priceBasis: "split_adjusted" },
    { ...price, marketDate: "2026-02-11" },
  ] });
  const priceGap = expect.objectContaining({ code: "valuation-price", accountId: holding.id, severity: "warning" });
  const fxGap = expect.objectContaining({ code: "valuation-fx", accountId: usd.id, severity: "warning" });
  expect((await verifyBook(date)).findings).toEqual(expect.arrayContaining([priceGap, fxGap]));
  const rate = { sourceCurrency: "CAD", targetCurrency: "USD", marketDate: "2026-02-11", rate: 0.8 };
  await db().fxDailyRate.create({ data: rate });
  expect((await verifyBook(date)).findings).toEqual(expect.arrayContaining([priceGap, fxGap]));

  await db().securityPriceHistory.deleteMany();
  await db().securityDailyPrice.update({ where: { ticker_market_marketDate: { ticker: "ABC", market: "NASDAQ", marketDate: date } },
    data: { priceBasis: "raw" } });
  await db().fxDailyRate.create({ data: { ...rate, marketDate: date } });
  expect(await verifyBook(date)).toEqual({ findings: [] });
});
