# Project Plan

## Status Legend

- [x] Completed
- [/] In progress
- [ ] Planned/Not started

## Feature Status (Code-Based)

- [x] F-001 credit-card-management (`doc/F-001-credit-card-management`)
- [x] F-002 category-management-improvements (`doc/F-002-category-management-improvements`)
- [x] F-003 transaction-display-normalization (`doc/F-003-transaction-display-normalization`)
- [x] F-004 account-grouping (`doc/F-004-account-grouping`)
- [x] F-005 transaction-display-order (`doc/F-005-transaction-display-order`)
- [x] F-006 test-database-separation (`doc/F-006-test-database-separation`)
- [x] F-007 investment-account-management (`doc/F-007-investment-account-management`)

## MVP Scope

- [X] F-008 offline-import-foundation (CSV import with mapping, preview, duplicate detection, uncategorized fallback)
- [X] F-009 opening-balance-workflow (per-account opening balance + backfill adjustment)
- [X] F-010 placeholder-cleanup (inline reassignment with original account name display)
- [X] F-011 auto-categorization (rule inference with exact-match transparency)
- [X] F-012 overview-dashboard (net worth, income/expense trend, allocation)
- [ ] F-013 reporting-basics (overview + breakdowns with presets and date picker)
- [ ] F-014 liability-unified-model (liability accounts without specialized UX)
- [ ] F-015 security-gate (app lock + database encryption with hybrid key mgmt)
- [ ] F-016 investment-allocation-ux (asset-class pie with combined view)
- [ ] F-017 data-enrichment-mvp (on-demand metadata fetch + caching)
- [ ] F-018 placeholder-reporting ("Unassigned" included in reports)

## Roadmap

### Phase 0 - MVP Completion

- Deliver offline-first import, opening balances, and backfill adjustments.
- Provide at-a-glance overview plus basic breakdown reports.
- Ship security gate (app lock + encryption at rest).
- Enable placeholder account workflows and auto-categorization MVP.

### Phase 1 - Early Post-MVP

- Background metadata refresh for asset class, price history, and FX rates.
- Portfolio allocation drilldowns with filters (portfolio/asset class/currency).
- Optional CSV mapping suggestions and saved mappings.
- System placeholder account for unmatched counter-accounts.
- App Store readiness (signing, notarization, sandbox compliance).

### Phase 2 - Mid-Term Enhancements

- Specialized liability UX (mortgage/loan/IOU profiles).
- Smarter categorization and confidence controls.
- Reconciliation workflows.
- Recurring transactions.
- Export/backup.

### Phase 3 - Longer-Term

- Windows distribution.
- Advanced reporting and insights.
- Audit history/versioning.
- Optional sync or multi-user profiles.

## Notes

- IDs are ordered by .kiro design doc modified time (oldest to newest).
- Status reflects evidence in code across services, IPC, UI, and tests.
- MVP success criteria: manage finances for 3 months without returning to the old app.
- Revisit this plan when new features are defined.
- Future improvements backlog: `doc/backlog.md`.
