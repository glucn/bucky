# Requirements: Placeholder Cleanup (F-010)

## Summary

Enable a focused cleanup workflow for transactions that were auto-assigned to `Uncategorized Income` or `Uncategorized Expense` during import, using existing transaction description text as the primary reassignment hint.

## Goals

- Help users quickly find and reclassify uncategorized imported transactions.
- Keep F-010 focused on cleanup actions, not inference/learning logic.
- Reuse existing transactions surfaces where practical to avoid duplicate UX.
- Keep behavior consistent between inline cleanup actions and the Edit Transaction flow.

## User Stories

- As a user, I can view only uncategorized transactions so I can clean them up efficiently.
- As a user, I can use transaction descriptions from import data to decide the correct destination account.
- As a user, I can reassign an uncategorized transaction inline without leaving the transactions list.
- As a user, I can choose either a category account or another user account when reassignment represents a transfer.

## Functional Requirements

- **Cleanup scope definition**
  - A "placeholder" in F-010 means a transaction whose counter-account is `Uncategorized Income` or `Uncategorized Expense`.
  - F-010 does not introduce a separate placeholder entity.
- **Cleanup mode in transactions page**
  - Provide a dedicated cleanup mode within the transactions experience (not a separate page for MVP).
  - Cleanup mode must filter to transactions currently assigned to uncategorized placeholder accounts.
  - Show clear progress context (for example, count of remaining uncategorized transactions).
- **Original hint display**
  - Use existing transaction `description` (imported payee/memo text when available) as the original hint for cleanup decisions.
  - Do not require adding a new persisted field (such as `originalCounterpartyLabel`) in F-010.
- **Inline reassignment**
  - For uncategorized rows, allow inline reassignment of the counter-account.
  - Reassignment target must support any account type (category or user account), subject to existing transaction validity rules.
  - After successful reassignment, the row should refresh and leave the cleanup list if no longer uncategorized.
- **Picker usability for large account sets**
  - Reassignment control should reduce overload via grouping and filtering/search.
  - MVP should prioritize category-first presentation while still allowing access to all account types.
  - Multi-tab segmented picker (for income/expense/transfer) is out of scope for F-010 MVP.
- **Edit Transaction consistency**
  - Edit Transaction account selection must be aligned with cleanup reassignment behavior.
  - If cleanup supports any account type, Edit Transaction must also allow selecting any account type (with appropriate labels and validation).
- **No inference logic in F-010**
  - F-010 must not infer categories/accounts from description text.
  - Description-driven inference/rules remain in F-011.

## Non-Functional Requirements

- **Data integrity**
  - Reassignments must preserve double-entry correctness and existing transaction balancing semantics.
- **Performance**
  - Cleanup filtering and reassignment interactions should remain responsive for typical imported transaction volumes.
- **Safety and transparency**
  - No silent reassignment; user action is always required.
  - Any reassignment failure should provide clear, actionable error feedback.
- **Testability**
  - Add stable `data-testid` hooks for cleanup mode toggle, inline reassignment control, and apply action to support E2E coverage.

## Dependencies and Relationship to Other Features

- Depends on F-008 import behavior that routes missing destination mappings to uncategorized accounts.
- Designed to be split-but-connected with F-011:
  - F-010 provides cleanup workflow and manual reassignment tooling.
  - F-011 later adds description-based inference/suggestion logic on top.

## Out of Scope

- Automatic category/account inference from descriptions (F-011).
- Learning rules, confidence scoring, or auto-apply categorization (F-011).
- New persisted metadata field for original counterparty labels in F-010.
- Standalone dedicated cleanup page in MVP.
- Advanced multi-tab destination picker UX in MVP.
