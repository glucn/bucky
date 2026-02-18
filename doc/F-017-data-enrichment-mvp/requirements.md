# Requirements: Data Enrichment MVP (F-017)

## 1. Objective

Provide a top-level, user-triggered data enrichment flow for investment data that:

- Fetches and stores security metadata.
- Fetches and stores security daily price history.
- Fetches and stores FX daily rates.
- Keeps bookkeeping and transaction-entry flows non-blocking and reliable.

## 2. In Scope (MVP)

- Global refresh entry point in the main navigation/header.
- Refresh panel/modal with scope selection and run progress.
- Manual runs only (no scheduler).
- Foreground execution with optional continuation in background.
- Cancellation of active runs.
- Local persistence of successful partial results.
- Final run summary with item-level failure details.

## 3. Out of Scope (MVP)

- User-selectable data provider.
- Automatic fallback to secondary provider.
- Background run resume across app restart.
- Intraday price/rate support.
- Data retention pruning.

## 4. Data Domains

### 4.1 Security Metadata

Minimum required fields:

- `symbol`
- `displayName`
- `assetType`
- `quoteCurrency`

### 4.2 Security Price History

- Daily close data only.
- No intraday values in MVP.

### 4.3 FX Rates

- Daily rates only.
- No intraday rates in MVP.

### 4.4 Extensibility

Data model and service boundaries must keep room for future finer-granularity data (for example intraday), without breaking MVP behavior.

## 5. Identity and Date Rules

### 5.1 Canonical Security Identity

- Enrichment identity must use canonical security key: `ticker + market` (exchange/MIC equivalent).
- Ticker-only identity is not valid.

### 5.2 Domain Assumption

- System assumes each security already has both ticker and market identity.

### 5.3 Date Authority

- Daily price and FX records must be stored and queried by provider market date.

### 5.4 "Today" Valuation Rule

- Use last completed daily close/rate only.
- Do not use intraday-derived values.

## 6. Refresh Entry and Panel UX

### 6.1 Entry

- A global refresh action is available in the main navigation/header.

### 6.2 Invalid/Missing System Configuration

- Refresh action remains visible.
- Action is disabled when configuration is invalid/missing.
- Show a user-friendly generic setup message (no technical env/config details).

### 6.3 Scope Selection

- Scope is selected ad hoc each run.
- No saved default preset.
- Scope choices are high-level categories only:
  - Security metadata
  - Security price history
  - FX rates
- All categories are selected by default.
- Deselected categories still show their freshness info as read-only.

### 6.4 Freshness Display

- Show freshness in panel/modal using relative phrasing (for example: "Refreshed 3 days ago", "Never refreshed").
- Freshness appears in refresh panel/modal only.

### 6.5 Security Market Resolution During Setup

- To help users pick the correct `ticker + market` identity, the system should query candidate instruments from the configured provider.
- Candidate search is ticker-only in MVP.
- If exactly one candidate is returned, auto-select it.
- If multiple candidates are returned, show candidates in provider order and let user choose.
- If zero candidates are returned, user can still save the security, with a warning at save time that enrichment may be unavailable.
- The unresolved warning is shown only at save time (no persistent unresolved badge requirement in MVP).

## 7. Run Lifecycle

### 7.1 Concurrency

- Only one refresh run may be active globally.
- If user triggers refresh during an active run, open the existing run panel and show current progress.

### 7.2 Foreground and Background

- Runs start in foreground with visible progress.
- User may choose to continue run in background.
- If app closes/restarts, active background run stops and must be restarted manually.

### 7.3 Cancellation

- User can cancel active run.
- System must attempt immediate abort.
- If in-flight request cannot be interrupted, discard that response when it returns.
- Keep data already persisted from completed steps before cancel.

### 7.4 Completion Notifications

- When a background run completes (success / completed with issues / canceled), show toast/snackbar notification.
- Clicking notification opens refresh panel with final run summary.

## 8. Range, Incremental Refresh, and Backfill

### 8.1 Incremental Rule

- Use inferred required range.
- If no existing history: start from earliest relevant transaction date.
- If history exists: fetch from last successful refresh point forward.

### 8.2 Gap Detection

- Detect history gaps introduced by backdated transactions.
- Prompt user for confirmation when gap backfill is needed.
- Default user action is "backfill missing gaps only".

### 8.3 Gap Backfill Behavior

- Gap backfill is automatic behavior when price/FX categories are selected and gaps are detected.
- In gap-only backfill mode, do not revise already-covered dates.

## 9. Missing Data and Coverage Rules

### 9.1 Carry-Forward Rule

- For non-trading/non-quoted days, use last available prior daily value.
- Lookback is unbounded.

### 9.2 No Prior Value Exists

- Show value as unavailable (never zero).
- Show lightweight banner/snackbar CTA to refresh when detected.
- CTA may reappear on repeated detection in the same view/session.

### 9.3 Coverage Gaps in Summary

- Final summary must include coverage-gap warnings with earliest available date per affected item.

## 10. Progress and Final Summary

### 10.1 Progress

- Show processed vs total counters.
- Show per-category processed vs total counters.

### 10.2 Final Result

- Show per-category result status (for example done / issues / canceled).

### 10.3 Issue Detail Requirements

For categories with issues:

- Show item-level identifiers:
  - Security: ticker + market
  - FX: pair identifier
- Show reason code/message per failed item.
- Show all failed items in a scrollable list.
- Provide a single "Copy failure details" action.
- Keep failure messaging user-friendly with light cleanup only; do not perform heavy message rewriting.
- Prefer provider-specific reason wording when available.
- If provider message is empty or unusable, show a generic fallback: `Unable to fetch data from provider`.

### 10.4 Unresolved Instrument Handling in Summary

- Refresh should still attempt provider lookups for saved securities on each run.
- No dedicated "skipped unresolved" summary section is required in MVP.

## 11. Persistence and Integrity

- Persist successful partial results even when run result is "Completed with issues".
- Do not roll back successful partial writes due to unrelated failures.
- Keep enrichment data indefinitely (no automatic pruning).
- Enrichment must not mutate journal facts or double-entry transaction records.
- For provider identity, persist only `ticker + market` in MVP (no provider-native instrument ID persistence requirement).

## 12. Provider Architecture Requirements

- Requirements remain provider-agnostic.
- System must support provider switching through system configuration.
- Provider selection occurs at app startup.
- Provider selection is not user-controlled in MVP.
- If configured provider is unavailable/rate-limited, fail run with clear user-visible error.
- No automatic provider fallback in MVP.

## 13. Reliability

- Bounded automatic retries are required for transient failures (for example network/429/5xx).
- Exact retry policy (attempt count/backoff/jitter) is defined in design, not requirements.

## 14. Testing Requirements

- Unit tests for mapping, normalization, date handling, and coverage behavior.
- Service tests for incremental refresh, gap detection, partial persistence, cancellation semantics, and single-run locking.
- UI tests for scope selection, progress, background mode, summary details, copy action, and disabled-state messaging.
- End-to-end tests for missing-data CTA -> refresh flow and completed-with-issues flow.
