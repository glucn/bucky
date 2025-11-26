/**
 * Test Database Utilities
 * 
 * This module provides utility functions for managing the test database.
 * These functions are designed to be used in test setup and teardown hooks.
 * 
 * Key Functions:
 * - resetTestDatabase(): Clears all data and recreates default accounts
 * - initializeTestDatabase(): Creates database file and applies schema
 * - seedTestDatabase(): Seeds database with test data
 * - getTestDatabasePath(): Returns path to test database for debugging
 * 
 * Usage in Tests:
 * ```typescript
 * import { resetTestDatabase } from './database.test.utils';
 * 
 * describe('My Tests', () => {
 *   beforeEach(async () => {
 *     await resetTestDatabase(); // Start each test with clean state
 *   });
 * 
 *   it('should work', async () => {
 *     // Test code here
 *   });
 * });
 * ```
 * 
 * The test database is automatically initialized by the global test setup file
 * (database.test.setup.ts) before any tests run. You typically only need to
 * call resetTestDatabase() in your test's beforeEach hook.
 * 
 * See README.md for troubleshooting and database management commands.
 */

import { databaseService } from './database';
import path from 'path';
import fs from 'fs';

/**
 * Get the current test database path.
 * Useful for debugging and verification.
 * 
 * @returns Absolute path to the test database file (prisma/test.db)
 * 
 * @example
 * ```typescript
 * const dbPath = getTestDatabasePath();
 * console.log('Test database location:', dbPath);
 * ```
 */
export function getTestDatabasePath(): string {
  // The test database is located in the prisma directory
  return path.join(process.cwd(), 'prisma', 'test.db');
}

/**
 * Initialize the test database with schema.
 * Creates the database file if it doesn't exist and applies the schema.
 * 
 * This function is automatically called by the global test setup file
 * (database.test.setup.ts) before any tests run. You typically don't need
 * to call this manually.
 * 
 * Prerequisites:
 * - The test database schema must be applied first
 * - Run `npm run test:db:push` before running tests for the first time
 * 
 * What it does:
 * 1. Checks if test.db exists
 * 2. Connects to the database (creates file if needed)
 * 3. Resets all data and creates default accounts
 * 4. Throws error if schema hasn't been applied
 * 
 * @throws Error if test database schema has not been applied
 * 
 * @example
 * ```typescript
 * // Usually called automatically, but can be called manually if needed
 * await initializeTestDatabase();
 * ```
 */
export async function initializeTestDatabase(): Promise<void> {
  const testDbPath = getTestDatabasePath();
  
  console.log('[Test Utils] Initializing test database at:', testDbPath);
  
  // Check if database file exists
  const dbExists = fs.existsSync(testDbPath);
  
  if (!dbExists) {
    console.log('[Test Utils] Test database does not exist, it will be created on first connection');
  }
  
  // Connect to the database (this will create the file if it doesn't exist)
  try {
    await databaseService.initialize();
    
    // Try to ensure default accounts exist
    // This will fail if the schema hasn't been applied yet
    try {
      await databaseService.resetAllData();
    } catch (schemaError: any) {
      // Check if this is a "table does not exist" error
      if (schemaError.code === 'P2021' || schemaError.message?.includes('does not exist')) {
        throw new Error(
          'Test database schema has not been applied. ' +
          'Please run: npm run test:db:push'
        );
      }
      throw schemaError;
    }
    
    console.log('[Test Utils] Test database initialized successfully');
  } catch (error) {
    console.error('[Test Utils] Failed to initialize test database:', error);
    throw error;
  }
}

/**
 * Reset the test database to a clean state.
 * Deletes all data and recreates default accounts.
 * 
 * This is the most commonly used test utility function. Call it in your
 * test's beforeEach hook to ensure each test starts with a clean database.
 * 
 * What it does:
 * 1. Deletes all journal lines, entries, checkpoints, and accounts
 * 2. Recreates default accounts (Opening Balance, Retained Earnings)
 * 3. If reset fails, attempts to recreate the database file
 * 
 * Performance: Typically completes in < 100ms
 * 
 * @throws Error if reset fails and database cannot be recreated
 * 
 * @example
 * ```typescript
 * describe('Account Tests', () => {
 *   beforeEach(async () => {
 *     await resetTestDatabase(); // Each test starts fresh
 *   });
 * 
 *   it('should create account', async () => {
 *     const account = await databaseService.createAccount({
 *       name: 'Test Account',
 *       type: AccountType.User,
 *     });
 *     expect(account).toBeDefined();
 *   });
 * });
 * ```
 */
