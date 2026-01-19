# Requirements: Transaction Display Order (F-005)

## Summary

Allow users to reorder same-date transactions while keeping consistent ordering across accounts.

## User Goals

- Move transactions up or down within the same date.
- Keep order consistent wherever the transaction appears.
- Preserve a reasonable default order for new transactions.

## Functional Requirements

- Transactions are ordered by date and per-entry display order.
- Reorder operations only apply within the same date.
- Display order updates are stored on `JournalEntry`.
- Invalid reorder actions must be rejected safely.

## Non-Functional Requirements

- Reorder operations must be atomic and consistent.
- Ordering should remain stable even when values collide or are null.
