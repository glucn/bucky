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
- [ ] 3. Service tests: uncategorized fallback routing
  - Acceptance: asset account inflow uses `Uncategorized Income`.
  - Acceptance: asset account outflow uses `Uncategorized Expense`.
  - Acceptance: liability account polarity routes correctly.
- [ ] 4. Service tests: credit/debit mapping amount calculation
  - Acceptance: credit/debit columns map to amount = credit - debit.
  - Acceptance: single amount column maps directly.
- [ ] 5. Renderer tests: mapping validation with optional description
  - Acceptance: mapping step allows missing description.
  - Acceptance: preview renders without description mapped.
- [ ] 6. Renderer tests: preview editability
  - Acceptance: edits to Date/Amount/Description/Category/Counter-account update payload.
- [ ] 7. Renderer tests: duplicate flagging and confirm flow
  - Acceptance: duplicate rows are flagged prior to import.
  - Acceptance: confirm flow retries import with `forceDuplicate`.
- [ ] 8. IPC/service integration: toAccountId mapping behavior
  - Acceptance: `toAccountId` only honored when column mapped.
  - Acceptance: otherwise fallback to uncategorized categories.
- [ ] 9. UI: import summary consistency
  - Acceptance: import summary shows imported/skipped counts.
  - Acceptance: default-account warnings surface when uncategorized used.
- [ ] 10. E2E (Playwright): headered CSV import flow
  - Acceptance: import wizard completes end-to-end.
  - Acceptance: edited preview values persist in transactions list.
- [ ] 11. E2E (Playwright): headerless CSV mapping
  - Acceptance: manual mapping with generated headers works and import succeeds.
- [ ] 12. E2E (Playwright): duplicate warning
  - Acceptance: second import surfaces duplicates and skipped count > 0.
- [ ] 13. E2E (Playwright): uncategorized fallback
  - Acceptance: transactions show `Uncategorized Income/Expense` when counter-account unmapped.
