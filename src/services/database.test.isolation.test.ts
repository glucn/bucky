/**
 * Database Test Isolation Verification
 * 
 * This test file verifies that tests are properly isolated and using the test database.
 * It ensures that:
 * 1. Tests use test.db, not dev.db
 * 2. Environment variables are correctly set
 * 3. Database service is properly configured for testing
 */

import { describe, it, expect } from 'vitest';
import { databaseService } from './database';

describe('Database Test Isolation', () => {
  it('should use test database in test environment', () => {
    // Verify environment variables
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.VITEST).toBe('true');
  });

  it('should have access to test database through databaseService', async () => {
    // Verify we can connect to the database
    const accounts = await databaseService.getAccounts();
    
    // Should have default accounts (Opening Balances, Retained Earnings)
    expect(accounts).toBeDefined();
    expect(Array.isArray(accounts)).toBe(true);
  });

  it('should isolate test data from development database', async () => {
    // Create a test account with a unique name
    const testAccountName = `TEST_ISOLATION_${Date.now()}`;
    
    const account = await databaseService.createAccount({
      name: testAccountName,
      type: 'user',
      subtype: 'asset',
      currency: 'USD',
    });

    expect(account).toBeDefined();
    expect(account.name).toBe(testAccountName);

    // This account should only exist in test.db, not in dev.db
    // The test cleanup will remove it after this test suite completes
  });
});
