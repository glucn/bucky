import { describe, expect, it } from "vitest";
import {
  isValidKeywordPattern,
  normalizePattern,
  findBestAutoCategorizationMatch,
  type AutoCategorizationRuleMatch,
} from "./autoCategorizationService";

describe("normalizePattern", () => {
  it("normalizes case and collapses whitespace", () => {
    expect(normalizePattern("  COFFEE    Bean  "))
      .toBe("coffee bean");
  });

  it("does not remove punctuation in MVP", () => {
    expect(normalizePattern("Uber-trip #123"))
      .toBe("uber-trip #123");
  });
});

describe("isValidKeywordPattern", () => {
  it("rejects keyword patterns shorter than 3 chars after normalization", () => {
    expect(isValidKeywordPattern("ab")).toBe(false);
    expect(isValidKeywordPattern(" a  ")).toBe(false);
  });

  it("accepts keyword patterns with 3+ chars", () => {
    expect(isValidKeywordPattern("abc")).toBe(true);
    expect(isValidKeywordPattern("coffee")).toBe(true);
  });
});

describe("findBestAutoCategorizationMatch", () => {
  it("matches exact normalized description", () => {
    const rules: AutoCategorizationRuleMatch[] = [
      {
        id: "r1",
        normalizedPattern: "coffee bean vancouver bc",
        matchType: "exact",
        targetCategoryAccountId: "cat-dining",
        targetCategoryArchived: false,
        lastConfirmedAt: null,
        updatedAt: new Date("2026-02-10T00:00:00Z"),
      },
    ];

    const match = findBestAutoCategorizationMatch(rules, "COFFEE BEAN VANCOUVER BC");
    expect(match?.rule.id).toBe("r1");
    expect(match?.matchType).toBe("exact");
  });

  it("matches keyword by substring", () => {
    const rules: AutoCategorizationRuleMatch[] = [
      {
        id: "r2",
        normalizedPattern: "coffee bean",
        matchType: "keyword",
        targetCategoryAccountId: "cat-dining",
        targetCategoryArchived: false,
        lastConfirmedAt: null,
        updatedAt: new Date("2026-02-10T00:00:00Z"),
      },
    ];

    const match = findBestAutoCategorizationMatch(rules, "Coffee Bean DT Vancouver");
    expect(match?.rule.id).toBe("r2");
    expect(match?.matchType).toBe("keyword");
  });

  it("returns null for non-matches", () => {
    const rules: AutoCategorizationRuleMatch[] = [
      {
        id: "r3",
        normalizedPattern: "uber",
        matchType: "keyword",
        targetCategoryAccountId: "cat-transport",
        targetCategoryArchived: false,
        lastConfirmedAt: null,
        updatedAt: new Date("2026-02-10T00:00:00Z"),
      },
    ];

    const match = findBestAutoCategorizationMatch(rules, "Coffee Bean DT Vancouver");
    expect(match).toBeNull();
  });

  it("prioritizes exact over keyword when both match", () => {
    const rules: AutoCategorizationRuleMatch[] = [
      {
        id: "kw-1",
        normalizedPattern: "uber",
        matchType: "keyword",
        targetCategoryAccountId: "cat-travel",
        targetCategoryArchived: false,
        lastConfirmedAt: null,
        updatedAt: new Date("2026-02-12T00:00:00Z"),
      },
      {
        id: "ex-1",
        normalizedPattern: "uber trip",
        matchType: "exact",
        targetCategoryAccountId: "cat-transport",
        targetCategoryArchived: false,
        lastConfirmedAt: null,
        updatedAt: new Date("2026-02-10T00:00:00Z"),
      },
    ];

    const match = findBestAutoCategorizationMatch(rules, "UBER TRIP");
    expect(match?.rule.id).toBe("ex-1");
  });

  it("prioritizes longer keyword patterns then newest confirmation", () => {
    const rules: AutoCategorizationRuleMatch[] = [
      {
        id: "kw-short",
        normalizedPattern: "coffee",
        matchType: "keyword",
        targetCategoryAccountId: "cat-cafe",
        targetCategoryArchived: false,
        lastConfirmedAt: new Date("2026-02-10T00:00:00Z"),
        updatedAt: new Date("2026-02-10T00:00:00Z"),
      },
      {
        id: "kw-long",
        normalizedPattern: "coffee bean",
        matchType: "keyword",
        targetCategoryAccountId: "cat-dining",
        targetCategoryArchived: false,
        lastConfirmedAt: new Date("2026-02-09T00:00:00Z"),
        updatedAt: new Date("2026-02-09T00:00:00Z"),
      },
      {
        id: "kw-long-newer",
        normalizedPattern: "coffee bean",
        matchType: "keyword",
        targetCategoryAccountId: "cat-dining-2",
        targetCategoryArchived: false,
        lastConfirmedAt: new Date("2026-02-11T00:00:00Z"),
        updatedAt: new Date("2026-02-11T00:00:00Z"),
      },
    ];

    const match = findBestAutoCategorizationMatch(rules, "Coffee Bean Downtown");
    expect(match?.rule.id).toBe("kw-long-newer");
  });

  it("ignores rules with invalid targets", () => {
    const rules: AutoCategorizationRuleMatch[] = [
      {
        id: "invalid-archived",
        normalizedPattern: "coffee bean",
        matchType: "keyword",
        targetCategoryAccountId: "cat-archived",
        targetCategoryArchived: true,
        lastConfirmedAt: null,
        updatedAt: new Date("2026-02-10T00:00:00Z"),
      },
      {
        id: "invalid-missing",
        normalizedPattern: "coffee bean",
        matchType: "keyword",
        targetCategoryAccountId: null,
        targetCategoryArchived: false,
        lastConfirmedAt: null,
        updatedAt: new Date("2026-02-11T00:00:00Z"),
      },
      {
        id: "valid",
        normalizedPattern: "coffee",
        matchType: "keyword",
        targetCategoryAccountId: "cat-cafe",
        targetCategoryArchived: false,
        lastConfirmedAt: null,
        updatedAt: new Date("2026-02-09T00:00:00Z"),
      },
    ];

    const match = findBestAutoCategorizationMatch(rules, "Coffee Bean Downtown");
    expect(match?.rule.id).toBe("valid");
  });
});
