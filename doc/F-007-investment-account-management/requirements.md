# Requirements: Investment Account Management (F-007)

## Summary

Support investment portfolios with trade cash accounts, security accounts, transaction recording, analytics, and imports.

## User Goals

- Create investment portfolios and trade cash accounts.
- Track security positions and cost basis.
- Record buys, sells, dividends, reinvestments, fees, interest, and cash movements.
- View portfolio value, allocations, income, and performance.
- Import investment transactions and price history.

## Functional Requirements

- Portfolio management (create, list, account membership).
- Security account creation with investment properties.
- Transaction recording with double-entry integrity.
- Cost basis handling for FIFO and average cost.
- Price history storage and analytics.
- Investment reporting (positions, portfolio value, gains, income).
- Import flow with validation and duplicate detection.

## Non-Functional Requirements

- Preserve accounting correctness and balance invariants.
- Support multi-currency trade cash accounts.
- Provide predictable UI for investment actions and reports.
