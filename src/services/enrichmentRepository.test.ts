import { beforeEach, describe, expect, it } from "vitest";
import { databaseService } from "./database";
import { enrichmentRepository } from "./enrichmentRepository";

describe("enrichmentRepository", () => {
  beforeEach(async () => {
    await databaseService.resetAllData();
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
        { marketDate: "2024-01-01", close: 100 },
        { marketDate: "2024-01-02", close: 101 },
      ]
    );

    await enrichmentRepository.insertMissingSecurityDailyPrices(
      { ticker: "AAPL", market: "NASDAQ" },
      [
        { marketDate: "2024-01-02", close: 999 },
        { marketDate: "2024-01-03", close: 102 },
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
      [{ marketDate: "2024-01-04", close: 190 }]
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
