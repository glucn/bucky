import { describe, it, expect } from "vitest";
import {
  resolveImportAmount,
  isImportMappingValid,
  getImportDuplicateKey,
  applyDuplicateFlags,
  applyForceDuplicate,
  filterOutDuplicateRows,
  buildImportPayload,
  resolveImportSummary,
  shouldShowDefaultAccountWarning,
} from "./importMapping";

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

describe("getImportDuplicateKey", () => {
  it("builds a stable key from date amount description", () => {
    const row = { date: "2025-02-01", amount: 10, description: "Coffee" };

    expect(getImportDuplicateKey(row)).toBe("2025-02-01|10|Coffee");
  });
});

describe("applyDuplicateFlags", () => {
  it("marks duplicates based on indexes", () => {
    const rows = [{ id: 1 }, { id: 2 }];

    const flagged = applyDuplicateFlags(rows, [1]);

    expect(flagged[0].isDuplicate).toBe(false);
    expect(flagged[1].isDuplicate).toBe(true);
  });
});

describe("applyForceDuplicate", () => {
  it("adds forceDuplicate for selected indexes", () => {
    const rows = [{ id: 1 }, { id: 2 }];

    const updated = applyForceDuplicate(rows, [0]);

    expect("forceDuplicate" in updated[0]).toBe(true);
    expect("forceDuplicate" in updated[1]).toBe(false);
  });
});

describe("filterOutDuplicateRows", () => {
  it("removes rows by duplicate index", () => {
    const rows = [{ id: 1 }, { id: 2 }];

    const filtered = filterOutDuplicateRows(rows, [1]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(1);
  });
});

describe("buildImportPayload", () => {
  it("injects row index into payload", () => {
    const rows = [
      { date: "2025-01-01", amount: 5 },
      { date: "2025-01-02", amount: 3 },
    ];

    const payload = buildImportPayload(rows);

    const firstPayload = payload[0] as { index: number };
    const secondPayload = payload[1] as { index: number };

    expect(firstPayload.index).toBe(0);
    expect(secondPayload.index).toBe(1);
  });
});

describe("resolveImportSummary", () => {
  it("prefers explicit summary values", () => {
    const summary = resolveImportSummary({ imported: 2, skipped: 1 }, 3);

    expect(summary).toEqual({
      imported: 2,
      skipped: 1,
      exactAutoAppliedCount: 0,
      keywordMatchedCount: 0,
      uncategorizedCount: 0,
    });
  });

  it("falls back to default counts", () => {
    const summary = resolveImportSummary(null, 4);

    expect(summary).toEqual({
      imported: 4,
      skipped: 0,
      exactAutoAppliedCount: 0,
      keywordMatchedCount: 0,
      uncategorizedCount: 0,
    });
  });

  it("includes auto-categorization counters when present", () => {
    const summary = resolveImportSummary(
      {
        imported: 5,
        skipped: 2,
        exactAutoAppliedCount: 3,
        keywordMatchedCount: 1,
        uncategorizedCount: 1,
      },
      7
    );

    expect(summary.imported).toBe(5);
    expect(summary.skipped).toBe(2);
    expect(summary.exactAutoAppliedCount).toBe(3);
    expect(summary.keywordMatchedCount).toBe(1);
    expect(summary.uncategorizedCount).toBe(1);
  });
});

describe("shouldShowDefaultAccountWarning", () => {
  it("returns true when details exist", () => {
    expect(shouldShowDefaultAccountWarning([{ id: 1 }])).toBe(true);
  });

  it("returns false for empty details", () => {
    expect(shouldShowDefaultAccountWarning([])).toBe(false);
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

  it("parses currency symbols and parentheses", () => {
    const row = { Amount: "($1,234.50)" };
    const fieldMap = { amount: "Amount" };

    expect(resolveImportAmount(row, fieldMap)).toBeCloseTo(-1234.5, 2);
  });

  it("returns blank when no amount fields", () => {
    const row = { Memo: "Test" };
    const fieldMap = {};

    expect(resolveImportAmount(row, fieldMap)).toBe("");
  });
});
