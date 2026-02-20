# Product Backlog

This file tracks deferred product improvements that are intentionally out of current MVP scope.

## How To Use

- Add one entry per idea using the template below.
- Keep context focused on user problem and why now/why later.
- Link to related feature docs so future implementation has enough history.

### Entry Template

- **ID**: BL-XXX
- **Title**:
- **Status**: planned | in-progress | done | dropped
- **Priority**: low | medium | high
- **Related Docs**:
- **Context (What / Why)**:
- **Proposed UX / Behavior**:
- **Scope Notes**:
- **Open Questions**:

---

## BL-001 - Apply Newly Learned Rule To Remaining Cleanup Rows

- **ID**: BL-001
- **Title**: Optional bulk-apply of newly learned rule in F-010 cleanup session
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-010-placeholder-cleanup/requirements.md`, `doc/F-011-auto-categorization/requirements.md`
- **Context (What / Why)**:
  - Current F-011 learning model creates/updates rules from confirmed F-010 cleanup reassignment actions.
  - Today, when a user reassigns one uncategorized transaction, that learned rule is saved for future imports only.
  - It does not automatically apply to other currently visible uncategorized rows in the same cleanup session.
  - This can feel repetitive when many rows share the same description pattern.
- **Proposed UX / Behavior**:
  - After a cleanup reassignment creates/updates a rule, offer an explicit one-time action such as:
    - "Apply this rule to matching uncategorized rows in current view"
  - Action should be opt-in and confirmable (no silent bulk reassignment).
- **Scope Notes**:
  - Keep this as a follow-up to avoid adding complexity to F-010/F-011 MVP.
  - Must preserve accounting safeguards and row-level auditability.
- **Open Questions**:
  - Should apply scope be current filtered view only, account-wide, or date-range-bound?
  - Should preview of affected row count be mandatory before apply?

## BL-002 - Post-Import Review For Exact Auto-Applied Matches

- **ID**: BL-002
- **Title**: Add quick review/reject path for exact auto-applied import categorizations
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-008-offline-import-foundation/requirements.md`
- **Context (What / Why)**:
  - F-011 MVP auto-applies exact matches during import and keeps import UI lightweight.
  - Current import summary is aggregate-count based and does not provide an immediate per-row reject path before commit.
  - If an exact rule is wrong, users currently correct it later via F-010 cleanup/edit and rule management.
  - A focused post-import review could improve trust and reduce correction effort.
- **Proposed UX / Behavior**:
  - Provide a quick filter/view after import for "exact auto-applied" transactions.
  - Let users rapidly inspect and correct mismatches without hunting through all transactions.
  - Corrections should optionally feed rule updates (subject to final scope decision).
- **Scope Notes**:
  - Keep import steps (especially Step 3/4) uncluttered; place this review outside crowded import confirmation UX.
  - Maintain transparent distinction between auto-applied vs manually categorized outcomes.
- **Open Questions**:
  - Should review happen immediately after import completion or as a persistent filter in transactions?
  - Should corrections in this review path update rules automatically or require explicit confirmation?

## BL-003 - Manual Rule Creation In Settings

- **ID**: BL-003
- **Title**: Allow manual creation of new auto-categorization rules in settings
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-011-auto-categorization/design.md`
- **Context (What / Why)**:
  - F-011 MVP only creates rules from confirmed F-010 cleanup reassignment actions.
  - Users who want to pre-seed rules before the next import cannot do so directly.
  - Manual creation can reduce first-import friction and speed up onboarding to rule-based categorization.
- **Proposed UX / Behavior**:
  - Add a "New Rule" action in `Settings > Auto-Categorization`.
  - Support entering pattern, match type, and target category.
  - Reuse existing validation rules (normalized duplicate check, keyword min length, active category target).
- **Scope Notes**:
  - Keep consistent with existing edit modal patterns where possible.
  - Consider auditability of manually-created vs learned rules.
- **Open Questions**:
  - Should manually-created rules require a separate status/label (e.g., source = manual/learned)?
  - Should manual create support bulk import from CSV later?

## BL-004 - Enable/Disable Rule State

- **ID**: BL-004
- **Title**: Add rule enable/disable state for temporary suppression
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-011-auto-categorization/design.md`
- **Context (What / Why)**:
  - F-011 MVP supports hard delete but no temporary off-switch.
  - Users may want to pause a rule during noisy periods without losing its configuration/history.
  - Enable/disable is safer than delete when diagnosis or temporary behavior changes are needed.
- **Proposed UX / Behavior**:
  - Add enabled status per rule.
  - Disabled rules remain visible in settings but are skipped in matching.
  - Support quick toggle in list and/or edit modal.
