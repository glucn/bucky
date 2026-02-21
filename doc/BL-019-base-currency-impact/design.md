# Design: BL-019 Base Currency Impact

## 1. Overview

BL-019 extends base-currency behavior from F-017 so currency handling is consistent across:

- app-wide post-change warning and FX reconciliation flow
- summary vs detail valuation display
- account/portfolio/category create/edit flows
- default/seed account initialization paths

This design keeps accounting facts unchanged (journal lines and account history stay intact) while improving valuation clarity and UX consistency.

## 2. Goals and Constraints

### 2.1 Goals

- Use base currency as the canonical reporting currency for compact totals.
- Show transparent native-currency breakdown on detail-capable surfaces.
- Make base-currency change reconciliation explicit and restart-safe.
- Remove hardcoded USD defaults once base currency is configured.

### 2.2 Constraints

- No auto-mutation of existing accounts/categories/portfolios.
- No automatic refresh run after base-currency change.
- Keep all user actions non-blocking while reconciliation is pending.
- Category `currency` remains stored for compatibility, but hidden in create/edit UI.

### 2.3 First-Time Setup Rule

- Base currency is mandatory in first-time setup.
- If base currency is unset, app must show explicit setup guidance and route user to configure it.
- Base currency remains editable after setup through Settings.

## 3. Display Model

## 3.1 Summary vs Detail Contract

- **Summary surfaces (limited space)**:
  - show only converted base-currency total
  - if any required conversion is missing -> whole value is `N/A`
- **Detail-capable surfaces**:
  - column order: `Value (Base)` then `Value (Native)`
  - row conversion missing -> base value `N/A`, native value shown
  - any missing row conversion in section -> aggregate base total `N/A`
  - still show native aggregate breakdown by currency

## 3.2 Conversion Policy

- Same currency: implicit `1.0`.
- Otherwise: use as-of date FX rate first, latest-rate fallback second.
- If neither exists: conversion unavailable (`N/A` behavior above).
- No per-value fallback marker required.

## 4. Reconciliation State

## 4.1 Persisted Record

Store a dedicated app setting key:

- key: `baseCurrencyReconciliationState`
- value shape:

```ts
{
  targetBaseCurrency: string;
  status: "pending" | "resolved";
  changedAt: string;   // ISO
  resolvedAt?: string; // ISO
}
```

## 4.2 State Transitions

- On base-currency change (value actually changed): set state to `pending`.
- State becomes `resolved` only when:
  - a refresh run includes FX scope, and
  - FX category completes with zero failed FX items.
- Any canceled run, failed FX items, or non-FX run keeps `pending`.

## 4.3 Dismiss Behavior

- Banner dismissal (`Dismiss for now`) is session-only renderer state.
- Persisted reconciliation state remains unchanged.
- On next app launch, banner reappears if persisted status is still `pending`.

## 5. Backend Design

## 5.1 App Settings Service

Extend `appSettingsService` with typed helpers:

- `getBaseCurrencyReconciliationState()`
- `setBaseCurrencyReconciliationState(state)`

Also update base-currency setter path to mark reconciliation pending when value changes.

## 5.2 Enrichment Runtime Integration

In enrichment runtime completion logic:

- read current `baseCurrencyReconciliationState`
- if no reconciliation record exists, do nothing
- if record exists but is already `resolved`, do nothing (idempotent)
- if record is `pending` for the current `targetBaseCurrency`:
  - inspect completed run summary for FX category failures
  - if FX category succeeded with zero failed FX items, update status to `resolved`
  - otherwise keep status as `pending`

This keeps run-level errors in existing run summary and reconciliation status minimal.

## 5.3 Conversion Data Source

- Canonical FX source for valuation conversion is `FxDailyRate`.
- Services should not depend on inferred rates from `currency_transfer` journal entries for BL-019 totals.

## 5.4 Service-Level Gaps and Refactor Targets

- `overviewService`:
  - currently derives reporting currency from first user account.
  - must use configured `baseCurrency`.
  - convert all summary totals to base currency using policy above.
- `investmentService.getPortfolioValue`:
  - currently sums mixed-currency amounts directly.
  - must output base-converted summary totals and retain native breakdown support for detail UIs.

## 6. Frontend Design

## 6.1 App-Wide Warning Banner

Add persistent top banner host in app shell (`App` level):

- visible when reconciliation status is `pending` and session dismissal is not active
- severity: warning
- actions:
  - `Refresh FX now` -> open existing Data Refresh panel with FX-only preselected
  - `Dismiss for now` -> hide until app restart

