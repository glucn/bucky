import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { databaseService } from "./database";
import { parseSecurityIdentity } from "../shared/securityMarket";
import { parseToStandardDate } from "../shared/dateUtils";
import type { PriceRequest, PricePreviewRow } from "../shared/securityPrices";
import { securityMarketData } from "./securityMarketData";
import { resolveValuationDate } from "./valuationDate";
import { resolveConfiguredEnrichmentProvider } from "./enrichmentRuntimeService";

async function holding(tx: Prisma.TransactionClient, id: string) {
  if (typeof id !== "string" || !id || id.length > 128) throw new Error("Invalid security account");
  const account = await tx.account.findUnique({ where: { id }, include: { investmentProperties: true } });
  if (!account?.investmentProperties || !account.groupId) throw new Error("Portfolio security account not found");
  return account;
}
const token = (row: any): string | null => row ? createHash("sha256").update(JSON.stringify([row.id, row.close, row.source, row.priceBasis, row.barStatus, row.basisAsOf, row.fetchedAt])).digest("hex") : null;

export async function searchSecurityMarkets(accountId: string, resolve = resolveConfiguredEnrichmentProvider) {
  const account = await holding(databaseService.prismaClient, accountId), ticker = account.investmentProperties!.tickerSymbol;
  const result = resolve(); if (!result.ok) throw new Error(result.message);
  const candidates = await result.provider.searchSecuritiesByTicker(ticker), seen = new Set<string>();
  return candidates.filter((candidate) => {
    try {
      const key = parseSecurityIdentity({ ticker: candidate.symbol, market: candidate.market });
      if (key.ticker !== ticker || seen.has(key.market) || (candidate.quoteCurrency && candidate.quoteCurrency !== account.currency)) return false;
      seen.add(key.market); return true;
    } catch { return false; }
  }).slice(0, 30);
}

export async function getSecurityPriceContext(input: { accountId: string; endDate?: string }) {
  return databaseService.prismaClient.$transaction(async (tx) => {
    const account = await holding(tx, input?.accountId), props = account.investmentProperties!;
    const end = input.endDate === undefined || input.endDate === "" ? undefined : resolveValuationDate(input.endDate);
    const where = props.market ? { ...parseSecurityIdentity({ ticker: props.tickerSymbol, market: props.market }), ...(end ? { marketDate: { lte: end } } : {}) } : null;
    const prices = where ? await tx.securityDailyPrice.findMany({ where, orderBy: { marketDate: "desc" }, take: 200 }) : [];
    // Retained legacy dates were not normalized by the old entry API. Compare calendar dates
    // for review without rewriting the user's originals or treating malformed dates as prices.
    const legacyPrices = (await tx.securityPriceHistory.findMany({ where: { tickerSymbol: props.tickerSymbol } }))
      .map(({ id, date, price, source }) => ({ id, date, price, source, normalizedDate: parseToStandardDate(date) }))
      .filter((row) => !end || row.normalizedDate === null || row.normalizedDate <= end)
      .sort((a, b) => (b.normalizedDate || "9999-99-99").localeCompare(a.normalizedDate || "9999-99-99") || a.id.localeCompare(b.id));
    return { accountId: account.id, ticker: props.tickerSymbol, market: props.market, currency: account.currency, hasTrackedHistory: props.hasCompleteActivityHistory,
      prices: prices.map((row) => ({ id: row.id, date: row.marketDate, price: row.close, source: row.source, priceBasis: row.priceBasis, barStatus: row.barStatus, basisAsOf: row.basisAsOf, token: token(row) })),
      legacyPrices: legacyPrices.slice(0, 200),
      priceCount: where ? await tx.securityDailyPrice.count({ where }) : 0, legacyCount: legacyPrices.length,
    };
  });
}

export async function excludeSecurityPrice(input: { accountId: string; expectedMarket: string; priceId: string; token: string | null }) {
  return databaseService.prismaClient.$transaction(async (tx) => {
    const account = await holding(tx, input?.accountId), props = account.investmentProperties!;
    if (!props.market || props.market !== input.expectedMarket) throw new Error("Market changed; review the holding first");
    const identity = parseSecurityIdentity({ ticker: props.tickerSymbol, market: props.market });
    const metadata = await tx.securityMetadata.findUnique({ where: { ticker_market: identity } });
    if (metadata?.quoteCurrency && metadata.quoteCurrency !== account.currency) throw new Error("Market quote currency conflicts with this holding");
    if (typeof input.priceId !== "string" || typeof input.token !== "string") throw new Error("Review the stored price before excluding it");
    const point = await tx.securityDailyPrice.findFirst({ where: { id: input.priceId, ...identity } });
    if (!point || token(point) !== input.token) throw new Error("Price changed; review its current record before excluding it");
    await tx.securityDailyPrice.update({ where: { id: point.id }, data: { barStatus: "unknown", fetchedAt: new Date() } });
    return { excluded: 1 };
  });
}

