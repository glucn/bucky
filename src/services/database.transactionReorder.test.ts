/**
 * Basic tests for transaction reordering functionality
 * 
 * These tests verify that the transaction reordering methods work correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { databaseService } from './database';
import { AccountType } from '../shared/accountTypes';

describe.skip('Transaction Reordering - Basic Tests', () => {
  let testAccount1: any;
  let testAccount2: any;
  let testTransactions: any[] = [];

  beforeEach(async () => {
    // Create test accounts
    testAccount1 = await databaseService.createAccount({
      name: `Test Account 1 ${Date.now()}`,
      type: AccountType.User,
    });

    testAccount2 = await databaseService.createAccount({
      name: `Test Account 2 ${Date.now()}`,
      type: AccountType.User,
    });

    // Create test transactions on the same date
    const testDate = '2024-01-15';
    testTransactions = [];

    for (let i = 0; i < 3; i++) {
      const result = await databaseService.createJournalEntry({
        date: testDate,
        description: `Test Transaction ${i + 1}`,
        fromAccountId: testAccount1.id,
        toAccountId: testAccount2.id,
        amount: 100 + i * 10,
        transactionType: 'transfer',
      });

      if (!result.skipped && result.entry) {
        testTransactions.push(result.entry);
      }
    }
  });

  it('should move a transaction up successfully', async () => {
    // Get the middle transaction
    const middleTransaction = testTransactions[1];

    // Move it up
    const result = await databaseService.moveTransactionUp(middleTransaction.id);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should fail to move the first transaction up', async () => {
    // Get the first transaction
    const firstTransaction = testTransactions[0];

    // Try to move it up
    const result = await databaseService.moveTransactionUp(firstTransaction.id);

    expect(result.success).toBe(false);
    expect(result.error).toContain('already first');
  });

  it('should move a transaction down successfully', async () => {
    // Get the middle transaction
    const middleTransaction = testTransactions[1];

    // Move it down
    const result = await databaseService.moveTransactionDown(middleTransaction.id);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should fail to move the last transaction down', async () => {
    // Get the last transaction
    const lastTransaction = testTransactions[testTransactions.length - 1];

    // Try to move it down
    const result = await databaseService.moveTransactionDown(lastTransaction.id);

    expect(result.success).toBe(false);
    expect(result.error).toContain('already last');
  });
});
