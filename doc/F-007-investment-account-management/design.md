# Design: Investment Account Management (F-007)

## Architecture

- **Service**: `src/services/investmentService.ts` provides portfolio, transaction, and analytics logic.
- **IPC**: `src/main/ipcHandlers.investments.ts` exposes investment operations to the renderer.
- **UI**: Investment pages and modals in `src/renderer/pages` and `src/renderer/components`.

## Key Flows

- Portfolio creation: create account group + trade cash account and link.
- Security accounts: create and attach investment properties.
- Transactions: write journal entries for buy/sell/dividend/fee/interest/cash flows.
- Analytics: compute positions, portfolio value, allocation, income, and performance.
- Imports: validate CSV mapping, create accounts if needed, record transactions.

## Data Model

- `InvestmentProperties` for security metadata and cost basis tracking.
- `SecurityPriceHistory` for market prices and history.
- Investment transactions recorded as `JournalEntry` with typed metadata.
