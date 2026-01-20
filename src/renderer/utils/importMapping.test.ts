import { describe, it, expect } from "vitest";
import { resolveImportAmount, isImportMappingValid } from "./importMapping";

describe("isImportMappingValid", () => {
  it("requires date and amount mapping", () => {
    expect(isImportMappingValid({})).toBe(false);
    expect(isImportMappingValid({ date: "Date" })).toBe(false);
    expect(isImportMappingValid({ amount: "Amount" })).toBe(false);
    expect(isImportMappingValid({ date: "Date", amount: "Amount" })).toBe(true);
  });

  it("accepts credit or debit mapping as amount", () => {
    expect(isImportMappingValid({ date: "Date", credit: "Credit" })).toBe(true);
    expect(isImportMappingValid({ date: "Date", debit: "Debit" })).toBe(true);
  });

  it("does not require description", () => {
    expect(
      isImportMappingValid({
        date: "Date",
        amount: "Amount",
        description: "Description",
      })
    ).toBe(true);
    expect(isImportMappingValid({ date: "Date", amount: "Amount" })).toBe(true);
  });
});

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
