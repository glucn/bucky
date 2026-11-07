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
