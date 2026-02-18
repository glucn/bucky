# Tasks: Data Enrichment MVP (F-017)

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

- [x] 1. Add enrichment data models and schema migration
  - Acceptance: Prisma schema adds `AppSetting`, `SecurityMetadata`, `SecurityDailyPrice`, and `FxDailyRate` models.
  - Acceptance: uniqueness/indexes exist for `(ticker, market)`, `(ticker, market, marketDate)`, and `(sourceCurrency, targetCurrency, marketDate)`.
  - Acceptance: migration applies cleanly to test/dev databases.

- [x] 2. Add app settings service for extensible JSON key-value storage
  - Acceptance: app setting read/write supports generic keys with JSON values.
  - Acceptance: `baseCurrency` can be persisted/retrieved via service layer.
  - Acceptance: validation is enforced at consumption points, not generic storage write.

- [x] 3. Add provider adapter contract and startup provider resolution
  - Acceptance: `EnrichmentProviderAdapter` contract includes metadata, daily prices, daily FX, ticker search, and capabilities.
  - Acceptance: startup config selects one active provider via `ENRICHMENT_PROVIDER`.
  - Acceptance: unsupported/missing provider config yields controlled initialization error state.

- [x] 4. Implement Yahoo adapter (trial path)
  - Acceptance: Yahoo adapter implements contract methods used by MVP flow.
  - Acceptance: adapter error mapping preserves provider-specific reason text with light cleanup.
  - Acceptance: adapter has no API key requirement in MVP path.

- [x] 5. Implement Twelve Data adapter (stable path)
  - Acceptance: Twelve Data adapter implements same contract for metadata, daily prices, daily FX, and ticker search.
  - Acceptance: missing `TWELVEDATA_API_KEY` fails gracefully when provider is `twelvedata`.
  - Acceptance: adapter tests cover common success/failure payload mapping.

- [x] 6. Add security setup ticker-search resolution flow (`ticker + market`)
  - Acceptance: ticker-only search returns provider candidates for setup flow.
  - Acceptance: one candidate auto-selects; multiple candidates keep provider order for user selection.
  - Acceptance: zero candidates still allow save with save-time warning only.

- [x] 7. Add enrichment repository and immutable write policies
  - Acceptance: metadata writes fill missing fields only (no overwrite of non-null values).
  - Acceptance: price/FX writes insert missing dates only and do not revise existing points.
  - Acceptance: repository helpers expose latest fetched date and freshness timestamps by category.

- [x] 8. Implement range derivation and gap detection utilities
  - Acceptance: first fetch starts from earliest relevant transaction date.
  - Acceptance: incremental fetch starts from last successful refresh point when history exists.
  - Acceptance: gap detection identifies missing historical windows and returns backfill plan metadata.

- [x] 9. Implement single-run enrichment coordinator and in-memory run state
  - Acceptance: only one run can be active globally.
  - Acceptance: concurrent start attempts return existing run context.
  - Acceptance: run progress/state remains in memory only and includes per-category processed/total counters.

- [x] 10. Implement pipeline executor (metadata -> prices -> FX)
  - Acceptance: selected categories run in fixed order with unselected categories skipped.
  - Acceptance: default execution is one-by-one item processing.
  - Acceptance: run result supports `Completed`, `Completed with issues`, and `Canceled` with partial persistence.

- [x] 11. Add retry and cancellation semantics
  - Acceptance: bounded automatic retries apply to transient failures (network/429/5xx).
  - Acceptance: cancel attempts immediate abort; non-abortable in-flight responses are discarded on return.
  - Acceptance: completed successful writes before cancel/failure are retained.

- [x] 12. Add IPC/preload contracts for enrichment panel + settings
  - Acceptance: renderer can start run, query run state/summary, cancel run, and move run to background.
  - Acceptance: renderer can read/write `baseCurrency` through app settings API.
  - Acceptance: IPC error behavior matches existing app conventions.

- [x] 13. Build global refresh action and enrichment panel UI
  - Acceptance: nav/header includes global refresh entry point.
  - Acceptance: panel supports ad hoc category scope checkboxes (all selected by default).
  - Acceptance: panel shows freshness text for all categories, including deselected ones.
  - Acceptance: when config/base currency is missing, refresh action is visible but disabled with user-friendly message.

- [x] 14. Add foreground/background flow, summary UX, and copy details
  - Acceptance: user can move active run to background and still reopen current run panel.
  - Acceptance: background completion toast opens final summary when clicked.
  - Acceptance: summary shows per-category status plus scrollable failed-item list with identifiers and reason messages.
  - Acceptance: summary includes `Copy failure details` action.

- [x] 15. Add base currency settings integration and FX derivation hooks
  - Acceptance: base currency is set from Settings only and limited to curated list (`USD`, `CAD`, `EUR`, `GBP`, `JPY`, `CNY`, `HKD`, `AUD`).
  - Acceptance: no implicit default base currency; enrichment is blocked until set.
  - Acceptance: changing base currency prompts refresh and opens panel with default full scope.
  - Acceptance: FX derivation treats same-currency conversion as implicit `1.0` without persisted self-pair rows.

- [x] 16. Add missing-data CTA integration and valuation fallback behavior
  - Acceptance: valuation uses unbounded carry-forward of prior daily values when available.
  - Acceptance: when no prior value exists, value is shown as unavailable (not zero).
  - Acceptance: lightweight CTA (banner/snackbar) appears and opens refresh panel.

- [x] 17. Add deterministic tests and end-to-end coverage
  - Acceptance: unit/service tests cover provider selection, incremental/gap logic, immutable writes, retry/cancel, and single-run guard.
  - Acceptance: renderer tests cover disabled-state messaging, scope selection, progress counters, background flow, summary, and copy action.
  - Acceptance: E2E covers missing-data CTA -> refresh and completed-with-issues summary behavior.

- [x] 18. Final regression and documentation sync
  - Acceptance: relevant unit/service/renderer/E2E suites pass for F-017 scope.
  - Acceptance: `requirements.md`, `design.md`, and `tasks.md` are aligned with dual-provider MVP implementation (`yahoo` + `twelvedata`).
  - Acceptance: implementation deviations are documented explicitly before completion.

## Implementation Deviations

- None identified for MVP scope.
