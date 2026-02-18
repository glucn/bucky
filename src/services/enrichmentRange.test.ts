import { describe, expect, it } from "vitest";
import {
  deriveIncrementalStartDate,
  detectHistoricalGaps,
} from "./enrichmentRange";

describe("deriveIncrementalStartDate", () => {
  it("uses earliest transaction date when no history exists", () => {
    const start = deriveIncrementalStartDate({
      earliestRelevantTransactionDate: "2024-01-05",
      lastSuccessfulRefreshDate: null,
    });

    expect(start).toBe("2024-01-05");
  });

  it("uses last successful refresh date when history exists", () => {
    const start = deriveIncrementalStartDate({
      earliestRelevantTransactionDate: "2024-01-05",
      lastSuccessfulRefreshDate: "2024-03-01",
    });

    expect(start).toBe("2024-03-01");
  });
});

describe("detectHistoricalGaps", () => {
  it("returns no gaps for fully covered range", () => {
    const result = detectHistoricalGaps({
      requiredStartDate: "2024-01-01",
      requiredEndDate: "2024-01-03",
      coveredDates: ["2024-01-01", "2024-01-02", "2024-01-03"],
    });

    expect(result.hasGaps).toBe(false);
    expect(result.gaps).toEqual([]);
  });

  it("returns contiguous missing windows for sparse coverage", () => {
    const result = detectHistoricalGaps({
      requiredStartDate: "2024-01-01",
      requiredEndDate: "2024-01-07",
      coveredDates: ["2024-01-01", "2024-01-03", "2024-01-06", "2024-01-07"],
    });

    expect(result.hasGaps).toBe(true);
    expect(result.gaps).toEqual([
      { startDate: "2024-01-02", endDate: "2024-01-02" },
      { startDate: "2024-01-04", endDate: "2024-01-05" },
    ]);
  });
});
