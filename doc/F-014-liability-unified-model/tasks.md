# Tasks: Liability Unified Model (F-014)

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

- [x] 1. Add liability profile data models and schema migration
  - Acceptance: Prisma schema adds structured liability profile models for core profile, template/capability data, and unified effective-dated version snapshots.
  - Acceptance: schema supports one profile per liability account, immutable historical versions, and optional non-critical `meta` JSON.
  - Acceptance: migration applies cleanly to test/dev databases.

- [x] 2. Add shared liability domain types and validation contracts
  - Acceptance: shared enums/types exist for liability templates, repayment methods, payment frequency, and due schedule shape.
  - Acceptance: type contracts are used consistently across service, IPC, preload, and renderer layers.
  - Acceptance: compile-time checks prevent invalid template/field combinations.

- [x] 3. Implement liability profile service (create/read/update)
  - Acceptance: service can create and fetch profile data for all liability templates.
  - Acceptance: template-specific required-field validation is enforced server-side.
  - Acceptance: profile updates preserve hidden/inactive fields instead of deleting them.

- [x] 4. Implement unified version snapshot write/read rules
  - Acceptance: each update writes a full effective-dated snapshot (not delta-only).
  - Acceptance: missing `effectiveDate` defaults to today.
  - Acceptance: duplicate `effectiveDate` for the same liability profile is rejected.
  - Acceptance: backdated version inserts are accepted and ordered correctly.

- [x] 5. Implement conversion workflow rules in service layer
  - Acceptance: conversion can only succeed when target-template required fields are present.
  - Acceptance: conversion away from a template keeps incompatible values persisted and hidden.
  - Acceptance: conversion does not mutate journal/accounting entries.

- [x] 6. Implement due-schedule and rate validation semantics
  - Acceptance: monthly due day clamps to end-of-month behavior.
  - Acceptance: weekly/biweekly schedules require weekday plus anchor date.
  - Acceptance: interest rate is validated as percent in UI contract and decimal in persistence/service contract.

- [x] 7. Integrate opening-balance source-of-truth semantics
  - Acceptance: `currentAmountOwed` setup path writes via opening-balance workflow with required `asOfDate`.
  - Acceptance: liability profile does not introduce a second balance source.
  - Acceptance: when account has transactions, profile balance input is read-only and displays computed ledger balance.

- [x] 8. Add liability IPC handlers and preload bridge
  - Acceptance: main process exposes handlers for profile CRUD, conversion, snapshot update, metrics, and history retrieval.
  - Acceptance: preload methods and renderer typings are aligned and strongly typed.
  - Acceptance: IPC returns follow existing app success/error conventions.

- [x] 9. Refactor account creation to guided Asset vs Liability flow
  - Acceptance: create-account flow starts with explicit `Asset`/`Liability` choice.
  - Acceptance: liability creation requires template selection (`Credit Card`, `Loan/Mortgage`, `Personal Debt`, `Blank`).
  - Acceptance: account type labels shown in UI are system-derived from template and not user-editable.

- [x] 10. Implement post-create liability setup continuation
  - Acceptance: after liability account creation, UI enters unified liability setup.
  - Acceptance: `Skip for now` is allowed only for `Blank` template.
  - Acceptance: non-Blank templates require completing setup required fields before finishing flow.

- [x] 11. Build unified liability profile editor UI
  - Acceptance: one profile UI supports all templates with conditional sections.
  - Acceptance: template-specific required fields are validated in UI with actionable errors.
  - Acceptance: Credit Card requireds match F-014 decisions (`limit`, statement day, due day, minimum payment policy), with optional interest rate/effective date.

- [x] 12. Add Loan/Mortgage installment setup UX
  - Acceptance: Loan/Mortgage setup requires amount owed, interest rate, scheduled payment amount, frequency, due schedule, repayment method, and due day.
  - Acceptance: `originalPrincipal` is optional.
  - Acceptance: frequency-specific due-schedule controls render correct fields.

- [x] 13. Add Personal Debt and Blank template UX rules
  - Acceptance: Personal Debt requires `counterpartyName` + `currentAmountOwed` and enforces one counterparty per account.
  - Acceptance: Blank requires only `accountName` + `currentAmountOwed`.
  - Acceptance: optional fields for both templates degrade gracefully when absent.

- [x] 14. Replace credit-card setup entry with unified liability profile entry
  - Acceptance: new liability profile UI is the primary path for credit-card-style setup.
  - Acceptance: account details and setup surfaces no longer require dedicated credit-card modal for standard flow.
  - Acceptance: parity metrics remain available through unified profile logic.

- [x] 15. Implement Advanced-only conversion and history UX
  - Acceptance: template conversion is available only in `Edit Liability > Advanced`.
  - Acceptance: history list is read-only, shows effective date + changed-fields summary + timestamp, and supports expandable old/new details.
  - Acceptance: optional `changeNote` is accepted on write and immutable after save.

- [x] 16. Implement liability detail metrics and graceful degradation
  - Acceptance: liability detail view shows amount owed as baseline metric.
  - Acceptance: derived metrics (for example available limit/utilization) appear when sufficient data exists.
  - Acceptance: missing inputs render clear unavailable states (not misleading zero values).

- [x] 17. Maintain temporary compatibility layer during F-014 rollout
  - Acceptance: legacy credit-card IPC/service paths remain operational during transition.
  - Acceptance: unified liability flow is primary for new/updated liability setup.
  - Acceptance: no manual data migration is required for current project state.

- [ ] 18. Add deterministic tests and E2E coverage for F-014 flows
  - Acceptance: unit/service tests cover template validation, conversion gating, due schedules, snapshot rules, and opening-balance integration.
  - Acceptance: renderer tests cover guided creation, skip gating, Advanced conversion/history UX, and read-only balance behavior after transactions.
  - Acceptance: E2E covers create/setup for each template, conversion behavior, backdated version history rendering, and liability balance semantics.

- [ ] 19. Final regression and documentation sync
  - Acceptance: relevant unit/service/renderer/E2E suites pass for F-014 scope.
  - Acceptance: `requirements.md`, `design.md`, and `tasks.md` remain aligned with implemented behavior.
  - Acceptance: implementation deviations are documented explicitly before completion.

## Deferred Follow-up Cleanup (manual trigger)

- [ ] A. Remove legacy credit-card setup modal entry path after F-014 stabilization
- [ ] B. Remove legacy credit-card IPC handlers replaced by unified liability handlers
- [ ] C. Remove duplicated credit-card service logic superseded by unified liability service
- [ ] D. Remove `CreditCardProperties` persistence/runtime dependencies once no longer used
- [ ] E. Run explicit pre/post-cleanup regression checklist for liability setup, metrics, and history behavior

## Implementation Deviations

- None identified yet.
