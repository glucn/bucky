# Design: Placeholder Reporting (F-018)

**Status:** Implemented and verified (2026-08-26)

## Implementation

F-018 is implemented inside the F-013 reporting pipeline rather than as a separate report.
The reporting service recognizes the system category accounts Uncategorized Income and
Uncategorized Expense and normalizes either to the public reporting bucket with categoryId
UNASSIGNED and categoryName Unassigned.

Trend aggregation consumes the same category journal lines and therefore includes their values
implicitly. Breakdown aggregation merges matching placeholder lines into the appropriate income or
expense bucket before sorting and ratio calculation. No database migration or additional IPC method
is required.

## Source-of-Truth Boundaries

- Journal entries and lines remain the accounting source of truth.
- Account type/subtype determines whether a line is income or expense.
- The valuation conversion service and canonical FxDailyRate rows determine converted amounts.
- The renderer consumes the normalized response and does not reclassify transactions.

## Verification

- Trend service tests cover implicit unassigned income/expense inclusion.
- Breakdown service tests cover UNASSIGNED rows, amounts, and ratios.
- Renderer tests cover visible Unassigned rows in both tables.
