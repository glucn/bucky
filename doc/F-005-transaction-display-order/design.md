# Design: Transaction Display Order (F-005)

## Architecture

- **Service**: `databaseService` provides move up/down and swap helpers.
- **IPC**: `src/main/index.ts` exposes reorder handlers.
- **UI**: `AccountTransactionsPage` renders controls and refreshes lists after reorder.

## Key Flows

- Move up/down triggers IPC call, swaps `displayOrder` values within same date.
- New transactions use timestamp-based `displayOrder`.
- UI disables controls for first/last items in a date group.

## Data Model

- `JournalEntry.displayOrder` stores ordering.
- Null display order falls back to `createdAt` timestamps.
