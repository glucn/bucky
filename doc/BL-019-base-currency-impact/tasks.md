# Tasks: Base Currency Impact (BL-019)

## Status Legend

- [x] Completed
- [/] In progress
- [ ] Planned/Not started

## TDD Cadence (applies to each task)

- Write/adjust a failing test first.
- Implement the smallest change to pass.
- Run focused verification for the touched area.
- Refactor only when tests are green.

## Tasks

- [x] 1. Add persisted reconciliation state contract in app settings service
  - Acceptance: add typed read/write helpers for `baseCurrencyReconciliationState`.
  - Acceptance: state shape supports `targetBaseCurrency`, `status` (`pending | resolved`), `changedAt`, optional `resolvedAt`.
  - Acceptance: service tests cover valid parse, invalid payload fallback, and idempotent writes.

- [x] 2. Mark reconciliation pending on base currency change
  - Acceptance: changing base currency value sets reconciliation state to `pending` for the new target currency.
  - Acceptance: saving unchanged base currency does not reset timestamps or re-open pending state.
  - Acceptance: accounting data (accounts/journal lines) is not mutated by this operation.

- [x] 3. Resolve reconciliation only on strict FX success
  - Acceptance: enrichment completion updates reconciliation to `resolved` only when FX category runs with zero failed FX items.
  - Acceptance: non-FX runs, canceled runs, or FX runs with failures keep state `pending`.
  - Acceptance: if reconciliation record is missing or already resolved, runtime update path is safe no-op.

- [x] 4. Expose base currency + reconciliation state through IPC/preload
  - Acceptance: renderer can read current base currency and reconciliation status in one stable contract.
  - Acceptance: preload/types are aligned and strongly typed.
  - Acceptance: IPC tests cover happy path and missing-state fallback behavior.

- [x] 5. Add app-shell global warning banner infrastructure
  - Acceptance: persistent top banner renders app-wide when reconciliation is `pending`.
  - Acceptance: warning severity is non-blocking (`warning`) and does not disable core actions.
  - Acceptance: banner is hidden when reconciliation is `resolved`.

- [x] 6. Implement banner actions and session-only dismiss semantics
  - Acceptance: `Refresh FX now` opens existing enrichment panel.
  - Acceptance: `Dismiss for now` hides banner for current app session only.
  - Acceptance: on app relaunch, banner reappears if persisted reconciliation is still `pending`.

- [x] 7. Add FX-only preset entry path for refresh panel
  - Acceptance: opening panel from banner preselects `fxRates=true`, `securityMetadata=false`, `securityPrices=false`.
  - Acceptance: user can still manually adjust scope before starting run.
  - Acceptance: renderer tests verify preset is applied only for this entry path.

- [ ] 8. Standardize conversion engine contract for valuation services
  - Acceptance: conversion policy is centralized: as-of rate first, latest fallback second, otherwise unavailable.
  - Acceptance: same-currency conversion returns implicit `1.0`.
  - Acceptance: conversion result includes enough metadata for `N/A` decisions (without per-value fallback marker UI).

- [ ] 9. Refactor overview totals to base-currency-first aggregation
  - Acceptance: overview reporting currency source is `baseCurrency` (not first user account currency).
  - Acceptance: compact summary totals become base-converted or `N/A` if any required conversion is unavailable.
  - Acceptance: trend/allocation logic follows same conversion policy and preserves accounting correctness.

- [ ] 10. Refactor investment portfolio valuation aggregation
  - Acceptance: `getPortfolioValue` no longer directly sums mixed-currency amounts.
  - Acceptance: summary totals return base-converted values or `N/A` under missing conversion.
  - Acceptance: native-currency breakdown remains available for detail surfaces.

- [ ] 11. Apply summary-vs-detail display policy in portfolio pages
  - Acceptance: compact totals use base-currency single-value display.
  - Acceptance: detail-capable tables/sections show `Value (Base)` then `Value (Native)`.
  - Acceptance: if any row is unconvertible, section base aggregate is `N/A` and native aggregate breakdown remains visible.

- [ ] 12. Apply display policy in dashboard and performance/position surfaces
  - Acceptance: dashboard summary cards use base-converted values or `N/A`.
  - Acceptance: performance/position detail sections adopt base + native pattern where space allows.
  - Acceptance: affected screens keep clear non-blocking warning context while reconciliation is pending.

- [ ] 13. Replace hardcoded USD render formatters with Intl-driven shared utilities
  - Acceptance: renderer no longer hardcodes `"USD"` in valuation/total formatters for BL-019 surfaces.
  - Acceptance: single-currency summary formatting uses symbol-style display.
  - Acceptance: multi-currency detail formatting is disambiguated (code or explicit code label).

- [x] 14. Align create/edit defaults with base currency at modal-open time
  - Acceptance: new investment portfolio default currency = current base currency.
  - Acceptance: new non-investment account currency is prefilled from base currency and remains editable.
  - Acceptance: defaults are resolved at modal open time (not live-updated while modal is open).

- [x] 15. Remove category currency selector in create/edit flows (compat storage retained)
  - Acceptance: category currency field is hidden/removed in both create and edit category UI.
  - Acceptance: existing category currency values remain unchanged.
  - Acceptance: create/edit behavior continues to preserve accounting rules for category transactions.

- [x] 16. Make first-time base currency setup mandatory
  - Acceptance: first-time setup requires selecting base currency before valuation/reporting experience is considered configured.
  - Acceptance: if base currency is unset, user sees explicit setup prompt with path to configure.
  - Acceptance: no silent hidden base currency assumption in UI flows.

- [x] 17. Align seed/default/system account currency initialization behavior
  - Acceptance: after base currency is configured, seed/default/system account creation uses base currency rather than hardcoded USD.
  - Acceptance: before base currency is configured, initialization fallback behavior remains safe and deterministic.
  - Acceptance: existing historical rows are not rewritten during this change.

- [ ] 18. Add deterministic test hooks and E2E coverage for BL-019 flows
  - Acceptance: stable test hooks exist for global banner, dismiss action, and FX-only refresh CTA path.
  - Acceptance: E2E covers base-currency change -> pending banner -> FX-only refresh -> resolved clear.
  - Acceptance: E2E covers dismiss-for-session and relaunch reappearance behavior.

- [ ] 19. Final regression and documentation sync
  - Acceptance: relevant unit/service/renderer/E2E suites pass for BL-019 scope.
  - Acceptance: `requirements.md`, `design.md`, and `tasks.md` are aligned with agreed behavior.
  - Acceptance: implementation deviations are documented explicitly (if any).

## Implementation Deviations

- None identified yet.