- **Scope Notes**:
  - Requires schema + matching logic updates and list filters/status handling.
  - Should keep existing deterministic priority behavior among enabled rules.
- **Open Questions**:
  - Should disabled rules affect summary counts (e.g., "rules skipped")?
  - Should disable reason/notes be tracked?

## BL-005 - Rule Priority Management UI

- **ID**: BL-005
- **Title**: Add manual priority controls for overlapping rules
- **Status**: planned
- **Priority**: low
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-011-auto-categorization/design.md`
- **Context (What / Why)**:
  - F-011 MVP tie-breakers are automatic (exact > longer pattern > newest).
  - Advanced users may need explicit control when domain heuristics do not match expected outcomes.
  - Manual priority can reduce surprises for complex keyword sets.
- **Proposed UX / Behavior**:
  - Add explicit priority field/order for rules.
  - Allow reordering in settings and use manual priority before existing tie-breakers.
- **Scope Notes**:
  - Increases operational complexity and needs clear conflict resolution docs.
  - Should include guardrails to avoid contradictory priority setups.
- **Open Questions**:
  - Should priority be global or scoped by match type?
  - Should learned-rule updates preserve manual priority or reset it?

## BL-006 - App-Wide Rule Application Beyond Import

- **ID**: BL-006
- **Title**: Apply categorization rules in non-import transaction flows
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-010-placeholder-cleanup/requirements.md`
- **Context (What / Why)**:
  - F-011 MVP scope is import-only.
  - Manual Add/Edit flows currently do not benefit from rule suggestions, creating behavior inconsistency.
  - Extending rule use can improve categorization consistency across the app.
- **Proposed UX / Behavior**:
  - Add optional rule suggestions in manual Add/Edit transaction paths.
  - Preserve user control and avoid silent overrides.
  - Keep import-specific auto-apply policy isolated unless explicitly expanded.
- **Scope Notes**:
  - Requires careful UX alignment with existing modals and validation logic.
  - Must avoid surprising edits to existing transaction workflows.
- **Open Questions**:
  - Should non-import flows be suggest-only or support auto-apply in limited cases?
  - Should confirmation in these flows also feed rule learning?

## BL-007 - Transfer Target Rule Support

- **ID**: BL-007
- **Title**: Support rules that target user accounts for transfer-like transactions
- **Status**: planned
- **Priority**: low
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-010-placeholder-cleanup/requirements.md`
- **Context (What / Why)**:
  - F-011 MVP targets category accounts only.
  - Some recurring descriptions represent transfers and could benefit from user-account targets.
  - Without this support, transfer-heavy users may do repetitive manual cleanup.
- **Proposed UX / Behavior**:
  - Allow rule targets to include user accounts with safety checks.
  - Clearly distinguish category vs transfer destination outcomes.
- **Scope Notes**:
  - Must preserve double-entry correctness and prevent invalid self-pairing cases.
  - Requires clarity in UI labels and rule-management filters.
- **Open Questions**:
  - Should transfer-target rules be separate match type/policy from category rules?
  - How should priority resolve when both category and transfer rules match?

## BL-008 - Advanced Text Normalization For Matching

- **ID**: BL-008
- **Title**: Improve rule matching with punctuation/diacritics normalization
- **Status**: planned
- **Priority**: low
- **Related Docs**: `doc/F-011-auto-categorization/requirements.md`, `doc/F-011-auto-categorization/design.md`
- **Context (What / Why)**:
  - F-011 MVP normalization is intentionally limited (case + whitespace only).
  - Real bank descriptions often vary by punctuation, separators, and diacritics.
  - Better normalization can improve match rates without adding many duplicate rules.
- **Proposed UX / Behavior**:
  - Normalize punctuation and optionally diacritics before matching.
  - Keep behavior deterministic and testable.
- **Scope Notes**:
  - Requires migration strategy if normalized keys become materially different.
  - Must avoid unexpected over-matching from aggressive normalization.
- **Open Questions**:
  - Should punctuation/diacritics normalization be global defaults or configurable?
  - How should existing stored normalized patterns be backfilled safely?

## BL-009 - Runtime Provider Controls And Fallback

- **ID**: BL-009
- **Title**: Add runtime provider switching and controlled provider fallback for enrichment
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-017-data-enrichment-mvp/requirements.md`, `doc/F-017-data-enrichment-mvp/design.md`
- **Context (What / Why)**:
  - F-017 MVP supports provider switching only via startup config and has no automatic fallback.
  - Operational incidents (provider outage/rate-limit events) currently require restart/config edits.
  - Runtime controls and explicit fallback rules would improve resilience and reduce user downtime.
