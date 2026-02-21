import { afterEach, describe, expect, it, vi } from "vitest";
import { createValuationConversionService } from "./valuationConversionService";

describe("valuationConversionService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses as-of date rate first", async () => {
    const valuationConversionService = createValuationConversionService({
      findFxEntries: async () =>
        [
      {
        date: "2026-02-01",
        type: "currency_transfer",
        lines: [
          { currency: "USD", amount: -100 } as any,
          { currency: "CAD", amount: 130 } as any,
        ],
      },
      {
        date: "2026-02-10",
        type: "currency_transfer",
        lines: [
          { currency: "USD", amount: -100 } as any,
          { currency: "CAD", amount: 140 } as any,
        ],
      },
    ] as any,
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
      findFxEntries: async () =>
        [
      {
        date: "2026-02-10",
        type: "currency_transfer",
        lines: [
          { currency: "USD", amount: -100 } as any,
          { currency: "CAD", amount: 140 } as any,
        ],
      },
    ] as any,
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
      findFxEntries: async () => [] as any,
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
});