async function review(tx: Prisma.TransactionClient, input: PriceRequest) {
  if (!input || !["manual", "import", "legacy"].includes(input.source) || !["fill", "correct"].includes(input.mode)) throw new Error("Select price source and fill/correction policy");
  const account = await holding(tx, input.accountId), props = account.investmentProperties!;
  if (!props.market || props.market !== input.expectedMarket) throw new Error("Market changed or is unresolved; review the holding's market first");
  const identity = parseSecurityIdentity({ ticker: props.tickerSymbol, market: props.market });
  const metadata = await tx.securityMetadata.findUnique({ where: { ticker_market: identity } });
  if (metadata?.quoteCurrency && metadata.quoteCurrency !== account.currency) throw new Error("Stored market quote currency conflicts with this holding; review its identity before changing shared prices");
  let points = input.points;
  if (input.source === "legacy") {
    if (!Array.isArray(input.legacyIds) || !input.legacyIds.length || input.legacyIds.length > 10000 || input.legacyIds.some((id) => typeof id !== "string") || new Set(input.legacyIds).size !== input.legacyIds.length) throw new Error("Select valid legacy records explicitly");
    const selected = await tx.securityPriceHistory.findMany({ where: { id: { in: input.legacyIds }, tickerSymbol: props.tickerSymbol } });
    if (selected.length !== input.legacyIds.length) throw new Error("A selected legacy record is missing or belongs to another ticker");
    points = selected.map(({ date, price }) => ({ date, price }));
  }
  if (!Array.isArray(points) || !points.length || points.length > 10000) throw new Error("Supply 1 to 10000 price records");
  const seen = new Set<string>(), cutoff = resolveValuationDate(), rows: PricePreviewRow[] = [];
  for (const point of points) {
    const date = point && typeof point.date === "string" ? parseToStandardDate(point.date) : null;
    if (!date || date > cutoff || typeof point.price !== "number" || !Number.isFinite(point.price) || point.price < 0 || seen.has(date)) throw new Error("Prices need unique valid dates, finite nonnegative values, and a completed book day");
    seen.add(date);
    const existing = await tx.securityDailyPrice.findUnique({ where: { ticker_market_marketDate: { ...identity, marketDate: date } } });
    rows.push({ date, price: point.price, token: token(existing), action: existing ? input.mode === "fill" ? "retain" : "correct" : "insert",
      existing: existing ? { price: existing.close, source: existing.source, priceBasis: existing.priceBasis, barStatus: existing.barStatus } : null });
  }
  return { identity, rows };
}
export async function previewSecurityPrices(input: PriceRequest) {
  return databaseService.prismaClient.$transaction((tx) => review(tx, input), { timeout: 30000 });
}
export async function saveSecurityPrices(input: PriceRequest & { expected: Array<{ date: string; price: number; token: string | null }> }) {
  if (input?.confirmRawClose !== true) throw new Error("Confirm these are unadjusted completed closing prices in this holding's currency");
  return databaseService.prismaClient.$transaction(async (tx) => {
    const { identity, rows } = await review(tx, input);
    if (!Array.isArray(input.expected) || input.expected.length !== rows.length || input.expected.some((row) => !row || typeof row.date !== "string" || typeof row.price !== "number" || !(row.token === null || typeof row.token === "string"))) throw new Error("Review the price preview before saving");
    const expected = new Map(input.expected.map((row) => [row.date, row]));
    if (expected.size !== rows.length || rows.some((row) => expected.get(row.date)?.token !== row.token || expected.get(row.date)?.price !== row.price)) throw new Error("Prices changed or preview is missing. Review the prices again before saving");
    return securityMarketData.write({ identity, points: rows.map(({ date, price }) => ({ date, price, priceBasis: "raw", barStatus: "complete" })), mode: input.mode, source: input.source === "manual" ? "manual" : "import" }, tx);
  }, { timeout: 30000 });
}
