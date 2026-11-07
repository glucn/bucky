import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { investmentService } from "./investmentService";
import { bindSecurityMarket } from "./securityMarketBinding";
import { securityMarketData } from "./securityMarketData";
import { getSecurityPriceContext, previewSecurityPrices, saveSecurityPrices, searchSecurityMarkets, excludeSecurityPrice } from "./securityPriceControls";
import { parseSecurityPriceCsv } from "../shared/securityPrices";

beforeEach(resetTestDatabase);
async function account(bound = true) {
  const portfolio = await investmentService.createInvestmentPortfolio("Price controls", "CAD");
  await investmentService.recordBuy({ portfolioId: portfolio.group.id, tickerSymbol: "ABC", quantity: 10, pricePerShare: 10, date: "2026-01-01" });
  const holding = (await investmentService.getPortfolioAccounts(portfolio.group.id)).securities[0];
  if (bound) await bindSecurityMarket({ accountId: holding.id, market: "TSX", quoteCurrency: "CAD", expectedMarket: null });
  return holding;
}
const request = (accountId: string, mode: "fill" | "correct" = "fill") => ({ accountId, expectedMarket: "TSX", source: "manual" as const, mode, confirmRawClose: true, points: [{ date: "2026-01-02", price: 12.3456789 }] });
it("exposes unresolved identity and legacy prices without silently assigning or valuing them", async () => {
  const holding = await account(false);
  await investmentService.recordMarketPrice("ABC", 999, "2026-01-02");
  expect(await getSecurityPriceContext({ accountId: holding.id })).toMatchObject({ accountId: holding.id, market: null, currency: "CAD", prices: [], legacyPrices: [{ price: 999 }] });
  await expect(previewSecurityPrices(request(holding.id))).rejects.toThrow(/market/i);
});
it("saves an explicitly reviewed raw close to the account's canonical market without touching legacy prices", async () => {
  const holding = await account(); await investmentService.recordMarketPrice("ABC", 999, "2026-01-02");
  const input = request(holding.id), preview = await previewSecurityPrices(input);
  expect(preview.rows[0]).toMatchObject({ date: "2026-01-02", action: "insert", token: null });
  expect(await saveSecurityPrices({ ...input, expected: preview.rows.map(({ date, price, token }) => ({ date, price, token })) })).toMatchObject({ inserted: 1, corrected: 0 });
  expect((await investmentService.getPositionDetails(holding.id)).marketPrice).toBe(12.3456789);
  expect((await databaseService.prismaClient.securityPriceHistory.findFirstOrThrow()).price).toBe(999);
});
it("requires raw-close confirmation and the market observed during review", async () => {
  const holding = await account(), input = request(holding.id), preview = await previewSecurityPrices(input);
  const expected = preview.rows.map(({ date, price, token }) => ({ date, price, token }));
  await expect(saveSecurityPrices({ ...input, expected, confirmRawClose: false })).rejects.toThrow(/confirm|raw|close/i);
  await expect(saveSecurityPrices({ ...input, expected, expectedMarket: "NASDAQ" })).rejects.toThrow(/market/i);
  expect(await databaseService.prismaClient.securityDailyPrice.count()).toBe(0);
});
it("refuses stale price previews atomically instead of overwriting a later correction", async () => {
  const holding = await account(), input = { ...request(holding.id, "correct"), points: [{ date: "2026-01-02", price: 12 }, { date: "2026-01-03", price: 13 }] };
  const preview = await previewSecurityPrices(input);
  await securityMarketData.write({ identity: { ticker: "ABC", market: "TSX" }, points: [{ date: "2026-01-03", price: 99, priceBasis: "raw", barStatus: "complete" }], source: "manual", mode: "correct" });
  await expect(saveSecurityPrices({ ...input, expected: preview.rows.map(({ date, price, token }) => ({ date, price, token })) })).rejects.toThrow(/changed|preview|review/i);
  expect(await databaseService.prismaClient.securityDailyPrice.count()).toBe(1);
  expect((await databaseService.prismaClient.securityDailyPrice.findFirstOrThrow()).close).toBe(99);
});
it("retains quarantined prices in fill mode and replaces them only through explicit reviewed correction", async () => {
  const holding = await account();
  await databaseService.prismaClient.securityDailyPrice.create({ data: { ticker: "ABC", market: "TSX", marketDate: "2026-01-02", close: 999 } });
  for (const mode of ["fill", "correct"] as const) {
    const input = request(holding.id, mode), preview = await previewSecurityPrices(input);
    expect(preview.rows[0].action).toBe(mode === "fill" ? "retain" : "correct");
    await saveSecurityPrices({ ...input, expected: preview.rows.map(({ date, price, token }) => ({ date, price, token })) });
    expect((await investmentService.getPositionDetails(holding.id)).marketPrice).toBe(mode === "fill" ? null : 12.3456789);
  }
});
it("promotes only explicitly selected legacy records for the chosen holding, preserving the originals", async () => {
  const holding = await account();
  const legacy = await databaseService.prismaClient.securityPriceHistory.create({ data: { tickerSymbol: "ABC", price: 0, date: "2026-01-02", source: "manual" } });
  const other = await investmentService.recordMarketPrice("OTHER", 999, "2026-01-02");
  const input = { accountId: holding.id, expectedMarket: "TSX", source: "legacy" as const, mode: "fill" as const, confirmRawClose: true, legacyIds: [legacy.id] };
  await expect(previewSecurityPrices({ ...input, legacyIds: [legacy.id, other.id] })).rejects.toThrow(/legacy|selected/i);
  const preview = await previewSecurityPrices(input);
  await saveSecurityPrices({ ...input, expected: preview.rows.map(({ date, price, token }) => ({ date, price, token })) });
  expect((await investmentService.getPositionDetails(holding.id)).marketValue).toBe(0);
  expect(await databaseService.prismaClient.securityPriceHistory.count()).toBe(2);
});
it("parses strict dated price CSV records and rejects invalid batches before review", () => {
  expect(parseSecurityPriceCsv('Date,Price\n"1/2/2026",0.123456789\n2026-01-03,0')).toEqual([{ date: "2026-01-02", price: 0.123456789 }, { date: "2026-01-03", price: 0 }]);
  for (const csv of ['Date,Price\n2026-01-02,12bad', 'Date,Price\n2026-02-30,1', 'Date,Price\n2026-01-02,1\n1/2/2026,2']) expect(() => parseSecurityPriceCsv(csv)).toThrow();
});

