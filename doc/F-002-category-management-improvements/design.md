# Design: Category Management Improvements (F-002)

## Architecture

- **Service**: `databaseService` provides category queries, balances, archive/delete logic.
- **IPC**: Main process exposes category operations and balance lookups.
- **UI**: `src/renderer/pages/Categories.tsx` handles grouped view, balance fetches, and modals.

## Key Flows

- Fetch grouped categories with balances via IPC.
- Delete vs archive decision based on transaction count.
- Group reorder by updating display order via IPC.

## Data Model

- Categories are `Account` records with type `category` and subtype asset/liability.
- Grouping is managed through `AccountGroup` relationships.