- **Proposed UX / Behavior**:
  - Add diagnostics view for current provider health/capabilities.
  - Allow controlled provider switch without app restart.
  - Support optional fallback policy (primary -> secondary) with clear run-level attribution.
- **Scope Notes**:
  - Preserve provider-agnostic contracts and deterministic failure reporting.
  - Keep provider-specific credentials secure and auditable.
- **Open Questions**:
  - Should fallback be category-scoped (metadata/prices/FX) or run-scoped?
  - How should mixed-provider results be surfaced in summary and audit trails?

## BL-010 - Durable Run History And Resume

- **ID**: BL-010
- **Title**: Persist enrichment run state/history and support resume after restart
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-017-data-enrichment-mvp/requirements.md`, `doc/F-017-data-enrichment-mvp/design.md`
- **Context (What / Why)**:
  - F-017 MVP keeps run state in memory and stops background runs on app close/restart.
  - Users lose progress visibility and must restart long runs manually.
  - Durable run tracking improves reliability and supportability.
- **Proposed UX / Behavior**:
  - Persist run metadata, progress, and outcome summaries.
  - Show recent run history with filterable statuses.
  - Offer resume/retry actions when interruption is recoverable.
- **Scope Notes**:
  - Keep partial-write integrity guarantees from MVP.
  - Ensure stale/abandoned runs are safely reconciled on startup.
- **Open Questions**:
  - Should resume continue from last successful item checkpoint or by date-range recomputation?
  - What retention window should apply for run-history records?

## BL-011 - Scheduled Refresh Policies

- **ID**: BL-011
- **Title**: Add scheduled/automatic enrichment refresh with policy controls
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-017-data-enrichment-mvp/requirements.md`, `doc/F-017-data-enrichment-mvp/design.md`
- **Context (What / Why)**:
  - F-017 MVP is manual-run only.
  - Users with frequent portfolio updates benefit from predictable background freshness.
  - Scheduling reduces repetitive manual effort and stale valuation windows.
- **Proposed UX / Behavior**:
  - Add configurable schedules (daily/weekly and optional market-close aligned windows).
  - Allow per-category schedule scope and pause controls.
  - Provide notification/reporting for scheduled run outcomes.
- **Scope Notes**:
  - Respect single-run guard and app resource constraints.
  - Must include safe behavior for missed schedules while app is offline.
- **Open Questions**:
  - Should scheduling run only when app is open, or via background agent?
  - How should schedule conflicts with manual runs be resolved?

## BL-012 - Intraday Price And FX Support

- **ID**: BL-012
- **Title**: Extend enrichment to intraday market data
- **Status**: planned
- **Priority**: low
- **Related Docs**: `doc/F-017-data-enrichment-mvp/requirements.md`, `doc/F-017-data-enrichment-mvp/design.md`
- **Context (What / Why)**:
  - F-017 MVP stores daily points only and explicitly excludes intraday support.
  - Active-trading workflows may need finer-grained valuation and timing analysis.
  - Intraday support requires explicit model, policy, and UI decisions beyond MVP.
- **Proposed UX / Behavior**:
  - Add intraday interval selection for supported providers.
  - Display valuation timestamps and staleness windows.
  - Preserve daily mode for users who do not need intraday complexity.
- **Scope Notes**:
  - Requires schema/storage expansion and revised refresh/range logic.
  - Must preserve deterministic accounting views when intraday data is missing.
- **Open Questions**:
  - Which intervals are in scope first (e.g., 1m/5m/15m/hourly)?
  - Should intraday data be retained short-term with rollups to daily?

## BL-013 - Enrichment Data Lifecycle Management

- **ID**: BL-013
- **Title**: Add retention and pruning controls for enrichment datasets
- **Status**: planned
- **Priority**: low
- **Related Docs**: `doc/F-017-data-enrichment-mvp/requirements.md`, `doc/F-017-data-enrichment-mvp/design.md`
- **Context (What / Why)**:
  - F-017 MVP retains enrichment data indefinitely.
  - Long-running usage can increase local DB size and maintenance cost.
  - Lifecycle controls improve storage predictability and performance hygiene.
- **Proposed UX / Behavior**:
  - Add retention policy options by data domain and age.
  - Support safe/manual prune actions with impact preview.
  - Expose last-pruned metadata for transparency.
- **Scope Notes**:
  - Must avoid deleting required points for current valuation or audit needs.
  - Should preserve immutable-point semantics for retained windows.
