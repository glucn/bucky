# Design: Overview Dashboard (F-012)

## Overview

F-012 introduces a read-only dashboard as the default home page. It provides one consistent snapshot of three metrics:

- Net worth
- 6-month income vs expense trend
- Investment allocation by account/portfolio

To keep this extensible, the service layer uses an orchestrator pattern: one overview service coordinates shared inputs while each metric lives in its own module.

## Architecture

### Renderer

- Add/extend home page container to render three overview cards.
- Request data via one IPC method.
- Render loading, success, empty, and error states.
- Keep cards read-only in MVP.

### Main Process / IPC

- Register a single IPC handler for dashboard retrieval (for example, `getOverviewDashboard`).
- Delegate directly to service layer.

### Service Layer

Use an orchestration service and metric modules:

- `overviewService` (orchestrator only)
- `overview/netWorthMetric`
- `overview/incomeExpenseTrendMetric`
- `overview/investmentAllocationMetric`
- shared helpers (FX conversion, date boundaries, transfer filtering)

`overviewService` builds a shared computation context once and passes it to metric modules via a consistent interface.

## Data Contract

Return one combined payload so all cards are computed from the same snapshot.

```ts
type OverviewDashboardPayload = {
  asOfDate: string; // local date boundary, YYYY-MM-DD
  netWorth: {
    amount: number;
    currency: string;
  };
  incomeExpenseTrend6m: {
    currency: string;
    months: Array<{
      monthKey: string; // YYYY-MM
      income: number; // positive display value
      expense: number; // positive display value
    }>;
  };
  investmentAllocation: {
    hasData: boolean;
    currency: string;
    total: number;
    slices: Array<{
      portfolioId: string;
      portfolioName: string;
      amount: number;
      ratio: number;
    }>;
    emptyHintKey?: string;
  };
  metadata: {
    usedEstimatedFxRate: boolean;
    missingFxPairs: string[];
  };
};
```

## Computation Rules

### Shared Time and Consistency Rules

- Use one `asOfDate = today (local timezone)` per response.
- Exclude future-dated transactions (`date > asOfDate`) from all computations.
- Use rates/prices at or before `asOfDate`.

### Net Worth Metric

- Scope: all non-category accounts.
- Formula: `assets - liabilities`.
- Investment accounts include securities value and investment cash.
- Convert to reporting currency via latest FX; fallback to last-known cached FX.

### Income vs Expense Trend Metric

- Build 6 local calendar month buckets (current + previous 5).
- For each month, return separate positive values for income and expense.
- Include uncategorized and placeholder-linked transactions.
- Exclude internal transfers between user-owned accounts.
- Ensure deterministic ordering by `monthKey`.

### Investment Allocation Metric

- Group by investment account/portfolio.
- Slice amount = securities value + investment cash.
- Convert to reporting currency using same FX logic.
- If no investment data or zero total, return `hasData=false` with empty hint key.

## Refresh and State Management

- Initial page load: fetch combined payload once and render all cards.
- Auto-refresh: invalidate and re-fetch on relevant data changes.
- Debounce/coalesce invalidations (e.g., 250-500ms) to avoid UI thrash during imports or rapid edits.
- Keep payload atomic so cards never represent mixed snapshots.

## Error and Empty-State Handling

- Transport/service error: show dashboard-level non-blocking error state and retry affordance.
- Partial data issues (for example FX fallback): keep cards visible and expose metadata-driven notice where appropriate.
- No investment data: show allocation card empty hint, not hidden card.

## Testing Strategy

### Service Tests

- `netWorthMetric`: asset/liability inclusion, future exclusion, FX conversion and fallback.
- `incomeExpenseTrendMetric`: 6-month bucketing, transfer exclusion, month ordering.
- `investmentAllocationMetric`: securities+cash inclusion, grouping, empty-state behavior.
- `overviewService`: shared `asOfDate` consistency and payload composition.

### IPC Tests

- Handler registration and successful payload forwarding.
- Error propagation behavior.

### Renderer Tests

- Loading/success/empty/error states for each card.
- Trend card renders 6 ordered month buckets.
- Allocation empty hint appears when `hasData=false`.

### E2E Coverage (MVP)

- Home opens to overview dashboard.
- Three cards render.
- Trend shows 6-month comparison.
- Allocation empty hint appears when no investment accounts exist.

## Extensibility Notes

- New overview reports should be added as independent metric modules implementing the same compute interface.
- Keep orchestrator focused on context assembly and composition to avoid monolithic service growth.
