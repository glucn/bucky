# Design: Data Enrichment MVP (F-017)

## 1. Overview

F-017 introduces a top-level data enrichment flow that fetches and stores:

- security metadata
- security daily prices
- FX daily rates

The design is provider-agnostic, runs as a single foreground pipeline (with optional background continuation), persists fetched data incrementally, and keeps run-progress state in memory only.

## 2. Goals and Constraints

### 2.1 Goals

- Provide reliable manual refresh for enrichment data.
- Keep accounting/journal facts untouched.
- Support provider switching via startup config.
- Keep architecture extensible for future multi-provider support.

### 2.2 Explicit MVP Constraints

- One active provider at startup.
- Two provider adapters are implemented in MVP (`yahoo`, `twelvedata`), but only one is active per app run.
- No automatic provider fallback.
- No run resume after app restart.
- One active refresh run globally.
- Daily data only (prices + FX).
- Price/FX points are immutable once stored.

## 3. Architecture

### 3.1 Components

- `EnrichmentProviderAdapter` (provider interface)
- `EnrichmentCoordinator` (single-run guard + lifecycle)
- `EnrichmentPipelineExecutor` (metadata -> prices -> FX)
- `EnrichmentRepository` (DB persistence + queries)
- `EnrichmentProgressStore` (in-memory run state)
- `EnrichmentIpcHandlers` (renderer access)

### 3.2 Startup Provider Resolution

- Provider is selected from system configuration at app startup.
- If config is invalid/missing, refresh action is visible but disabled with user-friendly setup messaging.
- No user-level provider selection in MVP.
- MVP ships with two provider adapters:
  - `yahoo` for fast trial-and-error iterations
  - `twelvedata` for stable/default production use

### 3.3 Provider Capability Contract

Even with one active provider in MVP, adapters expose capabilities for future routing:

- `supportsSecurityMetadata`
- `supportsSecurityDailyPrices`
- `supportsFxDailyRates`
- `supportsBatchRequests` (future optimization; MVP execution still defaults one-by-one)

### 3.4 Provider Evaluation and MVP Choice

Requirements remain provider-agnostic, but MVP needs one concrete provider choice.

Evaluated providers (official sources):

- Twelve Data docs and pricing: `https://twelvedata.com/docs`, `https://twelvedata.com/pricing`
- Alpha Vantage docs and premium plans: `https://www.alphavantage.co/documentation/`, `https://www.alphavantage.co/premium/`
- Financial Modeling Prep docs and pricing: `https://site.financialmodelingprep.com/developer/docs`, `https://site.financialmodelingprep.com/pricing-plans`
- Yahoo Finance API ecosystem references (official company site + widely used community wrappers): `https://www.yahoofinanceapi.com/`, `https://ranaroussi.github.io/yfinance/`

Evaluation criteria:

- Must cover all three MVP domains in one integration:
  - security metadata
  - daily security prices
  - daily FX rates
- Must support ticker discovery/search needed for `ticker + market` selection.
- Must have clear documented API behavior and practical plan/limit model.
- Must be operable via startup system config with provider abstraction.

#### Provider Comparison

##### 1) Twelve Data

Pros:

- Single provider covers stocks/forex/crypto and includes symbol search + profile + daily time series + FX endpoints.
- Docs and endpoint surface align well with MVP needs (`time_series`, profile/search, FX conversions/rates).
- Pricing model exposes explicit API-credit limits and free-tier entry.

Cons:

- Credit-based limits can require careful request budgeting for broad refresh runs.
- Full market depth/features vary by plan.

MVP fit: Strong.

##### 2) Alpha Vantage

Pros:

- Strong, long-standing documentation for global equities and FX daily series.
- Provides company overview and symbol search endpoints.
- Straightforward HTTP model and broad community familiarity.

Cons:

- Free-tier usage limit is very low for our refresh workflow (documentation notes 25 requests/day on free).
- Several useful endpoints/behaviors are premium-gated, making predictable throughput dependent on paid plans.
- Endpoint/function taxonomy is broad and sometimes uneven for unified adapter ergonomics.

MVP fit: Medium.

##### 3) Financial Modeling Prep (FMP)

Pros:

- Broad endpoint catalog with company profile/search, historical prices, and forex coverage.
- Clear published plan ladder with rate limits and historical depth differences.
- Good long-term extensibility for additional datasets.

Cons:

- Product surface is very broad and plan-tier gating is complex, increasing adapter/policy complexity for MVP.
- Coverage/quality characteristics vary by dataset and tier; requires more upfront contract hardening.

MVP fit: Medium-High.

##### 4) Yahoo Finance API ecosystem

Pros:

