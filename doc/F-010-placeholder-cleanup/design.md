# Design: Placeholder Cleanup (F-010)

## Summary

Implement a focused cleanup workflow for transactions auto-assigned to `Uncategorized Income` or `Uncategorized Expense`, using existing transaction `description` as the cleanup hint. Deliver this as a mode within `AccountTransactionsPage` (not a separate page), with inline reassignment and consistent behavior with `ManualTransactionModal`.

## Goals

- Let users quickly find and reassign uncategorized transactions.
- Keep F-010 narrowly scoped to manual cleanup (no inference).
- Avoid duplicate transaction surfaces by extending existing page behavior.
- Keep inline cleanup and Edit Transaction account-selection rules consistent.
- Maintain accounting correctness through existing update pipeline.

## Non-Goals

- No category/account inference from description text (F-011).
- No learning/rules/confidence/auto-apply (F-011).
- No new persisted metadata field for original counterparty labels.
- No advanced tabbed picker UX in MVP.

## Architecture

### Existing Surfaces Reused

- `src/renderer/pages/AccountTransactionsPage.tsx`
- `src/renderer/components/ManualTransactionModal.tsx`
- Existing IPC update flow (`update-transaction`) and refresh sequence (`fetchTransactions`, `refreshAccounts`).

### New UI Mode

Add `Cleanup Mode` to `AccountTransactionsPage`:
- Filters rows to transactions whose counter-account is uncategorized.
- Displays remaining-to-clean-up count.
- Enables inline counter-account reassignment per row.

### Key Principle

Use server/service layer as source of truth for transaction semantics and balancing. UI does minimal validation and orchestration only.

## Component Design

### 1) Cleanup Controls (page-level)

Add a compact control block near existing filters:
- Toggle: `Cleanup Mode` (on/off)
- Optional quick toggle: `Show categories only` vs `Show all accounts`
- Remaining count badge in cleanup mode

### 2) Placeholder Detection Helper (pure logic)

Extract helper to avoid duplicated in-row name checks:
- Input: row (`line`), counter-line account info
- Output: `isPlaceholder` boolean

Used by:
- Cleanup mode filtering
- Row styling/highlighting logic

### 3) Inline Reassignment Control (row-level)

For placeholder rows in cleanup mode:
- Replace static category text with inline reassignment control.
- Control supports selecting any account type (category and user account).
- Row-level apply action calls existing update path.

Keep non-placeholder rows unchanged.

### 4) Shared Destination Option Rules

Unify destination selection behavior between:
- Inline reassignment in `AccountTransactionsPage`
- Edit form in `ManualTransactionModal`

Both should:
- Use same account eligibility rules.
- Use same label language (`Category / Counter Account` or `Counter Account`).
- Allow both category and user accounts.

## Data Flow

1. Page fetches transactions/accounts as today.
2. Memoized selector derives `filteredTransactions`:
   - Existing date/posting filters
   - Plus placeholder filter if cleanup mode is on
3. User selects destination account for a row.
4. Row apply action invokes `update-transaction` with updated `toAccountId`.
5. On success:
   - Trigger existing refresh (`fetchTransactions`, `refreshAccounts`)
   - Derived filter recomputes; row disappears from cleanup list if no longer placeholder
6. On failure:
   - Show row-scoped error; keep selection for retry

## UX and Interaction Details

- `description` remains the original hint shown to user.
- Category column in cleanup mode shows:
  - Current placeholder label
  - Inline destination picker
  - Apply button
- Row-level pending state:
  - Disable picker/apply for that row only while submitting
  - Keep rest of table interactive
- Keep existing Edit action available for advanced edits.

## Destination Picker Strategy (MVP)

To prevent overload with many options:
- Group options (categories first, user accounts second)
- Search/filter input for quick narrowing
- Optional show-all-accounts toggle if default is category-focused view
- No tabbed segmented picker in F-010 MVP

## Validation and Error Handling

### Client-side checks (minimal)

- Destination must be selected.
- Destination cannot be invalid/empty.
- Optional guard: prevent self-pairing if disallowed by existing rules.

### Server-driven correctness

- All accounting validity remains enforced by existing update/service logic.
- UI surfaces service errors as actionable row-level messages.

### Error states

- Invalid destination account
- Transaction update conflict/not found
- Generic update failure with retry guidance

## Performance and Best Practices

- Use `useMemo` for derived placeholder filtering and grouped option lists.
- Avoid effect-driven derived state when values can be computed from source state.
- Keep child components focused and prop-stable to limit row re-renders.
- No child-level fetching; page remains the single fetch orchestrator.
- Prefer reusable helper functions for placeholder detection and destination option shaping.

## Testing Strategy

### Unit tests

- Placeholder detection helper:
  - Detect uncategorized income/expense rows
  - Ignore non-placeholder rows
- Option grouping helper:
  - Categories-first ordering
  - Show-all behavior
  - Search filtering behavior

### Component tests

`AccountTransactionsPage`:
- Cleanup mode toggle filters correctly
- Remaining count updates after successful reassignment
- Row-level loading and error states render correctly
- Placeholder row disappears after refresh path completes

`ManualTransactionModal`:
- Destination selector includes category and user accounts
- Labeling reflects broader destination semantics

### Integration/service tests

- Confirm update path preserves double-entry integrity when reassigning:
  - Category -> category
  - Category -> user account (transfer-like correction)
  - User account -> category as applicable under existing rules

### E2E tests

- Import sample CSV from `doc/F-008-offline-import-foundation/samples/`
- Enter cleanup mode
- Reassign one placeholder row to a category account
- Reassign one placeholder row to a user account
- Verify both rows leave cleanup list
- Open Edit Transaction modal and verify same destination types are available

### Test IDs (required)

Add stable test hooks for:
- Cleanup toggle
- Remaining count badge
- Row destination picker
- Row apply action
- Row inline error/success state

## Rollout Notes

- This feature is backward-compatible and does not require schema changes.
- Existing imports and transactions continue to function unchanged.
- F-011 can later build on this UX by adding suggestion overlays, not by replacing core cleanup flow.
