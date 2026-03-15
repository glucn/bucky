import { describe, expect, it } from "vitest";
import {
  BREAKDOWN_RANGE_PRESETS,
  DEFAULT_BREAKDOWN_FILTER,
  DEFAULT_TREND_FILTER,
  REPORTING_BREAKDOWN_FILTER_SETTING_KEY,
  REPORTING_TREND_FILTER_SETTING_KEY,
  TREND_RANGE_PRESETS,
  isBreakdownRangePreset,
  isStandardDateString,
  isTrendRangePreset,
  normalizeBreakdownFilter,
  normalizeTrendFilter,
} from "./reporting";

describe("reporting shared contracts", () => {
  it("defines expected trend and breakdown preset catalogs", () => {
    expect(TREND_RANGE_PRESETS).toEqual([
      "LAST_3_MONTHS",
      "LAST_6_MONTHS",
      "YTD",
      "LAST_12_MONTHS",
    ]);
    expect(BREAKDOWN_RANGE_PRESETS).toEqual([
      "THIS_MONTH",
      "LAST_MONTH",
      "LAST_3_MONTHS",
      "LAST_6_MONTHS",
      "YTD",
      "LAST_12_MONTHS",
      "CUSTOM",
    ]);
  });

  it("exposes stable app-setting keys for report filters", () => {
    expect(REPORTING_TREND_FILTER_SETTING_KEY).toBe("reporting.trend.filter");
    expect(REPORTING_BREAKDOWN_FILTER_SETTING_KEY).toBe("reporting.breakdown.filter");
  });

  it("validates trend and breakdown presets", () => {
    expect(isTrendRangePreset("LAST_6_MONTHS")).toBe(true);
    expect(isTrendRangePreset("THIS_MONTH")).toBe(false);
    expect(isBreakdownRangePreset("THIS_MONTH")).toBe(true);
    expect(isBreakdownRangePreset("NEXT_MONTH")).toBe(false);
  });

  it("validates standard date strings", () => {
    expect(isStandardDateString("2026-03-01")).toBe(true);
    expect(isStandardDateString("2026-3-1")).toBe(false);
    expect(isStandardDateString("03/01/2026")).toBe(false);
  });

  it("normalizes trend filter and falls back to defaults", () => {
    expect(normalizeTrendFilter({ preset: "LAST_3_MONTHS" })).toEqual({
      preset: "LAST_3_MONTHS",
    });
    expect(normalizeTrendFilter({ preset: "BAD_PRESET" })).toEqual(DEFAULT_TREND_FILTER);
    expect(normalizeTrendFilter(null)).toEqual(DEFAULT_TREND_FILTER);
  });

  it("normalizes non-custom breakdown filter and strips customRange", () => {
    expect(
      normalizeBreakdownFilter({
        preset: "THIS_MONTH",
        customRange: { startDate: "2026-01-01", endDate: "2026-01-31" },
      })
    ).toEqual({
      preset: "THIS_MONTH",
    });
  });

  it("accepts valid custom breakdown range and rejects malformed values", () => {
    expect(
      normalizeBreakdownFilter({
        preset: "CUSTOM",
        customRange: { startDate: "2026-01-01", endDate: "2026-02-01" },
      })
    ).toEqual({
      preset: "CUSTOM",
      customRange: { startDate: "2026-01-01", endDate: "2026-02-01" },
    });

    expect(
      normalizeBreakdownFilter({
        preset: "CUSTOM",
        customRange: { startDate: "01/01/2026", endDate: "2026-02-01" },
      })
    ).toEqual(DEFAULT_BREAKDOWN_FILTER);

    expect(
      normalizeBreakdownFilter({
        preset: "CUSTOM",
      })
    ).toEqual(DEFAULT_BREAKDOWN_FILTER);
  });
});
