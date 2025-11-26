/**
 * Global Test Setup - Database Initialization
 * 
 * This file is automatically executed by Vitest before any tests run.
 * It's configured in vitest.config.ts via the setupFiles option.
 * 
 * Purpose:
 * - Initialize the test database (prisma/test.db) before tests start
 * - Ensure the database schema is applied
 * - Connect the DatabaseService to the test database
 * - Disconnect cleanly after all tests complete
 * 
 * Environment:
 * - VITEST=true is set by Vitest automatically
 * - NODE_ENV=test is set in vitest.config.ts
 * - These variables trigger the DatabaseService to use test.db
 * 
 * First-Time Setup:
 * If you're running tests for the first time, you need to apply the schema:
 * ```bash
 * npm run test:db:push
 * ```
 * 
 * This setup file will throw an error if the schema hasn't been applied,
 * with instructions on how to fix it.
 * 
 * Test Isolation:
 * - This file runs ONCE before all tests
 * - Individual tests should call resetTestDatabase() in beforeEach hooks
 * - This ensures each test starts with a clean database state
 * 
 * See README.md for more information on database management.
 */

import { beforeAll, afterAll } from 'vitest';
import { initializeTestDatabase } from './database.test.utils';
import { databaseService } from './database';

// Initialize test database before all tests
beforeAll(async () => {
  console.log('[Test Setup] Initializing test database...');
  await initializeTestDatabase();
  console.log('[Test Setup] Test database initialized successfully');
});

// Disconnect after all tests
afterAll(async () => {
  console.log('[Test Setup] Disconnecting from test database...');
  await databaseService.disconnect();
  console.log('[Test Setup] Disconnected successfully');
});
