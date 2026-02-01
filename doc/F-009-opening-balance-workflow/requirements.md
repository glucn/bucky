# Requirements: Opening Balance Workflow (F-009)

## Summary

Provide a per-account opening balance workflow that records an explicit opening
balance journal entry, supports editing after account creation, and preserves
current balances when older transactions are added by auto-adjusting the opening
balance entry amount.

## Goals

- Let users set an opening balance during account creation and later via a
  dedicated action on account details.
- Store opening balance as a normal double-entry transaction with a system
  equity counter-account.
- Keep current balances unchanged when older transactions are inserted, edited,
  or deleted by adjusting the opening balance entry amount.
- Require an explicit "as of" date for the opening balance.

## User Stories

- As a user, I can enter an opening balance when I create an account.
- As a user, I can set or edit an opening balance later from the account page.
- As a user, I can import older transactions without my current balance
  changing; the opening balance entry adjusts instead.

## Functional Requirements

- **Opening balance entry**
  - Exactly one opening balance entry per account.
  - Stored as a standard journal entry with two lines:
    - Target account line.
    - Counter line to a system equity account named `Opening Balances`.
  - Editing the opening balance updates the existing entry.
  - Clearing the opening balance removes the entry (or sets it to zero).
- **As-of date**
  - Required for all opening balances.
  - Default to account creation date but editable.
- **Input semantics**
  - Users enter the balance as they see it.
  - For assets, positive means positive balance.
  - For liabilities, positive means amount owed; UI labels accordingly.
- **Backfill adjustments**
  - When a transaction dated before the opening balance date is inserted,
    updated, or deleted, the opening balance entry amount is adjusted by the
    net effect of that change so the current balance remains unchanged.
  - Transactions moved across the opening balance date boundary should trigger
    corresponding adjustments.
- **System account**
  - The system equity account `Opening Balances` is created on demand if missing.

## Non-Functional Requirements

- Maintain double-entry integrity for all opening balance updates.
- Changes to opening balance must be atomic with related transaction changes.
- UI must clearly communicate liability amount semantics ("Balance owed").

## Out of Scope

- Multi-entry opening balance history (single entry only).
- Reconciliation workflows or historical balance snapshots.
