import { describe, expect, it } from "vitest";
import {
  REPORTING_FIXTURE_ACCOUNT_KEYS,
  buildExpenseOnlyFixture,
  buildIncomeOnlyFixture,
  buildMixedFixture,
  buildRecentMonthKeys,
  buildTransferHeavyFixture,
  buildUnassignedHeavyFixture,
  monthKeyOf,
} from "./reporting.test.fixtures";

describe("reporting test fixtures", () => {
  it("builds stable month keys for month-boundary dates", () => {
    expect(buildRecentMonthKeys("2026-03-01", 6)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("builds deterministic scenarios for same input date", () => {
    expect(buildIncomeOnlyFixture("2026-03-15")).toEqual(buildIncomeOnlyFixture("2026-03-15"));
    expect(buildExpenseOnlyFixture("2026-03-15")).toEqual(buildExpenseOnlyFixture("2026-03-15"));
    expect(buildMixedFixture("2026-03-15")).toEqual(buildMixedFixture("2026-03-15"));
  });

  it("provides transfer-heavy dataset that includes transfer transactions", () => {
    const fixture = buildTransferHeavyFixture("2026-03-15");

    expect(fixture.some((entry) => entry.kind === "transfer")).toBe(true);
    expect(fixture.some((entry) => entry.kind === "income")).toBe(true);
    expect(fixture.some((entry) => entry.kind === "expense")).toBe(true);
  });

  it("provides unassigned-heavy dataset with explicit unassigned markers", () => {
    const fixture = buildUnassignedHeavyFixture("2026-03-15");
    const unassignedRows = fixture.filter((entry) => entry.unassigned);

    expect(unassignedRows.length).toBeGreaterThan(0);
    expect(
      unassignedRows.every(
        (entry) =>
          entry.to === REPORTING_FIXTURE_ACCOUNT_KEYS.categoryUnassignedExpense ||
          entry.from === REPORTING_FIXTURE_ACCOUNT_KEYS.categoryUnassignedIncome
      )
    ).toBe(true);
  });

  it("derives month key in YYYY-MM format", () => {
    expect(monthKeyOf("2026-01-31")).toBe("2026-01");
  });
});
