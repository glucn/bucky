# Design Document

## Architecture Overview

Bucky uses a three-layer desktop architecture:

1. **Renderer (React)**: UI pages and components in `src/renderer`.
2. **Main process (Electron)**: IPC handlers in `src/main`.
3. **Services (Domain Logic)**: Business logic and data access in `src/services`.

Prisma provides typed access to a SQLite database. The renderer communicates via IPC to the main process, which delegates to services.

## Key Design Decisions

- **Double-entry accounting**: Transactions are stored as `JournalEntry` + `JournalLine` and must balance.
- **Presentation normalization**: Display transformations are handled in `src/renderer/utils/displayNormalization.ts` without mutating stored values.
- **Service-first logic**: Complex domain flows are centralized in services (investment, credit card, database).
- **Environment-aware database**: `databaseService` chooses `dev.db` vs `test.db` automatically.

## Data Model Highlights

- **Account**: Tracks user/category/system accounts, with subtype for asset/liability.
- **AccountGroup**: Groups accounts (user and category) with a configurable display order.
- **JournalEntry/JournalLine**: Double-entry transaction model.
- **InvestmentProperties / SecurityPriceHistory**: Extend account functionality for investments.
- **CreditCardProperties**: Versioned credit card configuration for liability accounts.

## IPC Flow

- Renderer calls `window.electron.*` APIs defined in `src/preload.ts`.
- Main process handlers are registered in `src/main/index.ts` (and feature modules).
- Services perform validation, persistence, and domain calculations.

## Testing Strategy

- Vitest for unit and property tests.
- Test database isolation via environment detection and setup utilities.
- Feature-specific tests for investments, display normalization, transaction order, and account groups.
