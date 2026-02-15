# Bucky Agent Handoff Guide

## Project Summary

Bucky is a personal bookkeeping desktop app built with Electron, React, and Prisma on SQLite. It follows double-entry accounting rules in the data layer while presenting user-friendly balances and transactions in the UI.

## Architecture Overview

- **Electron main process**: IPC handlers live in `src/main/index.ts` and domain-specific handler modules (e.g. `src/main/ipcHandlers.investments.ts`).
- **Renderer (React)**: UI in `src/renderer/pages` and reusable components in `src/renderer/components`.
- **Services**: Business logic in `src/services/*.ts` (e.g. `database.ts`, `investmentService.ts`, `creditCardService.ts`).
- **Shared types/utilities**: `src/shared` and `src/renderer/utils`.
- **Database**: Prisma schema in `prisma/schema.prisma`, SQLite databases in `prisma/dev.db` and `prisma/test.db`.

## Key Workflows

- **Database access**: Always go through `databaseService` (`src/services/database.ts`) unless you need raw Prisma access.
- **IPC**: Renderer calls `window.electron.*` methods defined in `src/preload.ts`; handlers registered in `src/main/index.ts`.
- **Transactions**: Stored as `JournalEntry` + `JournalLine`. UI uses display normalization utilities to render intuitive signs.

## Environment & Database Separation

- Test vs dev databases are selected automatically:
  - Test: `VITEST=true` or `NODE_ENV=test` -> `prisma/test.db`
  - Dev: `NODE_ENV=development` or unset -> `prisma/dev.db`
- Database initialization and resets are handled in `src/services/database.test.setup.ts` and `src/services/database.test.utils.ts`.

## Commands

- Dev app: `npm run dev`
- Tests: `npm test`
- E2E tests: `npx playwright test`
- E2E tests (headed): `npx playwright test --headed`
- Test DB reset: `npm run test:db:reset`
- Test DB schema sync: `npm run test:db:push`
- Dev DB reset: `npm run dev:db:reset`

## Feature Entry Points

- **Account grouping**: `src/services/database.ts`, `src/main/index.ts`, `src/renderer/components/GroupedAccountsList.tsx`
- **Category management**: `src/renderer/pages/Categories.tsx`, `src/renderer/components/CategoryModal.tsx`
- **Credit cards**: `src/services/creditCardService.ts`, `src/renderer/components/CreditCardSetupModal.tsx`
- **Investments**: `src/services/investmentService.ts`, `src/main/ipcHandlers.investments.ts`, `src/renderer/pages/InvestmentPortfolios.tsx`
- **Transaction display normalization**: `src/renderer/utils/displayNormalization.ts`
- **Transaction display order**: `src/services/database.ts` (move up/down), `src/renderer/pages/AccountTransactionsPage.tsx`

## Testing

- Unit/property tests live in `src/**/*.test.ts(x)`.
- E2E tests live in `tests/e2e/*.spec.ts` using Playwright (see `doc/e2e-testing-guide.md`).
- For E2E flakiness debugging and harness pitfalls, read `doc/e2e-stabilization-learnings.md` before changing product code.
- Before running Playwright tests, check whether port `3000` is already in use.
  - If port `3000` is occupied, ask the user for confirmation before killing the process.
- Investment features are covered by multiple service tests (e.g. `src/services/investmentService.*.test.ts`).
- Database isolation and transaction ordering have dedicated tests.

## Conventions

- Use `AccountType`/`AccountSubtype` enums from `src/shared/accountTypes.ts`.
- Use `parseToStandardDate` from `src/shared/dateUtils.ts` for date normalization.
- Normalize display amounts with `normalizeTransactionAmount` and `normalizeAccountBalance`.
- Keep changes in sync across service, IPC, and UI layers when introducing new features.
- Add `data-testid` attributes to UI elements that need E2E test targeting.
- Use descriptive test IDs like `import-wizard-title`, `transactions-page`, `import-transactions-button`.

## Notes
- Avoid runtime failures by keeping server-only code (for example, Prisma, filesystem) out of client components; use server actions or API routes.
- Before starting a task, think through all required changes and tests. If the scope is large, pause and align on breaking it down; otherwise complete the task end-to-end.
- When E2E tests fail intermittently, check for preload hot-update 404s (for example `main_window.<hash>.hot-update.json`) and use the stabilization guidance in `doc/e2e-stabilization-learnings.md`.
- If a file grows large (e.g., a monolithic page component), consider breaking it into smaller modules or components.
- For tasks tracked in docs, commit when done without asking; for ad-hoc investigations/fixes, confirm outcome before committing.
- For task-based work, commit as soon as you believe a task is done (do not wait for the next task).
- For well-defined tasks, prefer using git worktrees so multiple changes can be developed in parallel with isolated workspaces.
- Verify changes (build/test or relevant check) before stating work is done.
- After completing a task, run required tests and commit changes without requesting confirmation.
