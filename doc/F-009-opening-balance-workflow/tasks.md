# Tasks: Opening Balance Workflow (F-009)

## Status Legend

- [x] Completed
- [/] In progress
- [ ] Planned/Not started

## Tasks

- [x] 1. Data model tag for opening balance entries
  - Acceptance: opening balance entries are uniquely identifiable (e.g., entry type or metadata).
  - Acceptance: exactly one opening balance entry per account is enforceable.
- [x] 2. Service: set/update opening balance (single account)
  - Acceptance: creates or updates a single entry for the target account.
  - Acceptance: uses system equity account `Opening Balances` as counter-account.
  - Acceptance: liability semantics treat positive input as "amount owed".
- [x] 3. Service: backfill adjustment hooks
  - Acceptance: insert/update/delete of older transactions adjusts opening balance entry amount.
  - Acceptance: current balance remains unchanged after backfill adjustments.
  - Acceptance: date boundary moves are handled correctly.
- [x] 4. IPC: set opening balance endpoint
  - Acceptance: IPC handler accepts accountId, displayAmount, asOfDate.
  - Acceptance: errors are surfaced to the renderer with clear messages.
- [x] 5. UI: account creation opening balance fields
  - Acceptance: optional amount + as-of date are present on account creation.
  - Acceptance: liability accounts show "Balance owed" label.
- [x] 6. UI: account details "Set Opening Balance" modal
  - Acceptance: modal shows current opening balance and allows edit.
  - Acceptance: saves update instead of creating new entry.
- [x] 7. Replace legacy opening balance flows
  - Acceptance: bulk `OpeningBalances` page is removed or deprecated.
  - Acceptance: "Desired Opening Balance" diff-based behavior is removed.
- [x] 8. Service tests: opening balance creation and update
  - Acceptance: asset/liability sign handling is correct.
  - Acceptance: `Opening Balances` system account auto-creation works.
- [x] 9. Service tests: backfill adjustment
  - Acceptance: current balance remains unchanged; opening balance entry amount adjusts.
  - Acceptance: insert/update/delete and date boundary move cases covered.
- [x] 10. UI tests: opening balance UX
  - Acceptance: modal validation for amount/as-of date.
  - Acceptance: liability label is "Balance owed".
- [x] 11. E2E tests (Playwright): opening balance workflow
  - Acceptance: create account with opening balance and verify CB/OB behavior.
  - Acceptance: older transaction insert/update/delete keeps current balance unchanged and adjusts opening balance entry amount.
  - Acceptance: validated via IPC-driven Playwright flow in `tests/e2e/opening-balance.spec.ts`.
