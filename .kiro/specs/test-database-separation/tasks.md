# Implementation Plan

- [x] 1. Update .gitignore to exclude test database files
  - Add `prisma/test.db` and `prisma/test.db-journal` to .gitignore
  - Verify test database files are not tracked by git
  - _Requirements: 5.1_

- [x] 2. Modify DatabaseService for environment-aware database selection
  - [x] 2.1 Add environment detection logic to constructor
    - Detect `VITEST` and `NODE_ENV` environment variables
    - Determine if running in test or development environment
    - Set `databasePath` property based on environment
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [x] 2.2 Configure Prisma Client with environment-specific datasource URL
    - Pass `databasePath` to Prisma Client datasource configuration
    - Adjust logging level based on environment (minimal for tests, verbose for dev)
    - _Requirements: 1.1, 1.2_
  
  - [x] 2.3 Add database path logging
    - Log selected database path on initialization
    - Include environment detection result in logs
    - _Requirements: 4.5_
  
  - [x] 2.4 Implement fallback behavior for environment detection failures
    - Default to development database if environment is ambiguous
    - Log warning when defaulting to development database
    - _Requirements: 4.4_
  
  - [ ]* 2.5 Write property test for environment detection
    - **Property 4: Environment detection correctness**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 3. Create test database utility functions
  - [x] 3.1 Create database.test.utils.ts file
    - Implement `resetTestDatabase()` function to clear all data
    - Implement `initializeTestDatabase()` function to create database file
    - Implement `seedTestDatabase()` function for test data seeding
    - Implement `getTestDatabasePath()` function for debugging
    - _Requirements: 3.1, 3.4, 5.3_
  
  - [ ]* 3.2 Write property test for database reset idempotence
    - **Property 3: Test database reset idempotence**
    - **Validates: Requirements 3.1, 3.4**
  
  - [ ]* 3.3 Write property test for test data non-persistence
    - **Property 5: Test data non-persistence**
    - **Validates: Requirements 3.2**

- [x] 4. Create global test setup file
  - [x] 4.1 Create database.test.setup.ts file
    - Import test utilities and database service
    - Add `beforeAll` hook to initialize test database
    - Add `afterAll` hook to disconnect database
    - _Requirements: 3.1, 5.3_
  
  - [x] 4.2 Update vitest.config.ts to use setup file
    - Add `setupFiles` configuration pointing to test setup file
    - Add environment variables for test context (`NODE_ENV=test`, `VITEST=true`)
    - _Requirements: 4.1_

- [x] 5. Add npm scripts for test database management
  - Add `test:db:reset` script to delete and recreate test database
  - Add `test:db:migrate` script to apply migrations to test database
  - Add `test:db:push` script to push schema to test database
  - Add `dev:db:reset` script for development database reset
  - _Requirements: 2.2, 6.3_

- [x] 6. Update existing tests to use test database
  - [x] 6.1 Remove `.skip` from property-based tests
    - Update `database.accountGroups.test.ts` to remove skip
    - Update other skipped test files to remove skip
    - _Requirements: 1.1, 1.3_
  
  - [x] 6.2 Add database reset to test setup hooks
    - Add `beforeEach` hooks with `resetTestDatabase()` calls to existing test files
    - Remove manual cleanup code where possible
    - Ensure tests start with clean state
    - _Requirements: 3.1, 3.2_
  
  - [ ]* 6.3 Write property test for database isolation
    - **Property 1: Environment-based database isolation**
    - **Validates: Requirements 1.1, 1.3**
  
  - [ ]* 6.4 Write property test for development database preservation
    - **Property 6: Development database preservation**
    - **Validates: Requirements 1.5**

- [x] 7. Verify schema consistency between environments
  - [ ]* 7.1 Write property test for schema consistency
    - **Property 2: Schema consistency across environments**
    - **Validates: Requirements 2.1, 2.3**
  
  - [ ]* 7.2 Write property test for migration consistency
    - **Property 7: Migration application consistency**
    - **Validates: Requirements 2.2, 2.4**

- [x] 8. Add debugging support for database operations
  - Add `DB_VERBOSE` environment variable support
  - Update Prisma Client logging configuration to respect verbose flag
  - Document usage of verbose logging in comments
  - _Requirements: 4.5_

- [x] 9. Create documentation for database separation
  - Document database file locations in README or docs
  - Document npm scripts for database management
  - Add troubleshooting section for common database issues
  - Document migration workflow for both databases
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
