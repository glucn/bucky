# Requirements Document

## Product Vision

Bucky is a personal bookkeeping desktop application that helps users track accounts, transactions, and financial performance using a double-entry accounting foundation with a user-friendly presentation layer.

## Goals

- Provide reliable personal bookkeeping with clear visibility into balances, spending, and income.
- Support multiple account types (bank, cash, credit card, investment) with accurate accounting rules.
- Offer investment portfolio tracking with position, performance, and income reporting.
- Maintain data integrity with a robust local database and automated test isolation.

## Primary Users

- Individuals managing personal finances across cash, bank, credit cards, and investments.
- Power users who want accurate accounting rules with intuitive UI conventions.

## Core Capabilities

- Account and category management with grouping and ordering.
- Transaction entry, import, and transfer between accounts.
- Credit card account setup with limits, utilization, and payment tracking.
- Investment portfolio management with securities, cash accounts, and transactions.
- Performance and analytics (positions, portfolio value, income, gains/losses).
- Display normalization so users see intuitive positive/negative amounts.
- Manual ordering of transactions for same-date entries.

## Non-Functional Requirements

- **Local-first**: Data stored locally in SQLite.
- **Reliability**: Double-entry transactions must always balance.
- **Test isolation**: Test and dev databases are fully separated.
- **Cross-platform desktop**: Electron-based UI with offline functionality.
- **Performance**: UI should remain responsive for typical personal datasets.

## Constraints

- Single-user local database (no multi-user sync in current scope).
- SQLite with Prisma ORM as the persistence layer.
- IPC-based communication between renderer and main process.