it("refuses a legacy promotion if its source price changed after preview", async () => {
  const holding = await account(), legacy = await investmentService.recordMarketPrice("ABC", 12, "2026-01-02");
  const input = { accountId: holding.id, expectedMarket: "TSX", source: "legacy" as const, mode: "fill" as const, confirmRawClose: true, legacyIds: [legacy.id] };
  const preview = await previewSecurityPrices(input);
  await databaseService.prismaClient.securityPriceHistory.update({ where: { id: legacy.id }, data: { price: 13 } });
  await expect(saveSecurityPrices({ ...input, expected: preview.rows })).rejects.toThrow(/changed|preview|review/i);
  expect(await databaseService.prismaClient.securityDailyPrice.count()).toBe(0);
});

it("does not let a mismatched account currency replace a shared market's prices", async () => {
  const holding = await account();
  await databaseService.prismaClient.account.update({ where: { id: holding.id }, data: { currency: "USD" } });
  await expect(previewSecurityPrices(request(holding.id))).rejects.toThrow(/currency/i);
});
it("rolls back every price if a later database write fails", async () => {
  const holding = await account(), input = { ...request(holding.id), points: [{ date: "2026-01-02", price: 12 }, { date: "2026-01-03", price: 13 }] };
  const preview = await previewSecurityPrices(input);
  await databaseService.prismaClient.$executeRawUnsafe("CREATE TRIGGER fail_price_control BEFORE INSERT ON SecurityDailyPrice WHEN NEW.marketDate='2026-01-03' BEGIN SELECT RAISE(ABORT,'synthetic price failure'); END");
  try { await expect(saveSecurityPrices({ ...input, expected: preview.rows })).rejects.toThrow(); expect(await databaseService.prismaClient.securityDailyPrice.count()).toBe(0); }
  finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_price_control"); }
});
it("filters discovery to exact ticker listings without assigning the market automatically", async () => {
  const holding = await account(false);
  const candidates = await searchSecurityMarkets(holding.id, () => ({ ok: true, provider: { searchSecuritiesByTicker: async () => [
    { symbol: "OTHER", market: "TSX", quoteCurrency: "CAD", displayName: null },
    { symbol: "ABC", market: "NASDAQ", quoteCurrency: "USD", displayName: null },
    { symbol: "ABC", market: "TSX", quoteCurrency: "CAD", displayName: null },
  ] } as any }));
  expect(candidates).toEqual([{ symbol: "ABC", market: "TSX", quoteCurrency: "CAD", displayName: null }]);
  expect((await getSecurityPriceContext({ accountId: holding.id })).market).toBeNull();
});

