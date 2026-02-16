# Tasks: Auto-Categorization (F-011)

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

- [x] 1. Add rule persistence model and schema migration
  - Acceptance: Prisma schema includes `AutoCategorizationRule` with normalized pattern, match type, target category reference, and timestamps.
  - Acceptance: uniqueness is enforced for `(normalizedPattern, matchType)`.
  - Acceptance: test DB/dev DB schema sync succeeds after migration.

- [/] 2. Add auto-categorization matching service utilities
  - Acceptance: service normalizes pattern/description with case + whitespace rules only.
  - Acceptance: matching supports exact and keyword (substring) logic against description only.
  - Acceptance: keyword minimum length validation (3+) is enforced.
  - Acceptance: unit tests cover normalization, exact/keyword matching, and non-matching edge cases.

- [ ] 3. Add conflict resolution and invalid-target handling in service
  - Acceptance: priority resolves as exact > longer normalized pattern > most recent confirmation/update.
  - Acceptance: rules with missing/archived target categories are treated as `Invalid target` for UI and ignored during import.
  - Acceptance: tests cover tie-breakers and invalid-target behavior.

- [ ] 4. Integrate matching into import pipeline (F-008 path)
  - Acceptance: exact matches auto-apply category when no explicit mapped `toAccountId` exists.
  - Acceptance: keyword matches are counted but not auto-applied.
  - Acceptance: explicit mapped `toAccountId` keeps existing precedence.
  - Acceptance: import result includes aggregate counters: exact auto-applied, keyword matched, uncategorized.

- [ ] 5. Add learning hook from F-010 cleanup confirmations
  - Acceptance: cleanup reassignment to active category upserts exact rule using normalized description.
  - Acceptance: repeated confirmations update existing rule target and last-updated/confirmed timestamps.
  - Acceptance: learning is not triggered by unrelated Add/Edit flows.

- [ ] 6. Add IPC + preload contracts for rules management
  - Acceptance: IPC handlers support list, update, and delete for rules.
  - Acceptance: server-side validation blocks duplicate `(normalizedPattern, matchType)` and invalid target category writes.
  - Acceptance: preload/types expose stable renderer methods for the rules page.

- [ ] 7. Add settings route and navigation entry for rules page
  - Acceptance: new page is reachable at `Settings > Auto-Categorization`.
  - Acceptance: routing and nav updates do not regress existing top-level navigation behavior.
  - Acceptance: basic route render test is added.

- [ ] 8. Build rules list page (lightweight MVP)
  - Acceptance: page shows a single list with default `Last Updated` descending order.
  - Acceptance: pattern-only search filters list client-side.
  - Acceptance: list columns include Pattern, Match Type, Target Category, Last Updated, Status.
  - Acceptance: status shows only `Valid` or `Invalid target`.

- [ ] 9. Build rule edit modal and delete flow
  - Acceptance: edit modal supports pattern, match type, and active target category fields.
  - Acceptance: save is immediate when valid; normalization is silent on save.
  - Acceptance: duplicate `(normalizedPattern, matchType)` errors are surfaced clearly.
  - Acceptance: delete uses standard confirmation and performs hard delete.

- [ ] 10. Update import summary UI with aggregate rule outcome counts
  - Acceptance: import summary displays exact auto-applied, keyword matched, and uncategorized counts.
  - Acceptance: no per-row/per-rule detail UI is introduced in import steps.
  - Acceptance: summary rendering remains stable for imports with no rules.

- [ ] 11. Add deterministic test hooks and end-to-end coverage
  - Acceptance: add stable `data-testid` hooks for rules list rows, edit/save actions, and delete confirmation.
  - Acceptance: E2E covers bootstrap learning via cleanup then exact auto-apply on a later import.
  - Acceptance: E2E covers rules page edit/delete affecting subsequent import behavior.

- [ ] 12. Final regression and documentation sync
  - Acceptance: relevant unit/service/renderer/E2E suites pass for F-011 scope.
  - Acceptance: `requirements.md`, `design.md`, and `tasks.md` remain aligned with MVP boundaries.
  - Acceptance: any implementation deviations are documented explicitly before completion.
