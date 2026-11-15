import { afterEach, describe, expect, it, vi } from "vitest";
import { createValuationConversionService, valuationConversionService } from "./valuationConversionService";
import { databaseService } from "./database";
import { enrichmentRepository } from "./enrichmentRepository";
import { resetTestDatabase } from "./database.test.utils";
import { createTwelveDataEnrichmentProvider } from "./providers/twelveDataEnrichmentProvider";

describe("valuationConversionService", () => {
  it("rounds direct and inverse conversions from decimal ratios at the cent boundary", async () => {
    const asOfDate = "2026-01-03";
    const service = createValuationConversionService({ findFxRates: async () => [
      { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: asOfDate, rate: 1.005, rateDecimal: "1.005" },
      { sourceCurrency: "USD", targetCurrency: "EUR", marketDate: asOfDate, rate: 2, rateDecimal: "2" },
      { sourceCurrency: "USD", targetCurrency: "GBP", marketDate: asOfDate, rate: 1.005, rateDecimal: "1.00499999999999999999" },
    ] });
    expect(await service.convertAmount({ amount: 1, sourceCurrency: "USD", targetCurrency: "CAD", asOfDate, roundToCents: true }))
      .toMatchObject({ convertedAmount: 1.01, rate: 1.005 });
    expect(await service.convertAmount({ amount: -2.01, sourceCurrency: "EUR", targetCurrency: "USD", asOfDate, roundToCents: true }))
      .toMatchObject({ convertedAmount: -1.01, rate: 0.5 });
    expect(await service.convertAmount({ amount: 1, sourceCurrency: "USD", targetCurrency: "GBP", asOfDate, roundToCents: true }))
      .toMatchObject({ convertedAmount: 1, rate: 1.005 });
  });
  it("persists and reads the decimal rate for both conversion directions", async () => {
    await resetTestDatabase();
    const pair = { sourceCurrency: "USD", targetCurrency: "CAD" };
    const marketDate = "2026-01-02";
    await enrichmentRepository.insertMissingFxDailyRates(pair, [{ marketDate, rate: 1.25 }]);
    const db = databaseService.prismaClient;
    const stored = await db.fxDailyRate.findFirstOrThrow();
    expect(stored).toMatchObject({ rateDecimal: "1.25" });
    await db.fxDailyRate.update({ where: { id: stored.id }, data: { rate: 99 } });
    const asOfDate = "2026-01-03";
    expect(await valuationConversionService.convertAmount({ ...pair, amount: 8, asOfDate }))
      .toMatchObject({ convertedAmount: 10, rate: 1.25, source: "as_of" });
    expect(await valuationConversionService.convertAmount({ sourceCurrency: "CAD", targetCurrency: "USD", amount: 10, asOfDate }))
      .toMatchObject({ convertedAmount: 8, rate: 0.8, source: "as_of" });
  });
  it("normalizes supported dates before selecting the canonical as-of rate", async () => {
    const service = createValuationConversionService({ findFxRates: async () => [
      { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-02", rate: 1.3 },
      { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-04", rate: 1.4 },
    ] });
    expect(await service.convertAmount({ amount: 100, sourceCurrency: "USD", targetCurrency: "CAD", asOfDate: "1/3/2026" })).toMatchObject({ convertedAmount: 130, source: "as_of" });
  });
  it("retains the provider's decimal through ingestion and cent rounding", async () => {
    await resetTestDatabase();
    const pair = { sourceCurrency: "USD", targetCurrency: "CAD" };
    const marketDate = "2026-01-02", rateDecimal = "1.00499999999999999999";
    const provider = createTwelveDataEnrichmentProvider("synthetic-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      values: [{ datetime: marketDate, close: rateDecimal }],
    })));
    const points = await provider.fetchFxDailyRates({ ...pair, startDate: marketDate, endDate: marketDate });
    await enrichmentRepository.insertMissingFxDailyRates(pair, points);
    expect(await databaseService.prismaClient.fxDailyRate.findFirstOrThrow()).toMatchObject({ rate: 1.005, rateDecimal });
    expect(await valuationConversionService.convertAmount({ ...pair, amount: 1, asOfDate: marketDate, roundToCents: true }))
      .toMatchObject({ rate: 1.005, convertedAmount: 1 });
  });
  it("returns a known zero without querying rates or inventing a cross-currency rate", async () => {
    const findFxRates = vi.fn(async () => []), service = createValuationConversionService({ findFxRates });
    expect(await service.convertAmount({ amount: 0, sourceCurrency: "USD", targetCurrency: "CAD", asOfDate: "2026-01-03" })).toEqual({ convertedAmount: 0, rate: null, source: "zero_amount", pair: null });
    expect(findFxRates).not.toHaveBeenCalled();
  });
  it("ignores non-finite rates and invalid stored calendar dates instead of poisoning an earlier valid quote", async () => {
    const service = createValuationConversionService({ findFxRates: async () => [
      { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-01-02", rate: 1.3 },
      { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-02-30", rate: 99 },
      { sourceCurrency: "USD", targetCurrency: "CAD", marketDate: "2026-03-01", rate: Infinity },
    ] });
    expect(await service.convertAmount({ amount: 100, sourceCurrency: "USD", targetCurrency: "CAD", asOfDate: "2026-03-02" })).toMatchObject({ convertedAmount: 130, source: "as_of" });
  });
  it("validates amount, currencies and calendar date even for same-currency or zero conversions", async () => {
    const service = createValuationConversionService();
    const valid = { amount: 0, sourceCurrency: "USD", targetCurrency: "USD", asOfDate: "2026-01-03" };
    for (const invalid of [{ amount: NaN }, { amount: Infinity }, { sourceCurrency: "usd" }, { asOfDate: "2026-02-30" }]) await expect(service.convertAmount({ ...valid, ...invalid })).rejects.toThrow(/amount|currency|date/i);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses as-of date rate first", async () => {
    const valuationConversionService = createValuationConversionService({
      findFxRates: async () => [
        {
          sourceCurrency: "USD",
          targetCurrency: "CAD",
          marketDate: "2026-02-01",
          rate: 1.3,
        },
        {
          sourceCurrency: "USD",
          targetCurrency: "CAD",
          marketDate: "2026-02-10",
          rate: 1.4,
        },
      ],
    });

    const result = await valuationConversionService.convertAmount({
      amount: 100,
      sourceCurrency: "USD",
      targetCurrency: "CAD",
      asOfDate: "2026-02-05",
    });

    expect(result).toEqual({
      convertedAmount: 130,
      rate: 1.3,
      source: "as_of",
      pair: "USD->CAD",
    });
  });

  it("falls back to latest rate when as-of rate unavailable", async () => {
    const valuationConversionService = createValuationConversionService({
      findFxRates: async () => [
        {
          sourceCurrency: "USD",
          targetCurrency: "CAD",
          marketDate: "2026-02-10",
          rate: 1.4,
        },
      ],
    });

    const result = await valuationConversionService.convertAmount({
      amount: 100,
      sourceCurrency: "USD",
      targetCurrency: "CAD",
      asOfDate: "2026-02-01",
    });

    expect(result).toEqual({
      convertedAmount: 140,
      rate: 1.4,
      source: "latest_fallback",
      pair: "USD->CAD",
    });
  });

  it("returns 1.0 for same-currency conversions", async () => {
    const valuationConversionService = createValuationConversionService();
    const result = await valuationConversionService.convertAmount({
      amount: 100,
      sourceCurrency: "CAD",
      targetCurrency: "CAD",
      asOfDate: "2026-02-05",
    });

    expect(result).toEqual({
      convertedAmount: 100,
      rate: 1,
      source: "same_currency",
      pair: null,
    });
  });

  it("returns unavailable metadata when conversion pair is missing", async () => {
    const valuationConversionService = createValuationConversionService({
      findFxRates: async () => [],
    });

    const result = await valuationConversionService.convertAmount({
      amount: 100,
      sourceCurrency: "USD",
      targetCurrency: "CAD",
      asOfDate: "2026-02-05",
    });

    expect(result).toEqual({
      convertedAmount: null,
      rate: null,
      source: "unavailable",
      pair: "USD->CAD",
    });
  });

  it("uses inverse rate when only reverse pair exists", async () => {
    const valuationConversionService = createValuationConversionService({
      findFxRates: async () => [
        {
          sourceCurrency: "USD",
          targetCurrency: "CAD",
          marketDate: "2026-02-10",
          rate: 1.4,
        },
      ],
    });

    const result = await valuationConversionService.convertAmount({
      amount: 140,
      sourceCurrency: "CAD",
      targetCurrency: "USD",
      asOfDate: "2026-02-10",
    });

    expect(result.source).toBe("as_of");
    expect(result.pair).toBe("CAD->USD");
    expect(result.rate).toBeCloseTo(1 / 1.4, 10);
    expect(result.convertedAmount).toBeCloseTo(100, 10);
  });
});
