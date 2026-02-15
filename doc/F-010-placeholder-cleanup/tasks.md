# Tasks: Placeholder Cleanup (F-010)

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

- [ ] 1. Add placeholder cleanup helper utilities
  - Acceptance: helper detects placeholder rows by `Uncategorized Income` / `Uncategorized Expense` reliably.
  - Acceptance: helper builds destination options with category-first ordering and optional all-accounts mode.
  - Acceptance: utility-level tests cover detection, grouping, and filtering/search behavior.

- [ ] 2. Add cleanup mode to transactions page
  - Acceptance: `AccountTransactionsPage` has a cleanup mode toggle and remaining-count tracker.
  - Acceptance: cleanup mode filters to placeholder rows while preserving existing date/posting filters.
  - Acceptance: page/component tests cover toggle behavior and filtered result expectations.

- [ ] 3. Add inline reassignment for placeholder rows
  - Acceptance: placeholder rows in cleanup mode show inline destination picker + apply action.
  - Acceptance: reassignment supports any account type (category and user account).
  - Acceptance: row-level pending/error states are visible and non-blocking for other rows.

- [ ] 4. Align Edit Transaction destination behavior
  - Acceptance: `ManualTransactionModal` destination picker supports any account type.
  - Acceptance: field label and copy reflect `Category / Counter Account` semantics.
  - Acceptance: modal tests cover account-type availability and existing edit flow compatibility.

- [ ] 5. Keep shared option logic consistent across cleanup and edit flows
  - Acceptance: cleanup inline picker and edit modal reuse consistent eligibility/grouping rules.
  - Acceptance: no behavior drift where one surface allows destinations unavailable in the other.
  - Acceptance: regression tests protect this consistency.

- [ ] 6. Add deterministic test hooks for automation
  - Acceptance: add `data-testid` for cleanup toggle, remaining count, inline destination picker, apply action, and row-level error state.
  - Acceptance: hooks are stable and used by UI/E2E tests.

- [ ] 7. Add E2E coverage for placeholder cleanup workflow
  - Acceptance: Playwright covers import -> cleanup mode -> reassign to category -> reassign to user account -> remaining count/row removal checks.
  - Acceptance: E2E verifies edit flow still exposes matching destination options.

- [ ] 8. Final regression and documentation sync
  - Acceptance: relevant unit/component/E2E suites pass for F-010 scope.
  - Acceptance: `requirements.md`, `design.md`, and `tasks.md` remain aligned on scope (no F-011 inference in F-010).
  - Acceptance: any implementation deviations are documented explicitly before completion.
