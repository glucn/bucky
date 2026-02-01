# Design: Opening Balance Workflow (F-009)

## Overview

Opening balances are recorded as explicit journal entries per account, with a
required "as of" date. Users can set the opening balance during account creation
or later from the account details page. When older transactions are inserted,
edited, or deleted, the opening balance entry amount is adjusted so the current
balance remains unchanged.

## Architecture

- **Renderer**: Account creation flow and account details page add a
  "Set Opening Balance" modal.
- **Main process**: New IPC handler to set/update opening balance.
- **Services**: `databaseService.setOpeningBalance` creates/updates the opening
  balance entry and applies backfill adjustments on historical transaction
  changes.

## Data Model

- Opening balance stored as a normal `JournalEntry` with two `JournalLine`s:
  - Target account line.
  - Counter-account line to system equity account `Opening Balances`.
- Entry tagged via metadata (e.g., `entryType = "opening-balance"`) to enforce
  a single entry per account.

## UI/UX

- **Account creation**: Optional opening balance fields (amount + as-of date).
- **Account details**: "Set Opening Balance" action opens modal with the same
  fields.
- **Liability accounts**: Amount label is "Balance owed"; positive means amount
  owed. Asset accounts use "Balance".

## Data Flow

1. Renderer collects `accountId`, `displayAmount`, and `asOfDate`.
2. IPC handler validates payload and delegates to service.
3. Service ensures `Opening Balances` equity account exists.
4. Service creates or updates the opening balance entry and lines.

## Backfill Adjustment Algorithm

- **Trigger**: Any insert/update/delete of a transaction where
  `transactionDate < openingBalanceDate` for the affected account.
- **Goal**: Keep the current balance unchanged by adjusting the opening balance
  entry amount by the net effect of the historical change.
- **Approach**:
  - Compute delta for the affected account line based on the transaction change.
  - Apply the inverse delta to the opening balance entry's account line.
  - Apply the matching delta to the `Opening Balances` counter line.
- **Boundary change**: If an edit moves a transaction across the opening balance
  date boundary, apply delta for the old state and new state accordingly.
- **Atomicity**: Perform adjustment in the same database transaction as the
  journal change.

## Error Handling

- Reject missing or invalid as-of dates.
- Reject non-finite amounts or empty amount fields.
- Create `Opening Balances` account if missing; surface errors if creation fails.
- If the opening balance amount is zero, remove the entry.
- Prevent multiple opening balance entries per account.

## Testing Strategy (Required)

### Service Tests

- Create opening balance for asset and liability accounts with correct line
  signs.
- Update and delete opening balance entry.
- Backfill adjustment on insert/update/delete of older transactions, including
  date boundary moves.
- Current balance remains unchanged; opening balance entry amount is adjusted by
  the net effect of older transactions.
- `Opening Balances` equity account auto-creation.

### UI Tests

- Opening balance modal validates amount and as-of date.
- Liability accounts show "Balance owed" label.
- "Set Opening Balance" action appears on account details; edit updates existing
  entry.

### E2E Tests (Playwright)

- Create account with opening balance; record current balance (CB0) and opening
  balance entry amount (OB0).
- Add older transaction; verify current balance == CB0 and opening balance entry
  amount == OB0 +/- net(oldTx).
- Move older transaction across opening balance date; verify current balance
  unchanged and opening balance entry amount updates by the delta.
- Delete older transaction; verify current balance unchanged and opening balance
  entry amount reverts accordingly.

## Current Implementation Review and Gaps

- Opening balances are created via `create-opening-balance-entry` and
  `databaseService.createOpeningBalanceEntry`, but they create a single journal
  entry that can include multiple accounts instead of a single entry per account
  as required.
  - `src/services/database.ts:1232`
- Opening balance entries are not uniquely tagged (no entry type metadata).
  Updates create new entries rather than updating an existing opening balance
  entry.
  - `src/services/database.ts:1232`
- UI provides a "Set Opening Balance" modal on the transactions page and a
  separate bulk "OpeningBalances" page, but there is no opening balance field
  during account creation, and the post-creation flow does not align with the
  required dedicated account-details modal.
  - `src/renderer/pages/AccountTransactionsPage.tsx:17`
  - `src/renderer/pages/OpeningBalances.tsx:8`
  - `src/renderer/components/AccountModal.tsx:11`
- The modal uses "Desired Opening Balance" and computes a diff from current
  balance, effectively creating an adjustment entry rather than setting a true
  opening balance as-of a date.
  - `src/renderer/pages/AccountTransactionsPage.tsx:84`
- Liability semantics are incorrect in the service layer: opening balance line
  sign uses `AccountType.System` to infer liabilities instead of account subtype,
  which will treat user liability accounts as assets.
  - `src/services/database.ts:1238`
- UI labels do not reflect liability semantics ("Balance owed"); the current
  label is generic.
  - `src/renderer/pages/AccountTransactionsPage.tsx:150`
- The system account name is `Opening Balance Equity`, which differs from the
  required `Opening Balances` naming.
  - `src/services/database.ts:1251`
- There is no backfill adjustment logic tied to transaction insert/update/delete
  for entries dated before the opening balance date; `createJournalEntry`,
  `updateJournalEntryLine`, and `deleteJournalEntry` do not adjust opening
  balances to preserve current balances.
  - `src/services/database.ts:818`
  - `src/services/database.ts:1510`
  - `src/services/database.ts:2214`
