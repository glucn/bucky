import { describe, expect, it } from "vitest";
import { resolveImportSummary } from "./importMapping";

describe("resolveImportSummary", () => {
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

  it("defaults auto-categorization counters to zero", () => {
    const summary = resolveImportSummary({ imported: 1, skipped: 0 }, 1);

    expect(summary.exactAutoAppliedCount).toBe(0);
    expect(summary.keywordMatchedCount).toBe(0);
    expect(summary.uncategorizedCount).toBe(0);
  });
});
