# Requirements: Placeholder Reporting (F-018)

**Status:** Complete (2026-08-26)

## Goal

Keep incomplete categorization visible in reporting so report totals remain reconcilable and users can
see the portion that still needs attention.

## Functional Requirements

- Income and expense transactions posted to the system uncategorized category accounts are included
  in report totals.
- The Trend report includes those amounts in the correct month without introducing a separate series.
- The Breakdown report groups those amounts into deterministic Unassigned income and expense rows.
- Unassigned rows participate in totals, percentage calculations, amount-descending sorting, date
  filtering, reporting-currency conversion, and FX completeness checks exactly like named categories.
- Internal user-account transfers and future-dated entries remain excluded under F-013 rules.

## Acceptance Criteria

1. Uncategorized income and expense affect Trend totals and net income.
2. Breakdown responses use categoryId UNASSIGNED and categoryName Unassigned.
3. Income and expense Unassigned rows remain separate and reconcile to their table totals.
4. Service and renderer tests cover inclusion and presentation.

## Out of Scope

- A new placeholder-account model or placeholder cleanup workflow.
- Report drilldown from an Unassigned row.
- Renaming the underlying system uncategorized accounts.
