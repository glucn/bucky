import { type SecurityIdentity, parseSecurityIdentity } from "../shared/securityMarket";
import { parseToStandardDate } from "../shared/dateUtils";
import { databaseService } from "./database";

export type CanonicalSecurityPrice = { date: string; price: number; source: string };
type Write = { identity: SecurityIdentity; points: Array<{ date: string; price: number }>; mode: "fill" | "correct"; source: "manual" | "import" };
function date(value: unknown): string {
  const normalized = typeof value === "string" && value.length <= 64 ? parseToStandardDate(value) : null;
  if (!normalized) throw new Error("Invalid security price date");
  return normalized;
}
function point(row: { marketDate: string; close: number; source: string }): CanonicalSecurityPrice {
  if (date(row.marketDate) !== row.marketDate || !Number.isFinite(row.close) || row.close < 0) throw new Error("Invalid stored security price");
  return { date: row.marketDate, price: row.close, source: row.source };
}

/** SecurityDailyPrice is the only price source. Never infer a market or fall back to ticker-only history. */
export const securityMarketData = {
  async latest(identity: SecurityIdentity, asOfDate = parseToStandardDate(new Date())!): Promise<CanonicalSecurityPrice | null> {
    const key = parseSecurityIdentity(identity), cutoff = date(asOfDate);
    const row = await databaseService.prismaClient.securityDailyPrice.findFirst({
      where: { ...key, marketDate: { lte: cutoff } }, orderBy: { marketDate: "desc" },
    });
    return row ? point(row) : null;
  },
  async history(identity: SecurityIdentity, startDate?: string, endDate?: string): Promise<CanonicalSecurityPrice[]> {
    const key = parseSecurityIdentity(identity), start = startDate === undefined ? undefined : date(startDate), end = endDate === undefined ? undefined : date(endDate);
    if (start && end && start > end) throw new Error("Invalid security price date range");
    return (await databaseService.prismaClient.securityDailyPrice.findMany({
      where: { ...key, marketDate: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }, orderBy: { marketDate: "asc" },
    })).map(point);
  },
  async write(input: Write): Promise<{ inserted: number; corrected: number; retained: number }> {
    if (!input || !["fill", "correct"].includes(input.mode) || !["manual", "import"].includes(input.source)) throw new Error("An explicit price mode and source policy are required");
    const key = parseSecurityIdentity(input.identity);
    if (!Array.isArray(input.points) || !input.points.length || input.points.length > 10000) throw new Error("Supply between 1 and 10000 security price points");
    const points = input.points.map((row) => {
      if (!row || typeof row.price !== "number" || !Number.isFinite(row.price) || row.price < 0) throw new Error("Security price must be finite and non-negative");
      return { marketDate: date(row.date), close: row.price };
    });
    if (new Set(points.map((row) => row.marketDate)).size !== points.length) throw new Error("Duplicate security price dates in one batch");
    return databaseService.prismaClient.$transaction(async (tx) => {
      const result = { inserted: 0, corrected: 0, retained: 0 };
      for (const row of points) {
        const where = { ticker_market_marketDate: { ...key, marketDate: row.marketDate } };
        const existing = await tx.securityDailyPrice.findUnique({ where });
        if (existing) {
          if (input.mode === "fill") { result.retained++; continue; }
          await tx.securityDailyPrice.update({ where, data: { close: row.close, source: input.source, fetchedAt: new Date() } }); result.corrected++;
        } else {
          await tx.securityDailyPrice.create({ data: { ...key, ...row, source: input.source } }); result.inserted++;
        }
      }
      return result;
    });
  },
};
