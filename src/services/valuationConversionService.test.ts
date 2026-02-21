import { afterEach, describe, expect, it, vi } from "vitest";
import { createValuationConversionService } from "./valuationConversionService";

describe("valuationConversionService", () => {
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
