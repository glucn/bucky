import { describe, it, expect } from "vitest";
import {
  resolveImportAmount,
  isImportMappingValid,
  updateImportPreviewRow,
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

describe("updateImportPreviewRow", () => {
  it("updates a specific row field", () => {
    const rows = [{ date: "2025-01-01" }, { date: "2025-01-02" }];

    const updated = updateImportPreviewRow(rows, 1, "date", "2025-01-03");

    expect(updated).toHaveLength(2);
    expect(updated[0].date).toBe("2025-01-01");
    expect(updated[1].date).toBe("2025-01-03");
  });

  it("coerces amount values to numbers", () => {
    const rows = [{ amount: "" }];

    const updated = updateImportPreviewRow(rows, 0, "amount", "12.50");

    expect(updated[0].amount).toBe(12.5);
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
  it("injects index and preserves category mapping", () => {
    const rows = [
      { date: "2025-01-01", amount: 5, category: "Groceries" },
      { date: "2025-01-02", amount: 3 },
    ];

    const payload = buildImportPayload(rows);

    const firstPayload = payload[0] as { index: number; toAccountId?: string };
    const secondPayload = payload[1] as { index: number; toAccountId?: string };

    expect(firstPayload.index).toBe(0);
    expect(firstPayload.toAccountId).toBe("Groceries");
    expect(secondPayload.index).toBe(1);
    expect(secondPayload.toAccountId).toBeUndefined();
  });
});

describe("resolveImportSummary", () => {
  it("prefers explicit summary values", () => {
    const summary = resolveImportSummary({ imported: 2, skipped: 1 }, 3);

    expect(summary).toEqual({ imported: 2, skipped: 1 });
  });

  it("falls back to default counts", () => {
    const summary = resolveImportSummary(null, 4);

    expect(summary).toEqual({ imported: 4, skipped: 0 });
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

  it("returns blank when no amount fields", () => {
    const row = { Memo: "Test" };
    const fieldMap = {};

    expect(resolveImportAmount(row, fieldMap)).toBe("");
  });
});
