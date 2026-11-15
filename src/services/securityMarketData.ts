import { type SecurityIdentity, parseSecurityIdentity } from "../shared/securityMarket";
import { parseToStandardDate } from "../shared/dateUtils";
import { databaseService } from "./database";
import { verifyPricePolicy, type SecurityPricePolicy } from "./securityPricePolicy";
import { resolveValuationDate } from "./valuationDate";
import { readUnsignedDecimal } from "./journalPrecision";
import type { Prisma } from "@prisma/client";

export type CanonicalSecurityPrice = { date: string; price: number; source: string };
type Write = { identity: SecurityIdentity; points: Array<{ date: string; price: number } & SecurityPricePolicy>; mode: "fill" | "correct"; source: "manual" | "import" | "provider" };
function date(value: unknown): string {
  const normalized = typeof value === "string" && value.length <= 64 ? parseToStandardDate(value) : null;
  if (!normalized) throw new Error("Invalid security price date");
  return normalized;
}
export function readSecurityClose(row: { close: number; closeDecimal: string | null }): number {
  return readUnsignedDecimal(row.closeDecimal ?? row.close);
}
function point(row: { marketDate: string; close: number; closeDecimal: string | null; source: string }): CanonicalSecurityPrice {
  const price = readSecurityClose(row);
  if (date(row.marketDate) !== row.marketDate || !Number.isFinite(price) || price < 0) throw new Error("Invalid stored security price");
  return { date: row.marketDate, price, source: row.source };
}

/** SecurityDailyPrice is the only price source. Never infer a market or fall back to ticker-only history. */
export const securityMarketData = {
  async latest(identity: SecurityIdentity, asOfDate?: string, tx: Prisma.TransactionClient = databaseService.prismaClient): Promise<CanonicalSecurityPrice | null> {
    const key = parseSecurityIdentity(identity), cutoff = resolveValuationDate(asOfDate);
    const row = await tx.securityDailyPrice.findFirst({
      where: { ...key, priceBasis: "raw", barStatus: "complete", marketDate: { lte: cutoff } }, orderBy: { marketDate: "desc" },
    });
    return row ? point(row) : null;
  },
  async history(identity: SecurityIdentity, startDate?: string, endDate?: string): Promise<CanonicalSecurityPrice[]> {
    const key = parseSecurityIdentity(identity), start = startDate === undefined ? undefined : date(startDate), end = endDate === undefined ? undefined : date(endDate);
    if (start && end && start > end) throw new Error("Invalid security price date range");
    return (await databaseService.prismaClient.securityDailyPrice.findMany({
      where: { ...key, priceBasis: "raw", barStatus: "complete", marketDate: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }, orderBy: { marketDate: "asc" },
    })).map(point);
  },
  async write(input: Write, transaction?: Prisma.TransactionClient): Promise<{ inserted: number; corrected: number; retained: number }> {
    if (!input || !["fill", "correct"].includes(input.mode) || !["manual", "import", "provider"].includes(input.source)) throw new Error("An explicit price mode and source policy are required");
    if (input.source === "provider" && input.mode !== "fill") throw new Error("Provider policy permits fill only; correction must be explicit manual or import work");
    const key = parseSecurityIdentity(input.identity);
    if (!Array.isArray(input.points) || !input.points.length || input.points.length > 10000) throw new Error("Supply between 1 and 10000 security price points");
    const points = input.points.map((row) => {
      if (!row || typeof row.price !== "number" || !Number.isFinite(row.price) || row.price < 0) throw new Error("Security price must be finite and non-negative");
      const policy = verifyPricePolicy(row);
      if (input.source !== "provider" && policy.priceBasis !== "raw") throw new Error("Manual/import valuation prices must explicitly use raw prices");
      return { marketDate: date(row.date), close: row.price, closeDecimal: row.price.toString(), ...policy };
    });
    if (new Set(points.map((row) => row.marketDate)).size !== points.length) throw new Error("Duplicate security price dates in one batch");
    const write = async (tx: Prisma.TransactionClient) => {
      const result = { inserted: 0, corrected: 0, retained: 0 };
      for (const row of points) {
        const where = { ticker_market_marketDate: { ...key, marketDate: row.marketDate } };
        const existing = await tx.securityDailyPrice.findUnique({ where });
        if (existing) {
          if (input.mode === "fill") { result.retained++; continue; }
          await tx.securityDailyPrice.update({ where, data: { ...row, source: input.source, fetchedAt: new Date() } }); result.corrected++;
        } else {
          await tx.securityDailyPrice.create({ data: { ...key, ...row, source: input.source } }); result.inserted++;
        }
      }
      return result;
    };
    return transaction ? write(transaction) : databaseService.prismaClient.$transaction(write, { timeout: 30000 });
  },
};
