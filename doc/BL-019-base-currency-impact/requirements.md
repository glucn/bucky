# Requirements: BL-019 Base Currency Impact

## 1. Overview

BL-019 expands base-currency behavior introduced in F-017 so it is consistent across:

- reporting/valuation surfaces
- app-wide post-change warning and refresh flow
- create/edit setup flows for accounts, portfolios, and categories

This scope combines both reporting and create/edit behavior in one deliverable.

## 2. Goals

- Reflect base-currency changes immediately and consistently across the app.
- Make post-change FX data gaps explicit and actionable.
- Keep workflows usable while warning about incomplete valuation state.
- Standardize default currency behavior for new entities.

## 3. Non-Goals

- No automatic mutation of existing account/portfolio/category currencies.
- No automatic refresh run immediately after base-currency save.
- No blocking/locking of normal user actions while FX refresh is pending.
- No schema removal of category `currency` storage in this scope.

## 4. Terminology

- **Base currency**: value stored in `AppSetting[key=baseCurrency]`.
- **Pending FX reconciliation**: state after base-currency change and before successful FX refresh for new base-currency requirements.

## 5. Product Decisions (Locked)

- Include both reporting surfaces and create/edit surfaces in this scope.
- Existing entities are never auto-updated when base currency changes.
- New defaults:
  - new investment portfolio currency defaults to current base currency
  - new non-investment account currency is prefilled with base currency and remains editable
  - category currency selector is hidden in both create and edit flows
- Category `currency` remains stored for compatibility; existing stored category currencies remain unchanged.
- After base-currency change:
  - app enters pending FX reconciliation state
  - app-wide warning banner/snackbar is shown
  - warning includes mandatory/prominent CTA to refresh
  - CTA opens existing Data Refresh panel with FX-only preselected
  - warning persists until successful FX refresh
  - warning supports escape hatch (`Dismiss for now`)
  - dismissed warning reappears on next app launch if still pending
- Reporting/valuation display switches immediately to new base currency, with warnings while pending.
- Warning severity is `warning` (not blocking error) by default.

## 6. Functional Requirements

### R1. Base Currency Save

- Saving base currency updates settings immediately.
- If new value differs from previous value, set pending FX reconciliation state.
- Save flow remains non-blocking.

### R2. App-Wide Pending Warning

- While pending FX reconciliation is active, show app-wide warning banner/snackbar.
- Warning copy explains that valuations may be incomplete until FX refresh succeeds.
- Banner actions:
  - `Refresh FX now` -> opens existing Data Refresh panel with FX-only preselected
  - `Dismiss for now` -> hides warning for current app session
- If dismissed and still pending, warning must reappear on next app launch.

### R3. Pending State Resolution

- Pending FX reconciliation clears only when FX refresh completes successfully for current base-currency requirements.
- Failed or canceled refresh does not clear pending state.
- While pending, features remain usable and show warning context.

### R4. Reporting and Valuation Surfaces

- Dashboard, portfolio, position, and related valuation displays switch immediately to new base-currency display context.
- While pending, affected surfaces show clear non-blocking warnings/indicators.
- No hard-blocking restrictions on actions.

### R5. Create/Edit Defaults

- Currency defaults are resolved at modal open time (not live-updating while modal is open).
- New investment portfolio currency defaults to current base currency.
- New non-investment account currency defaults to current base currency and remains editable.
- Existing accounts/portfolios/categories are not auto-mutated by base-currency changes.

### R6. Category Currency UX

- Hide/remove category currency field in both create and edit category flows.
- Keep category currency persisted internally for compatibility.
- Existing category currency values remain unchanged.

### R7. Refresh Panel Reuse

- Use the existing Data Refresh panel.
- From pending-warning CTA, open panel with:
  - FX selected
  - security metadata deselected
  - security prices deselected
- User may still manually adjust scope before starting run.

### R8. Seed and Default Currency Alignment

- Seeded/default account creation paths must be base-currency-aware and must not rely on hardcoded `USD` once base currency is configured.
- This includes initialization/reset/default-account flows and system-account creation paths that currently set currency defaults.
- If base currency is not configured yet, existing fallback behavior may use `USD` until user sets base currency.
- After base currency is configured, subsequent seeded/default entities must use base currency unless a flow explicitly requires a different currency.

## 7. State and Persistence Requirements

- Persist pending FX reconciliation state so it survives app restart.
- Persist dismiss-for-session behavior only for current process/session.
- On app launch, evaluate pending state and re-show warning if unresolved.

## 8. UX and Copy Requirements

- Tone: warning/informational, action-oriented.
- Must not imply data corruption; should communicate temporary incompleteness.
- Example warning:
  - "Base currency changed to CAD. Run FX refresh for complete valuations."

## 9. Acceptance Criteria

- Changing base currency triggers pending FX reconciliation state.
- App-wide warning appears after base-currency change.
- `Refresh FX now` opens existing refresh panel with FX-only preselected.
- Warning persists until successful FX refresh.
- Failed/canceled refresh keeps warning active.
- `Dismiss for now` hides warning for current session and warning reappears on next launch if unresolved.
- Reporting/valuation surfaces switch immediately to new base-currency context and show warnings while pending.
- New portfolio/account defaults follow base currency at modal open time.
- Category currency field is hidden in both create and edit flows.
- Existing entity currencies are unchanged by base-currency updates.
- Seeded/default/system account currency behavior aligns with configured base currency (without rewriting historical existing rows).

## 10. Risks and Notes

- Define "successful FX refresh" carefully to avoid premature clearing of pending state.
- Avoid duplicate warning signals (global banner + page-level alerts) that overwhelm users.
- Keep compatibility for existing category-currency assumptions until future schema cleanup.
- Audit existing hardcoded currency defaults in service-layer initialization/reset paths (for example account/system seed logic) to prevent UX inconsistency after base-currency adoption.
