# Design: Credit Card Management (F-001)

## Architecture

- **Service**: `src/services/creditCardService.ts` manages properties and metrics.
- **IPC**: Handlers in `src/main/index.ts` expose setup, updates, and metrics.
- **UI**: Credit card setup modal and metrics display in `AccountTransactionsPage`.

## Key Flows

- Setup credit card: validate input, ensure liability subtype, persist properties.
- Update properties: versioned update with end-date for prior record.
- Metrics: compute utilization, available credit, and minimum payment based on current properties and balance.

## Data Model

- `CreditCardProperties` records keyed by account, with `effectiveDate`, `endDate`, and `isActive`.
- Liability account balances are normalized for user-facing display.