- **Open Questions**:
  - Should retention default differ between price and FX series?
  - Do we need export/snapshot before destructive prune operations?

## BL-014 - Large-Portfolio Refresh Performance

- **ID**: BL-014
- **Title**: Add batching/parallelization and adaptive throttling for enrichment runs
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-017-data-enrichment-mvp/design.md`, `doc/F-017-data-enrichment-mvp/tasks.md`
- **Context (What / Why)**:
  - F-017 MVP intentionally executes one-by-one requests.
  - Large portfolios may experience long refresh durations and higher timeout/rate-limit exposure.
  - Controlled concurrency can improve throughput while preserving reliability.
- **Proposed UX / Behavior**:
  - Enable provider-aware batching/parallel execution where capabilities allow.
  - Add adaptive throttling based on recent rate-limit responses.
  - Surface run-speed diagnostics (items/minute, throttled state) in panel details.
- **Scope Notes**:
  - Preserve single-run guard and deterministic summary semantics.
  - Keep fallback path to sequential mode when provider limits are tight.
- **Open Questions**:
  - Should concurrency be auto-tuned or user-configurable?
  - How should retries interact with parallel queues to avoid retry storms?

## BL-015 - Unresolved Security Diagnostics Beyond Save-Time Warning

- **ID**: BL-015
- **Title**: Add persistent unresolved-security indicators and remediation flow
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-017-data-enrichment-mvp/requirements.md`, `doc/F-017-data-enrichment-mvp/design.md`
- **Context (What / Why)**:
  - F-017 MVP warns only at save time when ticker search returns zero candidates.
  - Users can later forget unresolved identities and only discover issues during refresh summaries.
  - Persistent diagnostics would improve discoverability and correction speed.
- **Proposed UX / Behavior**:
  - Show unresolved badge/status on affected securities and/or portfolio views.
  - Provide direct remediation action to re-run ticker+market resolution.
  - Optionally include dedicated summary section for skipped/unresolved items.
- **Scope Notes**:
  - Keep warning language user-friendly and avoid provider-specific jargon where possible.
  - Must not block valid manual-save workflows that intentionally proceed unresolved.
- **Open Questions**:
  - Should unresolved state be computed live each run or persisted as explicit status?
  - Where is the best primary remediation entry point (security detail, holdings table, refresh panel)?

## BL-016 - Saved Refresh Scope Presets

- **ID**: BL-016
- **Title**: Add saved scope presets for enrichment runs
- **Status**: planned
- **Priority**: low
- **Related Docs**: `doc/F-017-data-enrichment-mvp/design.md`
- **Context (What / Why)**:
  - F-017 MVP uses ad hoc category checkboxes each run.
  - Repeated workflows (for example FX-only or prices+FX) require manual re-selection every time.
  - Presets reduce friction and make repeated refresh flows more consistent.
- **Proposed UX / Behavior**:
  - Let users save named scope presets from current selection.
  - Allow one-click preset apply in refresh panel.
  - Keep ad hoc editing available after preset apply.
- **Scope Notes**:
  - Preserve current default full-scope behavior for first-time users.
  - Keep preset storage lightweight and user-editable.
- **Open Questions**:
  - Should there be a default "last used" preset auto-apply option?
  - Should presets be local-only or profile-scoped if multi-user arrives later?

## BL-017 - Manual Metadata Resync Controls