## 6.1.1 First-Time Base Currency Prompt

- On first run (or any state where base currency is unset), show a mandatory setup prompt.
- Prompt must clearly explain base currency is required for valuation/reporting.
- Prompt action navigates user to base-currency settings workflow.
- Do not silently pick a default base currency behind the scenes.

## 6.2 Refresh Panel Preset Entry

When launched from banner CTA:

- `fxRates = true`
- `securityMetadata = false`
- `securityPrices = false`

User may still edit scope before starting run.

## 6.3 Page-Level Rendering Rules

Update major valuation pages to follow summary/detail contract:

- `Dashboard` summary cards -> base-only totals with `N/A` if conversion incomplete
- `InvestmentPortfolios` cards -> base summary totals, native hints only in detail context
- `PortfolioDetails` and `PerformanceReports` -> both columns (`Value (Base)`, `Value (Native)`)
- `PositionDetails` -> base summary values + native detail where appropriate

## 6.4 Currency Formatting

- Remove hardcoded `USD` formatters in renderer pages.
- Use shared currency formatting utilities consistently, backed by `Intl.NumberFormat` (no large custom symbol map maintenance).
- All converted values format with current base currency.
- Formatting policy:
  - single-currency summary values: `currencyDisplay: "symbol"`
  - multi-currency detail/breakdown values: disambiguated display (`currencyDisplay: "code"` or symbol + explicit code label)
- Rely on locale-aware `Intl` behavior for disambiguation (for example `CA$`, `US$`, `CN¥` where applicable).

## 7. Create/Edit and Seeding Alignment

## 7.1 Create/Edit Defaults

- Defaults resolved at modal open time.
- New investment portfolio currency defaults to base currency.
- New non-investment account currency defaults to base currency and remains editable.
- Category currency field hidden in create and edit flows.

## 7.2 Existing Data Behavior

- Existing account/category/portfolio currencies remain unchanged.
- Category `currency` storage remains for compatibility.

## 7.3 Seed and System Defaults

Audit and update seed/default account creation paths (for example `database.ts` defaults):

- if base currency configured -> use base currency
- if base currency not configured -> existing USD fallback allowed

Note: USD fallback is an initialization safety fallback only. First-time setup still requires user to choose a base currency before valuation/reporting is treated as fully configured.

## 8. Accounting and Data Integrity

- No mutation of existing journal entries or journal lines.
- No retroactive currency conversion writeback to accounting facts.
- BL-019 affects valuation presentation, defaults for new entities, and reconciliation signaling only.

## 9. IPC and Contracts

Extend renderer-visible config/state payloads to include:

- current base currency
- reconciliation status (`pending | resolved`)
- optional target currency + timestamps for diagnostics

Keep these contracts typed in preload and renderer type declarations.

## 10. Testing Strategy

### 10.1 Unit / Service

- base-currency change sets reconciliation `pending`
- FX success with zero failed FX items sets `resolved`
- failed/canceled FX run keeps `pending`
- conversion aggregation rules enforce `N/A` behavior correctly

### 10.2 IPC / Integration

- reconciliation state exposed correctly through IPC
- refresh-panel preset invocation from warning context sets FX-only defaults

### 10.3 Renderer

- app-wide banner visibility and dismissal semantics
- summary vs detail rendering rules (`N/A`, column order, native breakdown)
- create/edit defaults by base currency at modal open time
- category currency field hidden for create/edit

### 10.4 E2E

- change base currency -> warning banner appears
- CTA opens refresh panel with FX-only preselection
- successful FX run clears banner
- failed FX run keeps banner

## 11. Rollout Plan

1. Add reconciliation state model + settings helpers.
2. Wire enrichment completion to resolve pending state.
3. Add app-wide warning banner + FX-only panel preset flow.
4. Refactor service totals to base-currency conversion model.
5. Update renderer summary/detail surfaces and currency formatting.
6. Align create/edit defaults and seed/system default paths.
7. Run full test coverage and sync docs.

## 12. Deferred Items (Not Yet Backlogged)

The following related ideas were explicitly discussed but are not included in current backlog entries yet:

- Auto-start FX-only refresh immediately after base-currency change (instead of mandatory CTA-triggered refresh).
- Optional blocking safeguards for selected actions while reconciliation is pending (current design is intentionally non-blocking).
- Expanded reconciliation diagnostics model beyond `pending | resolved` (for example richer reconciliation attempt history and root-cause details specific to base-currency transitions).
- Full app locale/user-preference strategy for currency and number presentation beyond BL-019 currency-display rules.