- Very widely adopted by retail developers and data enthusiasts.
- Broad symbol coverage and strong ecosystem familiarity.
- Fast prototyping path with community tooling.

Cons:

- Integration paths are often wrapper/scraping-driven and can be less contract-stable than enterprise-focused market-data providers.
- API behavior and field consistency can vary across wrappers/endpoints.
- Operational and long-term support expectations are less clear for strict production SLAs.

MVP fit: Medium (good for experimentation; higher operational risk for primary production dependency).

#### Recommendation

MVP implementation includes **both Yahoo and Twelve Data adapters**.

Recommended active-provider defaults:

- Development/trial profile: `yahoo`
- Stable/production profile: `twelvedata`

Reasoning:

- Best balance of one-provider coverage for our three required domains.
- Good match for ticker-discovery + canonical `ticker + market` setup flow.
- Clear enough quota model to design bounded retries and predictable refresh behavior.
- Lower implementation risk than a multi-provider composition for MVP.

Why this remains future-safe:

- Provider-specific logic is isolated behind `EnrichmentProviderAdapter`.
- Startup config selects one provider in MVP.
- Capability contract keeps path open for future multi-provider routing by asset class.
- Yahoo and Twelve Data both use the same adapter contract from day one, so the code path is exercised across both providers early.

Out-of-scope for MVP:

- Runtime provider switching.
- Automatic fallback/multi-provider orchestration.
- User-facing provider selection.

Startup config contract (proposed):

- `ENRICHMENT_PROVIDER=<provider-id>` (single value in MVP)
- Provider credentials/config loaded from system config/env
- supported values in MVP:
  - `ENRICHMENT_PROVIDER=yahoo`
  - `ENRICHMENT_PROVIDER=twelvedata`
- Twelve Data credentials:
  - `TWELVEDATA_API_KEY=<api-key>` (required when `ENRICHMENT_PROVIDER=twelvedata`)
- Yahoo adapter credentials:
  - no API key requirement in MVP adapter path

## 4. Data Model

## 4.1 New/Updated Tables

### A) `AppSetting`

Generic key-value settings table for extensibility.

- `key` (unique)
- `jsonValue` (JSON text)
- `createdAt`
- `updatedAt`

Initial key introduced by F-017:

- `baseCurrency`

Validation is performed at consumption points, not globally at storage write.

### B) `SecurityMetadata`

Per canonical security identity (`ticker + market`).

- `ticker`
- `market`
- `displayName` (nullable)
- `assetType` (nullable)
- `quoteCurrency` (nullable)
- `lastFetchedAt`
- unique index: `(ticker, market)`

Policy: metadata refresh fills missing fields only; existing non-null fields are not overwritten in MVP.

### C) `SecurityDailyPrice`

Daily close time-series.

- `ticker`
- `market`
- `marketDate` (provider market date)
- `close`
- `fetchedAt`
- unique index: `(ticker, market, marketDate)`

Policy: immutable rows per key/date; insert missing dates only.

### D) `FxDailyRate`

Canonical FX direction for valuation.

- `sourceCurrency`
- `targetCurrency` (app base currency)
- `marketDate` (provider market date)
- `rate`
- `fetchedAt`
- unique index: `(sourceCurrency, targetCurrency, marketDate)`

Policy: immutable rows per pair/date; insert missing dates only.

## 4.2 Existing Domain Assumptions

- Securities already have both ticker and market identity.
- Ticker-only identity is invalid for enrichment.

## 5. Refresh Pipeline

## 5.1 Pipeline Order

Fixed order for MVP:

1. Security metadata
2. Security daily prices
3. FX daily rates

Each category may be disabled by user scope selection, but order remains fixed among selected categories.

## 5.2 Execution Strategy

- Default execution is one-by-one requests.
- Batch support is deferred, but capability flags are included for future optimization.
- Progress updates are emitted per processed item.

## 5.3 Incremental Range Rules

For prices and FX:

- if no history exists -> start at earliest relevant transaction date
- else -> start from last successful refresh point

Gap handling:

- detect historical gaps caused by backdated data
- prompt user for confirmation
- default action is backfill missing gaps only
- gap mode does not revise already-covered dates

## 5.4 Partial Success and Final Status

- Persist successful results immediately.
- Do not roll back successful rows due to unrelated failures.
- Run can end as `Completed`, `Completed with issues`, or `Canceled`.

## 6. Concurrency and Run State

### 6.1 Single Active Run

- Global mutex/guard prevents concurrent runs.
- Triggering refresh during an active run opens current run panel.

### 6.2 In-Memory Progress Store

Store only runtime state in memory:

- run id
- selected scope
- category totals/processed counters
- per-category result status
- failed item list (identifier + reason)

No DB persistence for run-state in MVP.

### 6.3 Cancellation