- **ID**: BL-017
- **Title**: Add metadata force-refresh and overwrite controls
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-017-data-enrichment-mvp/design.md`
- **Context (What / Why)**:
  - F-017 MVP metadata policy is fill-missing only.
  - If provider metadata changes (name/type/currency corrections), users cannot force an overwrite path.
  - Manual controls improve correction and recovery workflows.
- **Proposed UX / Behavior**:
  - Add explicit action to force metadata refresh for selected security/all securities.
  - Offer overwrite policy choices (fill-missing vs overwrite non-null fields).
  - Surface affected fields preview before destructive overwrite.
- **Scope Notes**:
  - Must preserve auditability of changed metadata fields.
  - Keep default run path unchanged for normal refreshes.
- **Open Questions**:
  - Should overwrite be all-fields or field-by-field selectable?
  - Should force-resync run immediately or be queued as a scoped run?

## BL-018 - Full Historical Rebuild Mode

- **ID**: BL-018
- **Title**: Add optional full historical rebuild mode for prices/FX
- **Status**: planned
- **Priority**: low
- **Related Docs**: `doc/F-017-data-enrichment-mvp/design.md`, `doc/F-017-data-enrichment-mvp/requirements.md`
- **Context (What / Why)**:
  - F-017 MVP is incremental and immutable per key+date.
  - Users may need controlled rebuilds after provider corrections, symbol migrations, or major data quality incidents.
  - Rebuild mode provides deterministic recovery beyond gap backfill.
- **Proposed UX / Behavior**:
  - Add explicit rebuild action with clear scope/date range controls.
  - Re-fetch historical ranges and reconcile existing points using selected policy.
  - Show impact summary before apply (rows to replace/keep).
- **Scope Notes**:
  - Must guard against accidental destructive operations.
  - Should preserve clear distinction between incremental runs and rebuild runs.
- **Open Questions**:
  - Should rebuild replace rows directly or write new versioned snapshots?
  - How should rebuild conflicts with active runs be handled?

## BL-019 - Base Currency Impact

- **ID**: BL-019
- **Title**: Expand base-currency change handling
- **Status**: planned
- **Priority**: medium
- **Related Docs**: `doc/F-017-data-enrichment-mvp/design.md`
- **Context (What / Why)**:
  - F-017 MVP establishes base currency and refresh prompts, but broader reporting/recalculation UX remains limited.
  - Base currency semantics also affect data-entry and setup workflows (new account/portfolio/category creation), not only read-only reporting.
  - Users need consistent formatting, valuation, and stale-data cues across pages after base currency changes.
  - Clear cross-page behavior reduces confusion and trust issues.
- **Proposed UX / Behavior**:
  - Standardize base-currency display and conversion status across key report pages.
  - Define base-currency-aware defaults/validation hints in create flows (account/portfolio/category) so new entities align with current currency model.
  - Highlight impacted widgets/sections when required FX data is missing.
  - Provide direct refresh entry points from affected views.
- **Scope Notes**:
  - Requires cross-page UX alignment across both read and create/edit surfaces.
  - Must avoid silent value shifts without clear user-visible context.
- **Open Questions**:
  - Which surfaces should be prioritized first (overview/positions vs account/portfolio/category create flows)?
  - Should recalculation be immediate or staged with user confirmation?

## BL-020 - Market Reference Master Data

- **ID**: BL-020
- **Title**: Introduce exchange/market reference data for validation and display
- **Status**: planned
- **Priority**: low
- **Related Docs**: `doc/F-017-data-enrichment-mvp/design.md`
- **Context (What / Why)**:
  - MVP accepts market identifiers from provider responses/user selection without a local market master.
  - Inconsistent exchange labels can reduce validation quality and UI clarity.
  - Reference data enables stronger normalization and user-friendly market display.
- **Proposed UX / Behavior**:
  - Maintain normalized market catalog (code, display name, region, asset support).
  - Validate security market values against catalog where applicable.
  - Use standardized display labels in setup, holdings, and refresh summaries.
- **Scope Notes**:
  - Keep provider-specific mappings maintainable and testable.
  - Should tolerate unknown markets gracefully when catalog coverage is incomplete.
- **Open Questions**:
  - Should market reference data be static in-app, periodically synced, or hybrid?
  - How should provider-specific exchange aliases be mapped and versioned?

## BL-021 - Unify Valuation Price Storage On SecurityDailyPrice

- **ID**: BL-021
- **Title**: Migrate valuation paths from `SecurityPriceHistory` to `SecurityDailyPrice`
- **Status**: planned
- **Priority**: high
- **Related Docs**: `doc/F-017-data-enrichment-mvp/design.md`, `prisma/schema.prisma`
- **Context (What / Why)**:
  - Current valuation flows still depend on legacy `SecurityPriceHistory` keyed by `tickerSymbol + date`.
  - F-017 introduced canonical market-data storage in `SecurityDailyPrice` keyed by `ticker + market + marketDate`.
  - Running both models in parallel increases ambiguity, duplicate logic, and migration risk.
- **Proposed UX / Behavior**:
  - Use `SecurityDailyPrice` as the canonical source for position/portfolio valuation reads.
  - Preserve user-visible valuation behavior during migration (position details, portfolio totals, overview calculations).
  - Keep manual price correction/import workflows explicit with clear policy for overwrite vs correction mode.
- **Scope Notes**:
  - Requires service/IPC contract migration from ticker-only APIs to market-aware identity where needed.
  - Requires legacy data migration strategy for rows without market identity.
  - Should use staged rollout (compatibility adapter or dual-read/dual-write) to reduce regression risk.
- **Open Questions**:
  - How should ticker-only legacy rows map to market when multiple exchanges are possible?
  - Should manual edits overwrite canonical daily points or write separate correction records?
  - What cutover sequence is safest for renderer + IPC + service layers?
