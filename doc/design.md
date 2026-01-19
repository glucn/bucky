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
- **Offline-first UX**: Data entry and imports never require online connections to banks.
- **User-controlled enrichment**: External metadata is fetched on demand and cached locally.

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

## MVP UX Principles

- **Simple onboarding**: Wizard is skippable and never blocks basic app usage.
- **Account-based opening balances**: Opening balances are set per account and recorded as explicit entries.
- **Backfill-safe imports**: Older transactions adjust opening balances automatically to keep current balances intact.
- **Transparent categorization**: Auto-categorization only applies on exact matches and is always visible.
- **Placeholder-friendly imports**: A single placeholder account captures unmapped counterparts for later cleanup.

## Data Enrichment Strategy

- Use read-only external APIs for asset metadata, price history, and FX rates.
- Cache enrichment data locally for historical reporting and offline use.
- MVP uses manual, on-demand refresh; background sync is a post-MVP enhancement.

## Security & Privacy

- App lock is required at every launch.
- Database encryption at rest is mandatory for MVP readiness.
- Hybrid key management: OS keychain by default with optional user passphrase.

## Reporting & Insights

- MVP provides a simple overview: net worth, income/expense trend, investment allocation.
- Drilldowns use preset ranges plus custom date pickers.
- Placeholder transactions are included in reports as "Unassigned" for MVP.

## Testing Strategy

- Vitest for unit and property tests.
- Test database isolation via environment detection and setup utilities.
- Feature-specific tests for investments, display normalization, transaction order, and account groups.
