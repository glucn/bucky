import { expect, it } from "vitest";
import { formatValuationAmount } from "./valuationFormatting";

it.each([null, undefined, NaN, Infinity, -Infinity])("keeps unavailable monetary input %s distinct from a known zero", (amount) => {
  expect(formatValuationAmount(amount as number, "CAD")).toBe("N/A");
  expect(formatValuationAmount(amount as number, "CAD", { disambiguate: true })).toBe("N/A");
});
it("preserves a known zero and native currency labels", () => {
  expect(formatValuationAmount(0, "CAD")).toContain("0.00");
  expect(formatValuationAmount(10, "USD", { disambiguate: true })).toBe("USD 10.00");
});
it("can retain fractional-cent converted flow values for audit while totals use normal currency display", () => {
  expect(formatValuationAmount(0.015, "CAD", { disambiguate: true, maximumFractionDigits: 6 })).toBe("CAD 0.015");
  expect(formatValuationAmount(0.0000015, "CAD", { disambiguate: true, maximumFractionDigits: 7 })).toBe("CAD 0.0000015");
  expect(formatValuationAmount(0.15, "CAD", { disambiguate: true })).toBe("CAD 0.15");
});
