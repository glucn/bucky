# Design: Reporting Basics (F-013)

## Overview

F-013 introduces a focused reporting MVP for income/expense analysis with two report surfaces:

- Income vs Expense Trend (month-by-month)
- Income/Expense Breakdown (selected period)

Unlike F-012 overview cards, F-013 is a dedicated reporting area with report-specific date filters and richer visual/tabular detail. The design prioritizes consistency, explainability, and low cognitive load.

## Current Implementation Fit

- F-012 dashboard remains unchanged and continues to use `get-overview-dashboard` via `overviewService`.
- Existing investment-scoped reports at `/investments/:portfolioId/reports` (`PerformanceReportsPage`) remain unchanged in F-013.
- F-013 introduces a separate reporting surface for account/category income-expense reporting; it does not replace investment performance reporting.
- New F-013 data should follow the current IPC layering pattern used in the app:
  - renderer page -> preload API -> ipc handler -> service module
- UI filter persistence must use the existing `AppSetting` mechanism (`getAppSetting`/`setAppSetting`) rather than ad hoc local-only state.

## Product Decisions (Locked)

- Ship only two reports in MVP: Trend and Breakdown.
- Keep date state independent per report.
- Trend uses strict month-based ranges only.
- Breakdown supports presets plus custom start/end date picker.
- Trend chart uses grouped bars (not stacked).
- Breakdown uses separate income and expense tables.
- Net income is a prominent KPI in Breakdown.
- Negative net income is rendered in red with a leading minus sign.

## Information Architecture

### Reporting Home (F-013)

- Top-level report switcher/tabs:
  - `Income vs Expense Trend`
  - `Income/Expense Breakdown`
- Recommended route shape for clarity and coexistence:
  - `/reports` (F-013 reporting home)
- Each tab owns its own persisted date-filter state.
- First-open defaults:
  - Trend: `Last 6 months`
  - Breakdown: `This month`

### Report A: Income vs Expense Trend

- Month-based date presets only.
- Main visualization: grouped bars, side-by-side `Income` and `Expense` per month bucket.
- Tooltip content on hover:
  - `Income`
  - `Expense`
  - `Net income`
- Tooltip sign/color conventions match Breakdown KPI (negative net = red with minus sign).
- Unassigned contributions are included in monthly totals implicitly, with no separate trend series/legend in MVP.

### Report B: Income/Expense Breakdown

- Date controls: presets + custom start/end picker.
- Hero KPI: `Net income = income - expense`.
- Two separate tables:
  - Income categories
  - Expense categories
- Table behavior:
  - default sort by amount descending
  - include percentage columns (`% of income`, `% of expense`)
  - include totals rows (`Total income`, `Total expense`)
  - include `Unassigned` row when applicable

## Architecture

### Renderer

- Add reporting route/page container with two report modules.
- Keep a shared reporting shell for title, report switcher, and top-level loading/error states.
- Inside each report module, isolate:
  - date controls
  - data fetch trigger
  - view rendering (chart/table/KPI)
- Persist date filter state per report key.

### Main Process / IPC

- Expose separate IPC endpoints so report-level date contracts stay explicit and type-safe.
- Proposed channels:
  - `get-income-expense-trend-report`
  - `get-income-expense-breakdown-report`
- IPC handlers remain thin and delegate to service-layer reporting modules.

### Service Layer

Use a reporting orchestrator with report-specific metric modules:

- `reportingService` (shared context + dispatch)
- `reporting/incomeExpenseTrendReport`
- `reporting/incomeExpenseBreakdownReport`
- shared helpers:
  - date range normalization
  - transfer exclusion
  - placeholder/unassigned inclusion
  - currency conversion alignment

Service rules must remain consistent with existing accounting/display behavior used by F-012.

## Data Contracts (Proposed)

Use explicit contracts per report to keep independent date semantics clear.

```ts
type TrendRangePreset = 'LAST_3_MONTHS' | 'LAST_6_MONTHS' | 'YTD' | 'LAST_12_MONTHS';

type GetIncomeExpenseTrendRequest = {
  preset: TrendRangePreset;
};

type IncomeExpenseTrendResponse = {
  range: {
    preset: TrendRangePreset;
    startMonthKey: string; // YYYY-MM
    endMonthKey: string;   // YYYY-MM
  };
  months: Array<{
    monthKey: string; // YYYY-MM
    income: number;   // positive display value
    expense: number;  // positive display value
    netIncome: number; // can be negative
  }>;
  metadata: {
    includesUnassignedImplicitly: true;
  };
};

type BreakdownRangePreset =
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'LAST_3_MONTHS'
  | 'LAST_6_MONTHS'
  | 'YTD'
  | 'LAST_12_MONTHS'
  | 'CUSTOM';

type GetIncomeExpenseBreakdownRequest = {
  preset: BreakdownRangePreset;
  customRange?: {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
  };
};

type BreakdownRow = {
  categoryId: string | 'UNASSIGNED';
  categoryName: string;
  amount: number;
  ratio: number; // 0..1 against table basis
};

type IncomeExpenseBreakdownResponse = {
  range: {
    preset: BreakdownRangePreset;
    startDate: string;
    endDate: string;
  };
  kpis: {
    incomeTotal: number;
    expenseTotal: number;
    netIncome: number; // incomeTotal - expenseTotal
  };
  incomeRows: BreakdownRow[];
  expenseRows: BreakdownRow[];
};
```

## Computation Rules

- Exclude future-dated transactions by default for both reports.
- Exclude internal transfers between user-owned accounts from income/expense totals.
- Include uncategorized and placeholder-linked transactions.
- Ensure visual totals and table totals are internally consistent.
- Use deterministic ordering for trend buckets and table rows.

## State and Persistence

- Persist filter state separately using existing `AppSetting` storage via preload/main IPC:
  - `reporting.trend.filter`
  - `reporting.breakdown.filter`
- Restore per-report filters on reopen.
- If persisted state is invalid (for example malformed custom range), fallback to report default.
- Keep persisted payloads JSON-serializable and version-tolerant.

## Error and Empty-State Behavior

- Empty dataset:
  - Trend: show explicit no-data state, not zero-only bars.
  - Breakdown: show empty tables with explanatory message and KPI fallback display.
- One-sided data (income-only or expense-only):
  - Render report normally.
  - Keep net-income calculation correct and sign-safe.
- Data-fetch error:
  - show report-level recoverable error state with retry affordance.

## Testing Strategy

### Service tests

- Trend bucketing: month boundaries, ordering, totals consistency.
- Breakdown aggregation: category sums, ratios, totals rows.
- Inclusion/exclusion rules: transfers excluded, placeholder/unassigned included.
- Net-income sign correctness.

### IPC tests

- Request validation for trend presets and breakdown custom range.
- Handler dispatch and error propagation.

### Renderer tests

- Independent filter state per report.
- Trend grouped-bar rendering and tooltip content.
- Breakdown KPI rendering and negative-net styling.
- Table sorting, percentage columns, totals rows, unassigned row visibility.

### E2E coverage (MVP)

- User can switch between Trend and Breakdown reports.
- Per-report filter persistence survives app restart.
- Trend and Breakdown values are internally consistent for same logical period.

## Deferred Features

- Net worth dedicated report page.
- Investment allocation dedicated report page.
- Per-report sub-widget date overrides.
- Cross-report drilldowns and deep links.
- Advanced chart alternatives beyond grouped bars.
- **Sankey diagram** for flow-style income/expense visualization (deferred to a later feature after MVP report stabilization).
