import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { securityMarketData } from "./securityMarketData";
import { enrichmentRepository } from "./enrichmentRepository";

const identity = { ticker: "ABC", market: "NASDAQ" };
beforeEach(resetTestDatabase);

it("values the exact canonical market without any legacy price rows and never reads a future date", async () => {
  await enrichmentRepository.insertMissingSecurityDailyPrices(identity, [
    { marketDate: "2026-01-02", close: 12.345678 }, { marketDate: "2026-01-05", close: 14 }, { marketDate: "2999-01-01", close: 900 },
  ]);
  await enrichmentRepository.insertMissingSecurityDailyPrices({ ticker: "ABC", market: "LSE" }, [{ marketDate: "2026-01-04", close: 999 }]);
  expect(await databaseService.prismaClient.securityPriceHistory.count()).toBe(0);
  expect(await securityMarketData.latest(identity, "2026-01-04")).toMatchObject({ date: "2026-01-02", price: 12.345678, source: "provider" });
  expect(await securityMarketData.latest(identity)).toMatchObject({ date: "2026-01-05", price: 14 });
  expect(await securityMarketData.latest(identity, "2026-01-01")).toBeNull();
});

it("does not use conflicting legacy prices, another market, or a missing market as a fallback", async () => {
  await databaseService.prismaClient.securityPriceHistory.create({ data: { tickerSymbol: "ABC", date: "2026-01-02", price: 888 } });
  await enrichmentRepository.insertMissingSecurityDailyPrices({ ticker: "ABC", market: "LSE" }, [{ marketDate: "2026-01-02", close: 999 }]);
  expect(await securityMarketData.latest(identity, "2026-01-02")).toBeNull();
  await expect(securityMarketData.latest({ ticker: "ABC", market: "UNKNOWN" })).rejects.toThrow(/market/i);
  expect(await databaseService.prismaClient.securityPriceHistory.count()).toBe(1);
});

it("retains existing daily points until correction is explicit, and refresh cannot overwrite a correction", async () => {
  await enrichmentRepository.insertMissingSecurityDailyPrices(identity, [{ marketDate: "2026-01-02", close: 10 }]);
  const points = [{ date: "2026-01-02", price: 11 }, { date: "2026-01-03", price: 12 }];
  expect(await securityMarketData.write({ identity, points, mode: "fill", source: "import" })).toEqual({ inserted: 1, corrected: 0, retained: 1 });
  expect(await securityMarketData.latest(identity, "2026-01-02")).toMatchObject({ price: 10, source: "provider" });
  expect(await securityMarketData.write({ identity, points: points.slice(0, 1), mode: "correct", source: "manual" })).toEqual({ inserted: 0, corrected: 1, retained: 0 });
  await enrichmentRepository.insertMissingSecurityDailyPrices(identity, [{ marketDate: "2026-01-02", close: 999 }]);
  expect(await securityMarketData.history(identity, "2026-01-02", "2026-01-03")).toEqual([
    { date: "2026-01-02", price: 11, source: "manual" }, { date: "2026-01-03", price: 12, source: "import" },
  ]);
});

it("keeps zero prices and precision, normalizes dates, and isolates history by market", async () => {
  await securityMarketData.write({ identity, points: [{ date: "1/2/2026", price: 0 }, { date: "20260103", price: 0.123456789 }], mode: "fill", source: "manual" });
  await securityMarketData.write({ identity: { ...identity, market: "LSE" }, points: [{ date: "2026-01-03", price: 99 }], mode: "fill", source: "manual" });
  expect(await securityMarketData.history(identity)).toEqual([
    { date: "2026-01-02", price: 0, source: "manual" }, { date: "2026-01-03", price: 0.123456789, source: "manual" },
  ]);
});

it.each([NaN, Infinity, -1, "12"])("rejects invalid price %j before any batch write", async (price) => {
  await expect(securityMarketData.write({ identity, points: [{ date: "2026-01-02", price: 10 }, { date: "2026-01-03", price: price as number }], mode: "fill", source: "import" })).rejects.toThrow(/price/i);
  expect(await databaseService.prismaClient.securityDailyPrice.count()).toBe(0);
});

it("rejects invalid/duplicate dates and ambiguous write policy without partial writes", async () => {
  for (const points of [[{ date: "2026-02-30", price: 1 }], [{ date: "2026-01-02", price: 1 }, { date: "1/2/2026", price: 2 }]]) {
    await expect(securityMarketData.write({ identity, points, mode: "fill", source: "import" })).rejects.toThrow(/date/i);
  }
  await expect(securityMarketData.write({ identity, points: [{ date: "2026-01-02", price: 1 }] } as any)).rejects.toThrow(/mode|policy/i);
  await expect(securityMarketData.history(identity, "2026-01-03", "2026-01-02")).rejects.toThrow(/range/i);
  expect(await databaseService.prismaClient.securityDailyPrice.count()).toBe(0);
});

it("rolls back an entire canonical import when a later SQLite write fails", async () => {
  await databaseService.prismaClient.$executeRawUnsafe(`CREATE TRIGGER fail_security_price BEFORE INSERT ON SecurityDailyPrice
    WHEN NEW.marketDate = '2026-01-03' BEGIN SELECT RAISE(ABORT, 'synthetic price failure'); END`);
  try {
    await expect(securityMarketData.write({ identity, points: [{ date: "2026-01-02", price: 1 }, { date: "2026-01-03", price: 2 }], mode: "fill", source: "import" })).rejects.toThrow();
    expect(await databaseService.prismaClient.securityDailyPrice.count()).toBe(0);
  } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_security_price"); }
});
