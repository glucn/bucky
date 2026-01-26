# Tasks: Offline Import Foundation (F-008)

## Status Legend

- [x] Completed
- [/] In progress
- [ ] Planned/Not started

## Tasks

- [x] 1. Service tests: duplicate detection strict match
  - Acceptance: exact date+description+accounts+amount+currency flags `potential_duplicate`.
  - Acceptance: non-exact match imports successfully.
  - Acceptance: duplicate can be imported with `forceDuplicate`.
- [x] 2. Service tests: posting date validation
  - Acceptance: posting date before transaction date is rejected.
  - Acceptance: posting date same or after is accepted.
  - Acceptance: empty posting date is accepted.
- [x] 3. Service tests: uncategorized fallback routing
  - Acceptance: asset account inflow uses `Uncategorized Income`.
  - Acceptance: asset account outflow uses `Uncategorized Expense`.
  - Acceptance: liability account polarity routes correctly.
- [x] 4. Service tests: credit/debit mapping amount calculation
  - Acceptance: credit/debit columns map to amount = credit - debit.
  - Acceptance: single amount column maps directly.
- [x] 5. Renderer tests: mapping validation with optional description
  - Acceptance: mapping step allows missing description.
  - Acceptance: preview renders without description mapped.
- [x] 6. Preview step is read-only
  - Acceptance: preview step renders without inline edit inputs.
  - Acceptance: edits happen after import via existing transaction edit flow.
- [x] 7. Duplicate flagging and batch confirm flow
  - Acceptance: duplicate rows are flagged as file duplicates before import.
  - Acceptance: confirm step supports batch import or skip for duplicates.
- [x] 8. IPC/service integration: toAccountId mapping behavior
  - Acceptance: `toAccountId` only honored when column mapped.
  - Acceptance: otherwise fallback to uncategorized categories.
- [x] 9. UI: import summary consistency
  - Acceptance: import summary shows imported/skipped counts.
  - Acceptance: default-account warnings surface when uncategorized used.
- [x] 10. E2E (Playwright): headered CSV import flow
  - Acceptance: import wizard completes end-to-end.
  - Acceptance: preview step is read-only.
- [x] 11. E2E (Playwright): headerless CSV mapping
  - Acceptance: manual mapping with generated headers works and import succeeds.
- [x] 12. E2E (Playwright): duplicate warning
  - Acceptance: second import surfaces file-duplicate decision and skipped count > 0.
- [x] 13. E2E (Playwright): uncategorized fallback
  - Acceptance: transactions show `Uncategorized Income/Expense` when counter-account unmapped.
- [x] 14. UI: split mapping and preview steps
  - Acceptance: mapping step is mapping-only (no preview table).
  - Acceptance: preview is read-only in its own step before confirm.
