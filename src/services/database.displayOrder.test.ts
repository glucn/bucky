import { describe, it, expect, beforeEach } from 'vitest';
import { databaseService } from './database';
import { resetTestDatabase } from './database.test.utils';

describe('Transaction displayOrder', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it('should set displayOrder to Date.now() for new regular transactions', async () => {
    // Create test accounts
    const fromAccount = await databaseService.createAccount({
      name: 'Test From Account',
      type: 'user',
      subtype: 'asset',
      currency: 'USD',
    });

    const toAccount = await databaseService.createAccount({
      name: 'Test To Account',
      type: 'user',
      subtype: 'asset',
      currency: 'USD',
    });

    const beforeCreate = Date.now();
    
    // Create a transaction with unique description to avoid duplicate detection
    const result = await databaseService.createJournalEntry({
      date: '2024-01-15',
      description: `Test Transaction ${Date.now()} ${Math.random()}`,
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      amount: 100,
    });

    const afterCreate = Date.now();

    expect(result.skipped).toBe(false);
    expect(result.entry).toBeDefined();
    expect(result.entry.displayOrder).toBeDefined();
    expect(result.entry.displayOrder).toBeGreaterThanOrEqual(beforeCreate);
    expect(result.entry.displayOrder).toBeLessThanOrEqual(afterCreate);
  });

  it('should set displayOrder to Date.now() for currency transfer transactions', async () => {
    // Create test accounts with different currencies
    const fromAccount = await databaseService.createAccount({
      name: 'USD Account',
      type: 'user',
      subtype: 'asset',
      currency: 'USD',
    });

    const toAccount = await databaseService.createAccount({
      name: 'EUR Account',
      type: 'user',
      subtype: 'asset',
      currency: 'EUR',
    });

    const beforeCreate = Date.now();
    
    // Create a currency transfer transaction with unique description
    const result = await databaseService.createJournalEntry({
      date: '2024-01-15',
      description: `Currency Transfer ${Date.now()} ${Math.random()}`,
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      type: 'currency_transfer',
      amountFrom: 100,
      amountTo: 85,
      exchangeRate: 0.85,
    });

    const afterCreate = Date.now();

    expect(result.skipped).toBe(false);
    expect(result.entry).toBeDefined();
    expect(result.entry.displayOrder).toBeDefined();
    expect(result.entry.displayOrder).toBeGreaterThanOrEqual(beforeCreate);
    expect(result.entry.displayOrder).toBeLessThanOrEqual(afterCreate);
  });

  it('should set displayOrder for opening balance transactions', async () => {
    // Create test account
    const account = await databaseService.createAccount({
      name: 'Test Account',
      type: 'user',
      subtype: 'asset',
      currency: 'USD',
    });

    const beforeCreate = Date.now();
    
    // Create opening balance
    await databaseService.createOpeningBalanceEntry(
      [
        {
          accountId: account.id,
          balance: 1000,
        },
      ],
      new Date('2024-01-01')
    );

    const afterCreate = Date.now();

    // Verify the journal entry has displayOrder set by querying the account's journal entries
    const entries = await databaseService.getJournalEntriesForAccount(account.id);

    expect(entries.length).toBeGreaterThan(0);
    const openingBalanceEntry = entries.find(e => e.entry.description === 'Opening Balance');
    expect(openingBalanceEntry).toBeDefined();
    expect(openingBalanceEntry!.entry.displayOrder).toBeDefined();
    expect(openingBalanceEntry!.entry.displayOrder).toBeGreaterThanOrEqual(beforeCreate);
    expect(openingBalanceEntry!.entry.displayOrder).toBeLessThanOrEqual(afterCreate);
  });
});
