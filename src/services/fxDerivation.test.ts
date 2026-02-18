import { describe, expect, it } from "vitest";
import { deriveRequiredFxPairs, resolveFxRateForValuation } from "./fxDerivation";

describe("deriveRequiredFxPairs", () => {
  it("returns source->base pairs excluding same-currency pairs", () => {
    const result = deriveRequiredFxPairs({
      sourceCurrencies: ["USD", "CAD", "USD", "EUR"],
      baseCurrency: "USD",
    });

    expect(result).toEqual([
      { sourceCurrency: "CAD", targetCurrency: "USD" },
      { sourceCurrency: "EUR", targetCurrency: "USD" },
    ]);
  });
});

describe("resolveFxRateForValuation", () => {
  it("uses implicit 1.0 for same-currency conversion", () => {
    expect(
      resolveFxRateForValuation({
        sourceCurrency: "USD",
        baseCurrency: "USD",
        rate: null,
      })
    ).toBe(1);
  });

  it("returns stored rate for cross-currency conversion", () => {
    expect(
      resolveFxRateForValuation({
        sourceCurrency: "CAD",
        baseCurrency: "USD",
        rate: 1.35,
      })
    ).toBe(1.35);
  });
});
