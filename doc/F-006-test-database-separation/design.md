# Design: Test Database Separation (F-006)

## Architecture

- **Service**: `DatabaseService` chooses the database path based on `NODE_ENV`/`VITEST`.
- **Test setup**: `database.test.setup.ts` and `database.test.utils.ts` initialize and reset the test DB.
- **Scripts**: `npm run test:db:reset` and `npm run test:db:push` manage the test schema.

## Key Flows

- Constructor detects environment and sets Prisma datasource URL.
- Test setup initializes schema and connects before running tests.
- Reset utilities clear data and seed default accounts.

## Data Model

- No schema differences; both databases use `prisma/schema.prisma`.
