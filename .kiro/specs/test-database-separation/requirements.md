# Requirements Document

## Introduction

This document specifies the requirements for separating test and development databases in the Bucky bookkeeping application. Currently, both unit tests and the development application access the same SQLite database file (`prisma/dev.db`), which can lead to data corruption, test interference, and unreliable test results. This feature will establish a clear separation between test and development environments while maintaining the same schema and business logic across both.

## Glossary

- **Test Database**: A separate SQLite database file used exclusively during test execution via Vitest
- **Development Database**: The existing SQLite database file (`prisma/dev.db`) used when running the application with `npm run dev`
- **Database Service**: The singleton class (`DatabaseService`) that manages Prisma client connections and database operations
- **Prisma Client**: The auto-generated database client from Prisma ORM that provides type-safe database access
- **Test Environment**: The runtime context when executing tests via Vitest, identified by `NODE_ENV=test` or `VITEST=true`
- **Development Environment**: The runtime context when running the application locally via `npm run dev`
- **Schema Migration**: The process of applying database schema changes using Prisma Migrate
- **Test Isolation**: The principle that each test should run independently without affecting other tests or persisting data between test runs

## Requirements

### Requirement 1

**User Story:** As a developer, I want tests to use a separate database from the development application, so that running tests does not corrupt or interfere with my development data.

#### Acceptance Criteria

1. WHEN tests are executed via Vitest THEN the system SHALL connect to a test-specific database file separate from the development database
2. WHEN the development application runs via `npm run dev` THEN the system SHALL connect to the development database file (`prisma/dev.db`)
3. WHEN a test modifies database state THEN the system SHALL ensure those changes do not affect the development database
4. WHEN multiple tests run concurrently THEN the system SHALL maintain data isolation between test executions
5. WHEN the test suite completes THEN the system SHALL leave the development database unchanged from its pre-test state

### Requirement 2

**User Story:** As a developer, I want the test database to use the same schema as the development database, so that tests accurately reflect production behavior.

#### Acceptance Criteria

1. WHEN the test database is initialized THEN the system SHALL apply the same Prisma schema as the development database
2. WHEN schema migrations are applied to the development database THEN the system SHALL provide a mechanism to apply the same migrations to the test database
3. WHEN database operations execute in tests THEN the system SHALL use the same business logic and constraints as the development environment
4. WHEN the Prisma schema changes THEN the system SHALL ensure both test and development databases can be updated consistently

### Requirement 3

**User Story:** As a developer, I want the test database to be automatically cleaned between test runs, so that tests start with a known state and remain reliable.

#### Acceptance Criteria

1. WHEN the test suite begins execution THEN the system SHALL reset the test database to a clean initial state
2. WHEN a test creates database records THEN the system SHALL ensure those records do not persist to subsequent test runs
3. WHEN tests complete THEN the system SHALL provide an option to preserve or clean the test database based on configuration
4. WHEN the test database is reset THEN the system SHALL recreate default accounts and initial data as needed

### Requirement 4

**User Story:** As a developer, I want the database connection logic to automatically detect the environment, so that I don't need to manually configure database paths for different contexts.

#### Acceptance Criteria

1. WHEN the DatabaseService initializes THEN the system SHALL detect whether the code is running in test or development environment
2. WHEN running in test environment THEN the system SHALL automatically configure the Prisma client to use the test database path
3. WHEN running in development environment THEN the system SHALL automatically configure the Prisma client to use the development database path
4. WHEN environment detection fails THEN the system SHALL default to the development database and log a warning
5. WHEN the database path is determined THEN the system SHALL log the selected database file path for debugging purposes

### Requirement 5

**User Story:** As a developer, I want test database files to be excluded from version control, so that local test artifacts don't clutter the repository.

#### Acceptance Criteria

1. WHEN a test database file is created THEN the system SHALL ensure the file is located in a directory excluded by `.gitignore`
2. WHEN the repository is cloned THEN the system SHALL not include any test database files
3. WHEN tests run for the first time THEN the system SHALL automatically create the test database file if it does not exist
4. WHEN the test database file exists THEN the system SHALL reuse the existing file unless explicitly reset

### Requirement 6

**User Story:** As a developer, I want clear documentation on how to manage test and development databases, so that I can troubleshoot issues and understand the separation mechanism.

#### Acceptance Criteria

1. WHEN a developer reads the project documentation THEN the system SHALL provide clear instructions on database file locations
2. WHEN a developer encounters database issues THEN the system SHALL provide troubleshooting guidance for test vs development database problems
3. WHEN a developer needs to reset databases THEN the system SHALL document the commands and procedures for both test and development databases
4. WHEN schema migrations are needed THEN the system SHALL document how to apply migrations to both databases