export async function resetTestDatabase(): Promise<void> {
  console.log('[Test Utils] Resetting test database...');
  
  try {
    // Use the existing resetAllData method from DatabaseService
    await databaseService.resetAllData();
    console.log('[Test Utils] Test database reset successfully');
  } catch (error) {
    console.error('[Test Utils] Failed to reset test database:', error);
    
    // If reset fails, try to recreate the database file
    console.warn('[Test Utils] Reset failed, attempting to recreate database file');
    
    try {
      // Disconnect first
      await databaseService.disconnect();
      
      // Delete the database file
      const testDbPath = getTestDatabasePath();
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      
      // Delete the journal file if it exists
      const journalPath = `${testDbPath}-journal`;
      if (fs.existsSync(journalPath)) {
        fs.unlinkSync(journalPath);
      }
      
      // Reinitialize
      await initializeTestDatabase();
      
      console.log('[Test Utils] Database file recreated successfully');
    } catch (recreateError) {
      console.error('[Test Utils] Failed to recreate database file:', recreateError);
      throw new Error(
        'Failed to reset test database. ' +
        'Try manually deleting the test database file and running tests again.'
      );
    }
  }
}

/**
 * Seed the test database with common test data.
 * Useful for integration tests that need a consistent starting state.
 * 
 * This function allows you to populate the test database with predefined
 * accounts and transactions. It's optional and typically used for integration
 * tests that need more complex initial state.
 * 
 * @param data Optional test seed data configuration
 *   - accounts: Array of account definitions to create
 *   - transactions: Array of transaction definitions to create
 * 
 * @example
 * ```typescript
 * await seedTestDatabase({
 *   accounts: [
 *     { name: 'Checking', type: AccountType.User, currency: 'USD' },
 *     { name: 'Savings', type: AccountType.User, currency: 'USD' },
 *   ],
 *   transactions: [
 *     {
 *       date: '2024-01-01',
 *       description: 'Initial deposit',
 *       fromAccountId: checkingId,
 *       toAccountId: savingsId,
 *       amount: 1000,
 *     },
 *   ],
 * });
 * ```
 */
export async function seedTestDatabase(data?: TestSeedData): Promise<void> {
  console.log('[Test Utils] Seeding test database...');
  
  // Default seed data if none provided
  const seedData: TestSeedData = data || {
    accounts: [],
    transactions: [],
  };
  
  try {
    // Create additional accounts if specified
    if (seedData.accounts && seedData.accounts.length > 0) {
      for (const accountData of seedData.accounts) {
        await databaseService.createAccount(accountData);
      }
      console.log(`[Test Utils] Created ${seedData.accounts.length} test accounts`);
    }
    
    // Create transactions if specified
    if (seedData.transactions && seedData.transactions.length > 0) {
      for (const transactionData of seedData.transactions) {
        await databaseService.createJournalEntry(transactionData);
      }
      console.log(`[Test Utils] Created ${seedData.transactions.length} test transactions`);
    }
    
    console.log('[Test Utils] Test database seeded successfully');
  } catch (error) {
    console.error('[Test Utils] Failed to seed test database:', error);
    throw error;
  }
}

/**
 * Type definition for test seed data
 */
export interface TestSeedData {
  accounts?: Array<{
    name: string;
    type: string;
    currency?: string;
    subtype?: string;
  }>;
  transactions?: Array<{
    date: string | Date;
    description?: string;
    fromAccountId: string;
    toAccountId: string;
    amount?: number;
    amountFrom?: number;
    amountTo?: number;
    exchangeRate?: number;
    type?: string;
    transactionType?: 'income' | 'expense' | 'transfer';
  }>;
}
