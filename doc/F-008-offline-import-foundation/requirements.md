# Requirements: Offline Import Foundation (F-008)

## Summary

Enable offline-first transaction imports without bank connections, using flexible CSV mapping, preview, duplicate detection, and uncategorized fallback for missing counter-accounts.

## Goals

- Import transactions from CSV exports from different banks/apps without online connection.
- Provide a safe, transparent preview before data is written.
- Support partial mapping and gradual cleanup via placeholder accounts.

## User Stories

- As a user, I can import a CSV from any bank by mapping columns manually each time, with helpful suggestions.
- As a user, I can preview rows before import.
- As a user, I can detect and decide how to handle potential duplicates.
- As a user, I can import with unmapped counterpart accounts, then clean them up later.

## Functional Requirements

- **CSV input**
  - Accept CSV files from arbitrary sources (no fixed template).
  - Require a mapping step for each import session.
  - Provide mapping suggestions but never auto-apply without confirmation.
- **Required fields**
  - Transaction Date is mandatory.
  - Post Date is optional.
  - Amount is mandatory.
  - Description/Payee can be blank.
- **Primary account scope**
  - Each import session targets a single primary account.
  - Transactions may reference other accounts (counter-accounts).
- **Preview**
  - Provide a read-only preview before import.
  - Users edit transactions after import using the existing transaction edit flow.
  - Allow bulk import from preview.
- **Duplicate detection**
  - Detect potential duplicates within the CSV by exact match on Transaction Date + Amount + Description.
  - Show duplicates to user; never auto-ignore or auto-delete.
  - Allow a batch decision to import or skip duplicates before import.
- **Uncategorized fallback**
  - If a counter-account is not mapped, route it to `Uncategorized Income/Expense`.
  - Only honor `toAccountId` when the user maps a column to it.
- **Import session UI**
  - Provide a dedicated import workflow in the UI.
  - Keep one CSV file per session for MVP.
  - Show skipped rows and reasons after import.
- **Categorization integration**
  - Allow category/counter-account mapping via the mapped column.
  - If categorization rules exist (F-011), show transparent suggestions only when exact match.
  - Confirm before auto-creating new categories from mapped values.

## Non-Functional Requirements

- Offline-first: no external connections required to import.
- Auditability: imports are traceable in the UI session.
- Safety: no data is removed or skipped silently.
- Auto-mapping suggestions must be explicitly applied by the user.
- Performance: preview handles up to ~5k rows comfortably.

## Out of Scope (for F-008)

- Opening balance adjustments (F-009).
- Auto-categorization learning rules (F-011).
- Placeholder reassignment workflow (F-010).
- Original counter-account metadata storage (post-MVP).
- Background metadata enrichment (F-017).
- Saved mappings/templates.
