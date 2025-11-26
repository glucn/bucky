/**
 * Basic tests for transaction reordering functionality
 * 
 * These tests verify that the transaction reordering methods work correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { databaseService } from './database';
import { AccountType } from '../shared/accountTypes';
import { resetTestDatabase } from './database.test.utils';

// Run tests serially to avoid race conditions
describe.sequential('Transaction Reordering - Basic Tests', () => {
  let testAccount1: any;
  let testAccount2: any;
  let testTransactions: any[] = [];

  beforeEach(async () => {
    // Reset database and wait for completion
    await resetTestDatabase();
    
    // Create test accounts with unique names
    const timestamp = Date.now();
    testAccount1 = await databaseService.createAccount({
      name: `Test Account 1 ${timestamp}`,
      type: AccountType.User,
    });

    testAccount2 = await databaseService.createAccount({
      name: `Test Account 2 ${timestamp}`,
      type: AccountType.User,
    });

    // Create test transactions on the same date using forceDuplicate to bypass duplicate detection
    const testDate = '2024-01-15';
    testTransactions = [];

    // Create transactions with forceDuplicate flag to bypass duplicate detection
    for (let i = 0; i < 3; i++) {
      const result = await databaseService.createJournalEntry({
        date: testDate,
        description: `Test Transaction ${i + 1}`,
        fromAccountId: testAccount1.id,
        toAccountId: testAccount2.id,
        amount: 100 + i * 10,
        transactionType: 'transfer',
        forceDuplicate: true, // Bypass duplicate detection for test data
      });

      if (!result.skipped && result.entry) {
        testTransactions.push(result.entry);
      } else {
        // Log if transaction was skipped for debugging
        console.error(`Transaction ${i + 1} was skipped:`, result);
        throw new Error(`Failed to create transaction ${i + 1}`);
      }
    }
    
    // Ensure we have 3 transactions
    if (testTransactions.length !== 3) {
      console.error('Expected 3 transactions but got:', testTransactions.length);
      console.error('Transactions:', testTransactions);
      throw new Error(`Expected 3 transactions but got ${testTransactions.length}`);
    }
  });

  it('should move a transaction up successfully', async () => {
    // Get the middle transaction (Transaction 2, which is in the middle when ordered by displayOrder)
    // testTransactions is in creation order, so index 1 is Transaction 2
    const middleTransaction = testTransactions[1];

    // Move it up
    const result = await databaseService.moveTransactionUp(middleTransaction.id);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should fail to move the first transaction up', async () => {
    // Get the first transaction (Transaction 3, which has the highest displayOrder and appears first/top in UI)
    // testTransactions is in creation order, so last index is Transaction 3
    const firstTransaction = testTransactions[testTransactions.length - 1];

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
    // Get the last transaction (Transaction 1, which has the lowest displayOrder and appears last/bottom in UI)
    // testTransactions is in creation order, so index 0 is Transaction 1
    const lastTransaction = testTransactions[0];

    // Try to move it down
    const result = await databaseService.moveTransactionDown(lastTransaction.id);

    expect(result.success).toBe(false);
    expect(result.error).toContain('already last');
  });
});
