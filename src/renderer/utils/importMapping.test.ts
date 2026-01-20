import { describe, it, expect } from "vitest";
import { resolveImportAmount } from "./importMapping";

describe("resolveImportAmount", () => {
  it("uses credit minus debit when both provided", () => {
    const row = { Credit: "200.50", Debit: "50.25" };
    const fieldMap = { credit: "Credit", debit: "Debit" };

    expect(resolveImportAmount(row, fieldMap)).toBeCloseTo(150.25, 2);
  });

  it("uses single amount column when no credit/debit", () => {
    const row = { Amount: "-42.10" };
    const fieldMap = { amount: "Amount" };

    expect(resolveImportAmount(row, fieldMap)).toBeCloseTo(-42.1, 2);
  });

  it("returns blank when no amount fields", () => {
    const row = { Memo: "Test" };
    const fieldMap = {};

    expect(resolveImportAmount(row, fieldMap)).toBe("");
  });
});