- User cancellation signals immediate abort intent.
- In-flight calls are canceled when supported.
- If call cannot be interrupted, late response is discarded.

## 7. UI and Interaction Design

## 7.1 Entry and Panel

- Global action in main nav/header opens refresh panel.
- Panel shows category checkboxes (all selected by default):
  - Security metadata
  - Security price history
  - FX rates

## 7.2 Freshness

Panel shows relative freshness per category (including deselected categories).

Examples:

- `Refreshed today`
- `Refreshed 4 days ago`
- `Never refreshed`

## 7.3 Progress and Summary

- Progress shows processed/total counters per category.
- Final summary includes:
  - per-category status
  - scrollable list of all failed items
  - item identifiers
  - provider-reason messages (lightly cleaned for user friendliness)
  - `Copy failure details` action

If provider reason is missing/unusable, fallback to:

- `Unable to fetch data from provider`

## 7.4 Background Mode and Notification

- Run starts in foreground.
- User can move run to background.
- Completion toast/snackbar appears for success/issues/cancel.
- Clicking notification reopens final summary.
- App close/restart stops active run.

## 7.5 Missing-Data CTA

When valuation detects unavailable enrichment data:

- show lightweight banner/snackbar CTA to refresh
- CTA opens refresh panel with default scope (all categories selected)

## 8. Security Setup Market Resolution

To help users provide canonical `ticker + market`:

- ticker-only candidate search via configured provider
- one candidate: auto-select
- multiple candidates: provider order, user chooses
- zero candidates: user can still save, with save-time warning that enrichment may be unavailable

No persistent unresolved badge requirement in MVP.
Refresh still attempts provider lookup for saved securities in subsequent runs.

## 9. Base Currency Design

## 9.1 Source of Truth

- `AppSetting[key=baseCurrency]`
- Set from Settings only.
- No implicit default; user must choose.
- Curated allowed list for MVP:
  - `USD`, `CAD`, `EUR`, `GBP`, `JPY`, `CNY`, `HKD`, `AUD`

## 9.2 Behavioral Rules

- If base currency changes, prompt user to refresh.
- Prompt opens refresh panel with default full scope.
- Existing previously fetched FX rows remain as-is.
- Newly required FX directions are fetched on subsequent runs.

## 9.3 FX Conversion Rule

- Canonical stored direction: `sourceCurrency -> baseCurrency`.
- If source currency equals base currency, use implicit `1.0` (no self-pair row persisted).

## 10. Error Handling and Messaging

### 10.1 Retry

- Apply bounded automatic retries for transient errors (network/429/5xx).
- Exact attempt/backoff policy is implementation-defined in MVP and should be documented in code/config.

### 10.2 Messaging Policy

- Keep messages user-friendly with light cleanup.
- Preserve provider-specific meaning.
- Avoid heavy transformation or opaque rewording.

## 11. IPC / Service Contracts (Proposed)

Renderer-facing operations (names illustrative; align with existing naming style):

- `getEnrichmentPanelState()`
- `startEnrichmentRun(scope)`
- `cancelEnrichmentRun(runId)`
- `sendEnrichmentRunToBackground(runId)`
- `getEnrichmentRunSummary(runId)`
- `copyEnrichmentFailureDetails(runId)` (or renderer-side copy from returned payload)

Settings operations:

- `getAppSetting(key)`
- `setAppSetting(key, jsonValue)`

## 12. Migration Plan

1. Add new tables/indexes (`AppSetting`, `SecurityMetadata`, `SecurityDailyPrice`, `FxDailyRate`).
2. Add service/repository layer and provider adapter abstraction.
3. Add in-memory run coordinator and IPC handlers.
4. Add global refresh panel + progress + summary UI.
5. Add settings support for `baseCurrency`.
6. Add missing-data CTA integration points.

## 13. Future Extension Path (Post-MVP)

- Multiple active providers routed by capability and asset class (stocks, crypto, commodities, etc.).
- Automatic provider fallback and failover rules.
- Runtime provider switching without restart.
- User-facing provider selection and provider-specific diagnostics.
- Batch and parallel fetch execution strategies for faster large refresh runs.
- Persisted run state and optional resume-after-restart behavior.
- Saved refresh-scope presets (instead of ad hoc-only scope).
- Run history and audit trail UI (not just current run + final summary).
- Optional unresolved-security indicators beyond save-time warning.
- Optional "skipped unresolved" section in refresh summaries.
- Manual metadata force-resync and metadata overwrite controls.
- Optional full historical rebuild mode that can revise existing points.
- Intraday price and FX support (data model + refresh policies).
- Expanded base-currency UX impact across reports/pages (formatting and recalculation updates).
- Optional market/exchange reference master data for richer validation/display.
