# Design: Account Grouping (F-004)

## Architecture

- **Service**: `databaseService` manages account group CRUD and reorder operations.
- **IPC**: Handlers in `src/main/index.ts` expose group operations to the renderer.
- **UI**: Grouped account lists and group modals live in `src/renderer/components` and `src/renderer/pages`.

## Key Flows

- Create/update/delete group: renderer -> IPC -> `databaseService`.
- Reorder groups: renderer computes new order and submits batch update.
- Move account between groups: `addAccountToGroup` / `removeAccountFromGroup`.

## Data Model

- `AccountGroup` stores `displayOrder` and `accountType`.
- Accounts link to groups through a join relationship managed by the service.
