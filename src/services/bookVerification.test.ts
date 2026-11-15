import { beforeEach, expect, it } from "vitest";
import { AccountType } from "../shared/accountTypes";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { verifyBook } from "./bookVerification";
import { investmentService } from "./investmentService";

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
    db().journalEntry.create({ data: { date, type, lines: { create: lines } }, include: { lines: true } });
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
