import { resetTestDatabase } from "./database.test.utils";
import { beforeEach, describe, expect, it } from "vitest";
import { databaseService } from "./database";
import { enrichmentRepository } from "./enrichmentRepository";
import { securityMarketData } from "./securityMarketData";

describe("enrichmentRepository", () => {
  it("reports retained unverified prices so provider fill cannot claim valuation readiness", async () => {
    const key = { ticker: "ABC", market: "NASDAQ" };
    await databaseService.prismaClient.securityDailyPrice.create({ data: { ...key, marketDate: "2024-01-02", close: 50 } });
    expect(await enrichmentRepository.insertMissingSecurityDailyPrices(key, [{ marketDate: "2024-01-02", close: 100, priceBasis: "raw", barStatus: "complete" }])).toMatchObject({ unavailable: 1 });
    expect((await databaseService.prismaClient.securityDailyPrice.findFirstOrThrow()).close).toBe(50);
  });
  it("does not advance provider refresh coverage with manual points or future provider dates", async () => {
    const key = { ticker: "ABC", market: "NASDAQ" };
    await enrichmentRepository.insertMissingSecurityDailyPrices(key, [{ marketDate: "2024-01-02", close: 10, priceBasis: "raw" as const, barStatus: "complete" as const }]);
    await securityMarketData.write({ identity: key, points: [{ date: "2024-01-05", price: 12, priceBasis: "raw" as const, barStatus: "complete" as const }], mode: "fill", source: "manual" });
    await databaseService.prismaClient.securityDailyPrice.create({ data: { ...key, marketDate: "2999-01-01", close: 999, source: "provider" } });
    expect(await enrichmentRepository.getLatestSecurityPriceDate(key)).toBe("2024-01-02");
  });
  it("rolls back all provider points on a later database failure", async () => {
    await databaseService.prismaClient.$executeRawUnsafe(`CREATE TRIGGER fail_provider_point BEFORE INSERT ON SecurityDailyPrice
      WHEN NEW.marketDate = '2024-01-03' BEGIN SELECT RAISE(ABORT, 'synthetic provider storage failure'); END`);
    try {
      await expect(enrichmentRepository.insertMissingSecurityDailyPrices({ ticker: "ABC", market: "NASDAQ" }, [
        { marketDate: "2024-01-02", close: 10, priceBasis: "raw" as const, barStatus: "complete" as const }, { marketDate: "2024-01-03", close: 11, priceBasis: "raw" as const, barStatus: "complete" as const },
      ])).rejects.toThrow();
      expect(await databaseService.prismaClient.securityDailyPrice.count()).toBe(0);
    } finally { await databaseService.prismaClient.$executeRawUnsafe("DROP TRIGGER fail_provider_point"); }
  });
  it("refuses a conflicting stored quote currency without replacing metadata", async () => {
    const input = { ticker: "ABC", market: "NASDAQ", quoteCurrency: "USD", displayName: null, assetType: null };
    await enrichmentRepository.upsertSecurityMetadataFillMissing(input);
    await expect(enrichmentRepository.upsertSecurityMetadataFillMissing({ ...input, quoteCurrency: "CAD" })).rejects.toThrow(/currency/i);
    expect((await databaseService.prismaClient.securityMetadata.findFirstOrThrow()).quoteCurrency).toBe("USD");
  });
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("fills missing metadata fields without overwriting existing non-null values", async () => {
    await enrichmentRepository.upsertSecurityMetadataFillMissing({
      ticker: "AAPL",
      market: "NASDAQ",
      displayName: "Apple Inc.",
      assetType: null,
      quoteCurrency: null,
    });

    await enrichmentRepository.upsertSecurityMetadataFillMissing({
      ticker: "AAPL",
      market: "NASDAQ",
      displayName: "Apple Incorporated",
      assetType: "EQUITY",
      quoteCurrency: "USD",
    });

    const metadata = await databaseService.prismaClient.securityMetadata.findUnique({
      where: {
        ticker_market: {
          ticker: "AAPL",
          market: "NASDAQ",
        },
      },
    });

    expect(metadata?.displayName).toBe("Apple Inc.");
    expect(metadata?.assetType).toBe("EQUITY");
    expect(metadata?.quoteCurrency).toBe("USD");
  });

  it("inserts missing security price points only and keeps existing values immutable", async () => {
    await enrichmentRepository.insertMissingSecurityDailyPrices(
      { ticker: "AAPL", market: "NASDAQ" },
      [
        { marketDate: "2024-01-01", close: 100, priceBasis: "raw" as const, barStatus: "complete" as const },
        { marketDate: "2024-01-02", close: 101, priceBasis: "raw" as const, barStatus: "complete" as const },
      ]
    );

    await enrichmentRepository.insertMissingSecurityDailyPrices(
      { ticker: "AAPL", market: "NASDAQ" },
      [
        { marketDate: "2024-01-02", close: 999, priceBasis: "raw" as const, barStatus: "complete" as const },
        { marketDate: "2024-01-03", close: 102, priceBasis: "raw" as const, barStatus: "complete" as const },
      ]
    );

    const points = await databaseService.prismaClient.securityDailyPrice.findMany({
      where: {
        ticker: "AAPL",
        market: "NASDAQ",
      },
      orderBy: {
        marketDate: "asc",
      },
    });

    expect(points.map((point) => [point.marketDate, point.close])).toEqual([
      ["2024-01-01", 100],
      ["2024-01-02", 101],
      ["2024-01-03", 102],
    ]);
  });

  it("inserts missing fx points only and keeps existing values immutable", async () => {
    await enrichmentRepository.insertMissingFxDailyRates(
      { sourceCurrency: "CAD", targetCurrency: "USD" },
      [
        { marketDate: "2024-01-01", rate: 1.35 },
        { marketDate: "2024-01-02", rate: 1.36 },
      ]
    );

    await enrichmentRepository.insertMissingFxDailyRates(
      { sourceCurrency: "CAD", targetCurrency: "USD" },
      [
        { marketDate: "2024-01-02", rate: 2.0 },
        { marketDate: "2024-01-03", rate: 1.37 },
      ]
    );

    const points = await databaseService.prismaClient.fxDailyRate.findMany({
      where: {
        sourceCurrency: "CAD",
        targetCurrency: "USD",
      },
      orderBy: {
        marketDate: "asc",
      },
    });

    expect(points.map((point) => [point.marketDate, point.rate])).toEqual([
      ["2024-01-01", 1.35],
      ["2024-01-02", 1.36],
      ["2024-01-03", 1.37],
    ]);
  });

  it("returns latest points and freshness timestamps by category", async () => {
    await enrichmentRepository.upsertSecurityMetadataFillMissing({
      ticker: "AAPL",
      market: "NASDAQ",
      displayName: "Apple Inc.",
      assetType: "EQUITY",
      quoteCurrency: "USD",
    });

    await enrichmentRepository.insertMissingSecurityDailyPrices(
      { ticker: "AAPL", market: "NASDAQ" },
      [{ marketDate: "2024-01-04", close: 190, priceBasis: "raw" as const, barStatus: "complete" as const }]
    );

    await enrichmentRepository.insertMissingFxDailyRates(
      { sourceCurrency: "CAD", targetCurrency: "USD" },
      [{ marketDate: "2024-01-05", rate: 1.34 }]
    );

    const latestPriceDate = await enrichmentRepository.getLatestSecurityPriceDate({
      ticker: "AAPL",
      market: "NASDAQ",
    });
    const latestFxDate = await enrichmentRepository.getLatestFxRateDate({
      sourceCurrency: "CAD",
      targetCurrency: "USD",
    });
    const freshness = await enrichmentRepository.getCategoryFreshness();

    expect(latestPriceDate).toBe("2024-01-04");
    expect(latestFxDate).toBe("2024-01-05");
    expect(freshness.metadata).toBeTruthy();
    expect(freshness.prices).toBeTruthy();
    expect(freshness.fx).toBeTruthy();
  });
});
