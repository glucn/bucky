# Tasks: Reporting Basics (F-013)

## Status Legend

- [x] Completed
- [/] In progress
- [ ] Planned/Not started

## TDD Operating Rules (strict)

- For every implementation task, commit to `Red -> Green -> Refactor`.
- Red gate: write/adjust a failing test that proves missing behavior.
- Green gate: implement the smallest change to make that test pass.
- Refactor gate: clean up only with all touched tests green.
- Do not merge a task unless the related test layer exists:
  - service logic -> service tests
  - IPC/preload contracts -> IPC tests
  - renderer behavior -> renderer tests
  - user flow -> E2E test

## Batches

### Batch 0: Test Harness and Fixtures First

- [x] 0.1 Add shared reporting test fixtures/utilities
  - Acceptance: reusable fixtures exist for income-only, expense-only, mixed, transfer-heavy, and unassigned-heavy datasets.
  - Acceptance: fixtures are deterministic and timezone-stable for month-boundary tests.
- [x] 0.2 Add report contract shape tests before feature implementation
  - Acceptance: tests fail initially for missing/incorrect Trend and Breakdown response contracts.
  - Acceptance: tests assert required fields (`netIncome`, table rows, trend buckets, metadata flags) from requirements/design.

### Batch 1: Trend Report - Service TDD

- [x] 1.1 Red: write failing tests for trend month-range semantics
  - Acceptance: tests assert strict month-based presets only.
  - Acceptance: tests assert deterministic local-calendar month ordering.
  - Acceptance: tests assert future-dated exclusion.
- [x] 1.2 Green: implement minimal trend service for month-range tests
  - Acceptance: tests from 1.1 pass with minimal implementation.
  - Acceptance: no stacked series behavior is introduced.
- [x] 1.3 Red: write failing tests for trend inclusion/exclusion policy
  - Acceptance: tests assert internal transfer exclusion.
  - Acceptance: tests assert implicit inclusion of unassigned/placeholder-linked data in totals.
  - Acceptance: tests assert monthly fields needed by tooltip (`income`, `expense`, `netIncome`).
- [x] 1.4 Green: implement trend inclusion/exclusion behavior
  - Acceptance: tests from 1.3 pass.
  - Acceptance: no separate unassigned trend series/legend is emitted.
- [ ] 1.5 Refactor: trend service cleanup with tests green
  - Acceptance: trend service code is simplified without changing output contracts.
  - Acceptance: full trend-related service suite remains green.

### Batch 2: Breakdown Report - Service TDD

- [x] 2.1 Red: write failing tests for breakdown range and aggregation
  - Acceptance: tests assert presets + custom range support.
  - Acceptance: tests assert separate income/expense tables and amount-desc sort.
  - Acceptance: tests assert totals rows and `netIncome = income - expense`.
- [x] 2.2 Green: implement minimal breakdown aggregation logic
  - Acceptance: tests from 2.1 pass.
  - Acceptance: implementation handles one-sided periods without unstable output.
- [x] 2.3 Red: write failing tests for percentage and unassigned behavior
  - Acceptance: tests assert `% of income` and `% of expense` calculations.
  - Acceptance: tests assert `Unassigned` row appears when applicable.
- [x] 2.4 Green: implement percentage and unassigned behavior
  - Acceptance: tests from 2.3 pass.
- [ ] 2.5 Refactor: breakdown service cleanup with tests green
  - Acceptance: code is simplified with no contract drift.
  - Acceptance: all breakdown service tests remain green.

### Batch 3: IPC and Preload - Contract TDD

- [ ] 3.1 Red: write failing IPC tests for Trend and Breakdown channels
  - Acceptance: tests assert channels exist: `get-income-expense-trend-report`, `get-income-expense-breakdown-report`.
  - Acceptance: tests assert handler delegation and error propagation convention.
- [ ] 3.2 Green: implement IPC handlers to satisfy 3.1
  - Acceptance: 3.1 tests pass.
  - Acceptance: existing overview and investment performance channels remain unaffected.
- [ ] 3.3 Red: write failing preload/renderer-typing tests
  - Acceptance: tests/type checks fail when preload methods or renderer typings are missing/misaligned.
  - Acceptance: tests enforce request/response type parity.
- [ ] 3.4 Green: implement preload bridge and renderer typings
  - Acceptance: tests/type checks from 3.3 pass.
- [ ] 3.5 Refactor: IPC/preload cleanup with tests green
  - Acceptance: remove duplication while preserving behavior and types.

### Batch 4: Renderer - Behavior TDD

- [ ] 4.1 Red: write failing renderer tests for F-013 route/shell
  - Acceptance: tests assert `/reports` route exists and is separate from `/investments/:portfolioId/reports`.
  - Acceptance: tests assert loading/error/empty states.
- [ ] 4.2 Green: implement route and reporting shell
  - Acceptance: tests from 4.1 pass.
- [ ] 4.3 Red: write failing renderer tests for per-report filter independence and persistence
  - Acceptance: tests assert Trend and Breakdown filters are independent.
  - Acceptance: tests assert persisted restore via app settings keys.
  - Acceptance: tests assert invalid persisted values fallback to defaults (`Last 6 months`, `This month`).
- [ ] 4.4 Green: implement per-report filter state + persistence
  - Acceptance: tests from 4.3 pass.
- [ ] 4.5 Red: write failing renderer tests for Trend UI requirements
  - Acceptance: tests assert grouped bars (not stacked).
  - Acceptance: tests assert tooltip fields (`Income`, `Expense`, `Net income`).
  - Acceptance: tests assert negative net in tooltip uses red + leading minus sign.
- [ ] 4.6 Green: implement Trend UI behavior
  - Acceptance: tests from 4.5 pass.
- [ ] 4.7 Red: write failing renderer tests for Breakdown UI requirements
  - Acceptance: tests assert prominent Net income KPI above tables.
  - Acceptance: tests assert negative KPI uses red + leading minus sign.
  - Acceptance: tests assert separate tables, percentage columns, totals rows, and unassigned row visibility.
- [ ] 4.8 Green: implement Breakdown UI behavior
  - Acceptance: tests from 4.7 pass.
- [ ] 4.9 Green: add stable `data-testid` hooks required by E2E
  - Acceptance: hooks cover report switcher, date controls, trend container, tooltip trigger points, KPI card, and both tables.
  - Acceptance: naming follows existing deterministic test-id style.

### Batch 5: End-to-End TDD and Final Verification

- [ ] 5.1 Red: write failing E2E scenarios for F-013 MVP flow
  - Acceptance: tests cover report switching, per-report filters, persisted restore after restart.
  - Acceptance: tests cover coexistence (no regression on investment performance reports).
- [ ] 5.2 Green: implement remaining integration details to satisfy E2E
  - Acceptance: tests from 5.1 pass.
- [ ] 5.3 Refactor and full regression sweep
  - Acceptance: relevant service, IPC, renderer, and E2E suites pass for F-013 scope.
  - Acceptance: `requirements.md`, `design.md`, and `tasks.md` remain aligned.
  - Acceptance: any implementation deviations are documented explicitly.

## Deferred Follow-up (not in F-013 MVP)

- [ ] A. Add Sankey diagram for flow-style income/expense visualization.
- [ ] B. Add per-report sub-widget date overrides.
- [ ] C. Add dedicated Net Worth and Investment Allocation report pages.
