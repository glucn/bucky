# Design: Transaction Display Normalization (F-003)

## Architecture

- **Utilities**: `src/renderer/utils/displayNormalization.ts` centralizes normalization rules.
- **Consumers**: Accounts, categories, transactions, transfers, and dashboards use normalized values.
- **Formatting**: `src/renderer/utils/currencyUtils.ts` integrates normalization with currency output.

## Key Flows

- Normalize transaction amount based on account type/subtype and context.
- Normalize account balance for asset/liability and category accounts.
- Use derived display sign for styling and accessibility hints.

## Data Model

- No schema changes; normalization is display-only.
