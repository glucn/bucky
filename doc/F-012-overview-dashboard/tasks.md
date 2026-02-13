# Tasks: Overview Dashboard (F-012)

## Status Legend

- [x] Completed
- [/] In progress
- [ ] Planned/Not started

## Batches

### Batch 1: Contract + Net Worth

- [x] 1. Define shared overview payload type
  - Acceptance: one shared response type includes `asOfDate`, `netWorth`, `incomeExpenseTrend6m`, `investmentAllocation`, and `metadata`.
  - Acceptance: the same type is used across service, IPC, and renderer layers.
- [x] 2. Service tests: future-dated exclusion and net worth core logic
  - Acceptance: transactions dated after local today are excluded from dashboard metrics.
  - Acceptance: net worth is `assets - liabilities` across non-category accounts.
  - Acceptance: investment account value (securities + cash) is included.
- [x] 3. Implement minimal overview service scaffold + net worth metric
  - Acceptance: orchestrator creates shared context and delegates net worth computation.
  - Acceptance: tests from tasks 1-2 pass.

### Batch 2: 6-Month Trend

- [x] 4. Service tests: 6-month bucket boundaries and ordering
  - Acceptance: trend returns current month + previous 5 months using local calendar months.
  - Acceptance: bucket order is deterministic (`YYYY-MM`).
- [x] 5. Service tests: trend inclusion/exclusion rules
  - Acceptance: uncategorized and placeholder-linked transactions are included.
  - Acceptance: internal transfers between user-owned accounts are excluded.
  - Acceptance: monthly `income` and `expense` are returned as separate positive values.
- [x] 6. Implement minimal income/expense trend metric
  - Acceptance: metric passes month-bucket and inclusion/exclusion tests.

### Batch 3: Investment Allocation + FX

- [x] 7. Service tests: allocation composition and empty-state behavior
  - Acceptance: slices are grouped by investment account/portfolio.
  - Acceptance: slice values include securities + investment cash.
  - Acceptance: no-investment case returns `hasData=false` with empty hint metadata.
- [x] 8. Service tests: FX conversion and fallback metadata
  - Acceptance: multi-currency totals convert using latest FX rate.
  - Acceptance: missing latest FX uses last known cached rate.
  - Acceptance: fallback sets metadata flags (`usedEstimatedFxRate`, `missingFxPairs`).
- [x] 9. Implement minimal investment allocation metric + shared FX helper
  - Acceptance: allocation and FX tests pass with deterministic results.

### Batch 4: IPC + Preload Integration

- [x] 10. IPC tests: overview endpoint wiring
  - Acceptance: IPC handler delegates to overview service and returns combined payload.
  - Acceptance: error behavior is consistent with existing IPC patterns.
- [x] 11. Implement IPC handler and preload API for overview payload
  - Acceptance: renderer can call one method to fetch all dashboard cards.
  - Acceptance: IPC tests pass.

### Batch 5: Dashboard UI + Auto-Refresh + E2E

- [x] 12. Renderer tests: loading/success/error/empty states
  - Acceptance: page shows loading before data resolves.
  - Acceptance: success renders three cards from one payload.
  - Acceptance: allocation empty hint renders when `hasData=false`.
- [x] 13. Implement read-only dashboard cards on default home
  - Acceptance: cards render in order: Net Worth, 6-Month Trend, Investment Allocation.
  - Acceptance: cards are read-only and non-drilldown.
- [x] 14. Renderer tests + implementation: debounced auto-refresh
  - Acceptance: dashboard re-fetches when relevant data changes.
  - Acceptance: rapid updates are coalesced/debounced to avoid thrashing.
- [x] 15. E2E test: overview happy path
  - Acceptance: app opens on overview dashboard by default.
  - Acceptance: three cards render and allocation empty hint appears when no investment data exists.
