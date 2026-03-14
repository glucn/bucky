# Requirements: Reporting Basics (F-013)

## Goal

Deliver a first reporting MVP focused on income/expense analysis with clear period controls and trustworthy totals.

## MVP Scope

- Add two report surfaces only:
  1. Income vs Expense Trend (month-by-month)
  2. Income/Expense Breakdown (selected period)
- Each report has its own date-range state (not shared globally).
- Keep reporting behavior consistent with existing accounting and normalization rules.
- Exclude future-dated transactions by default with no toggle in F-013.

## Functional Requirements

### FR-1 Report Set and Navigation

- F-013 must ship with exactly two reports in MVP:
  - Income vs Expense Trend
  - Income/Expense Breakdown
- Net worth and investment-allocation report pages are out of scope for F-013 MVP.
- Report names and labels must be explicit so users can tell trend vs breakdown intent.

### FR-2 Date Context Model

- Date filtering state must be report-specific.
- Changing date range in one report must not change date range in the other report.
- Last selected date range must be persisted per report and restored on app reopen.
- All calculations inside a report response must use one consistent date context for that report.
- First-open defaults must be:
  - Trend report: `Last 6 months`
  - Breakdown report: `This month`

### FR-3 Income vs Expense Trend Report

- Trend report must display month-by-month comparison of income and expense.
- Trend visualization must use grouped bars (income and expense side-by-side per month).
- Trend visualization must not use stacked bars in F-013 MVP.
- Trend bars must provide tooltips showing `Income`, `Expense`, and `Net income` for the hovered month.
- Tooltip sign/color rules for monthly `Net income` must match breakdown KPI rules (negative = red with leading minus sign).
- Trend monthly totals must include Unassigned contributions implicitly.
- Trend visualization must not add a separate Unassigned series/legend in F-013 MVP.
- Trend report date controls must be strict month-based selections only.
- Trend report must not support arbitrary custom start/end dates in MVP.
- Trend buckets must follow local calendar month semantics.
- Income and expense values must be displayed as separate positive values for each month bucket.

### FR-4 Income/Expense Breakdown Report

- Breakdown report must support presets plus custom date range (start/end date picker).
- Breakdown report must show a prominent Net income KPI card above the breakdown tables.
- Breakdown report must display separate tables:
  - Income categories table
  - Expense categories table
- Both tables must sort rows by amount descending by default.
- Income categories table must include `% of income` column.
- Expense categories table must include `% of expense` column.
- Both tables must include an Unassigned row when uncategorized or placeholder-linked items exist in the selected period.
- Both tables must include a totals row at the bottom (`Total income`, `Total expense`).
- Breakdown report must display Net income for the selected period, defined as `income - expense`.
- If Net income is negative, KPI must render in red and display a leading minus sign.

### FR-5 Calculation and Inclusion Rules

- Income/expense reporting must continue existing behavior from current reporting logic:
  - Include uncategorized and placeholder-linked transactions.
  - Exclude internal transfers between user-owned accounts from income/expense totals.
- Future-dated transactions must be excluded by default for both reports.
- Currency conversion and display rules must remain consistent with existing dashboard/reporting conventions.

### FR-6 Empty and Degenerate States

- If a selected period has no income/expense data, each report must show a clear empty-state message instead of misleading zero-only visualizations.
- If only one side exists (income-only or expense-only), report output must still render correctly and compute net income accordingly.

## Non-Functional Requirements

- **Consistency**: Totals shown in visual and tabular sections within the same report/date context must agree.
- **Determinism**: Given unchanged data and same date filter, results must be reproducible.
- **Performance**: Report rendering should remain responsive for typical personal-finance datasets.
- **Testability**: Report controls and key values (date control, net income value, trend buckets, table rows) must be testable with stable selectors/IDs.

## Out of Scope (F-013 MVP)

- Net worth dedicated report page.
- Investment allocation dedicated report page.
- Per-report sub-widget date overrides (different date ranges inside one report surface).
- Trend custom arbitrary date ranges.
- Include/exclude future-dated transaction toggle.
- Drilldown pages or cross-report deep links.

## Acceptance Criteria

1. User can open reporting and access exactly two MVP reports: Trend and Breakdown.
2. Each report keeps independent date state; changing one does not mutate the other.
3. Trend report accepts month-based ranges only and renders month-by-month income vs expense values.
4. Breakdown report supports presets and custom start/end date range.
5. Breakdown shows separate income and expense category tables sorted by amount descending.
6. Trend grouped bars expose tooltip values for income, expense, and net income per month.
7. Breakdown displays `% of income` and `% of expense` columns and totals rows for both tables.
8. Breakdown displays a prominent Net income KPI (`income - expense`) above tables.
9. Unassigned category rows appear in relevant breakdown tables when applicable.
10. Future-dated transactions are excluded by default in both reports.
11. Last selected date range for each report persists across app restart.
12. Negative Net income is rendered in red with a leading minus sign.
