# Requirements: Test Database Separation (F-006)

## Summary

Tests must use a separate database from development to prevent data corruption and allow reliable test isolation.

## User Goals

- Run tests without modifying development data.
- Keep test schema aligned with development schema.
- Reset test data to a clean state automatically.

## Functional Requirements

- Detect test environment and route DB operations to `prisma/test.db`.
- Use `prisma/dev.db` for development runs.
- Provide test setup and reset utilities.
- Ensure test database files are excluded from version control.

## Non-Functional Requirements

- Environment detection should be automatic and logged.
- Test database operations should be repeatable and deterministic.
