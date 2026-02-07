# Requirements: Overview Dashboard (F-012)

## Goal

Deliver a default home dashboard that gives an at-a-glance financial overview using three read-only cards:

- Net worth
- 6-month income vs expense trend
- Investment allocation

## MVP Scope

- The dashboard is the default home page after unlock.
- One combined data payload powers all cards.
- Data is auto-refreshed when underlying finance data changes.
- Cards are read-only (no drilldown interactions in F-012).

## Functional Requirements

### FR-1 Dashboard Cards

The overview dashboard must display:

1. Net Worth card
2. Income vs Expense trend card (6 months)
3. Investment Allocation card

### FR-2 Net Worth Calculation

- Net worth must be calculated as `total assets - total liabilities`.
- Include all non-category accounts.
- Include investment account value (securities + investment cash).
- Exclude future-dated transactions by default.

### FR-3 Income vs Expense Trend

- Show 6 local calendar month buckets (current month + previous 5).
- Each month must show separate positive values for `income` and `expense`.
- Include uncategorized and placeholder-linked transactions.
- Exclude internal transfers between user-owned accounts.
- Exclude future-dated transactions by default.

### FR-4 Investment Allocation

- Allocation slices must be grouped by investment account/portfolio.
- Each slice includes securities value + investment cash.
- If no investment data exists, show an explicit empty-state hint.

### FR-5 Currency and FX

- Dashboard totals must support multi-currency by converting into a single reporting currency using latest FX rates.
- If the latest FX rate is unavailable, fallback to last known cached rate.
- The response must indicate estimated conversion usage when fallback occurs.

### FR-6 Time Boundary

- All cards in a response must share one `asOfDate` boundary.
- `asOfDate` uses local date semantics.
- Future-dated data must be excluded by default.

### FR-7 Refresh Behavior

- Dashboard data must refresh automatically on relevant data changes (transactions, account updates, investment valuation updates, FX updates).
- Refresh should be coalesced/debounced to prevent excessive reloads during rapid changes.

## Non-Functional Requirements

- Keep render responsive for normal personal-finance datasets.
- Ensure card values are internally consistent (same cutoff and conversion basis).
- Maintain testability with deterministic month buckets and structured response fields.

## Out of Scope (F-012)

- Card drilldowns or navigation-on-click
- User-selectable date ranges or snapshot date picker
- User toggle for include/exclude future transactions
- Asset-class/currency allocation UX refinements (covered by later features)

## Acceptance Criteria

1. Opening the app lands on the overview dashboard with three cards.
2. Net worth equals assets minus liabilities, excluding future-dated entries.
3. Trend card shows 6 month buckets with separate positive income and expense bars.
4. Transfer transactions are not counted in income or expense totals.
5. Allocation card shows portfolio-based slices including securities + cash, or empty hint if none.
6. Multi-currency totals are converted using latest FX, with last-known fallback when needed.
7. A dashboard refresh occurs automatically after relevant data changes.