it("filters legacy history by normalized calendar dates while retaining the original date strings", async () => {
  const holding = await account();
  await investmentService.recordMarketPrice("ABC", 12, "1/2/2026"); await investmentService.recordMarketPrice("ABC", 13, "1/3/2026");
  const context = await getSecurityPriceContext({ accountId: holding.id, endDate: "2026-01-02" });
  expect(context.legacyPrices).toEqual([expect.objectContaining({ date: "1/2/2026", price: 12 })]);
  expect(context.legacyCount).toBe(1);
  expect(await databaseService.prismaClient.securityPriceHistory.count()).toBe(2);
});

it("excludes an unreliable quote without deleting its value, refuses stale exclusion and permits reviewed restoration", async () => {
  const holding = await account(), input = request(holding.id);
  const preview = await previewSecurityPrices(input); await saveSecurityPrices({ ...input, expected: preview.rows });
  const [point] = (await getSecurityPriceContext({ accountId: holding.id })).prices;
  const exclusion = { accountId: holding.id, expectedMarket: "TSX", priceId: point.id, token: point.token };
  await excludeSecurityPrice(exclusion);
  expect((await investmentService.getPositionDetails(holding.id)).marketPrice).toBeNull();
  expect(await databaseService.prismaClient.securityDailyPrice.findUnique({ where: { id: point.id } })).toMatchObject({ close: 12.3456789, source: "manual", barStatus: "unknown" });
  await expect(excludeSecurityPrice(exclusion)).rejects.toThrow(/changed|review/i);
  const corrected = { ...input, mode: "correct" as const }, reviewed = await previewSecurityPrices(corrected);
  await saveSecurityPrices({ ...corrected, expected: reviewed.rows });
  expect((await investmentService.getPositionDetails(holding.id)).marketPrice).toBe(12.3456789);
});

it("reviews and saves the supported 10000-price import batch atomically", { timeout: 60000 }, async () => {
  const holding = await account();
  const points = Array.from({ length: 10000 }, (_, index) => ({ date: new Date(Date.UTC(1990, 0, index + 1)).toISOString().slice(0, 10), price: 1.23456789 }));
  const input = { ...request(holding.id), source: "import" as const, points }, preview = await previewSecurityPrices(input);
  expect(preview.rows).toHaveLength(10000);
  expect(await saveSecurityPrices({ ...input, expected: preview.rows })).toEqual({ inserted: 10000, corrected: 0, retained: 0 });
  expect(await databaseService.prismaClient.securityDailyPrice.count()).toBe(10000);
  expect((await securityMarketData.latest({ ticker: "ABC", market: "TSX" }))?.price).toBe(1.23456789);
});
