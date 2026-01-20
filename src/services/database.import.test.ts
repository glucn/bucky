import { describe, it, expect, beforeEach } from 'vitest';
import { databaseService } from './database';
import { resetTestDatabase } from './database.test.utils';

describe('Transaction Import - Date Format Support', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it('should import transactions with YYYYMMDD date format', async () => {
    const accounts = await databaseService.getAccounts();
    const cashAccount = accounts.find(acc => acc.name === 'Cash');
    const bankAccount = accounts.find(acc => acc.name === 'Bank');

    expect(cashAccount).toBeDefined();
    expect(bankAccount).toBeDefined();

    // Test YYYYMMDD format (like 20251026)
    const result = await databaseService.createJournalEntry({
      date: '20251026',
      description: 'Test transaction with YYYYMMDD format',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 100,
    });

    expect(result.skipped).toBe(false);
    expect(result.entry).toBeDefined();
    expect(result.entry?.date).toBe('2025-10-26');
  });

  it('should import transactions with MM/DD/YYYY date format', async () => {
    const accounts = await databaseService.getAccounts();
    const cashAccount = accounts.find(acc => acc.name === 'Cash');
    const bankAccount = accounts.find(acc => acc.name === 'Bank');

    // Test MM/DD/YYYY format
    const result = await databaseService.createJournalEntry({
      date: '10/26/2025',
      description: 'Test transaction with MM/DD/YYYY format',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 100,
    });

    expect(result.skipped).toBe(false);
    expect(result.entry).toBeDefined();
    expect(result.entry?.date).toBe('2025-10-26');
  });

  it('should import transactions with YYYY/MM/DD date format', async () => {
    const accounts = await databaseService.getAccounts();
    const cashAccount = accounts.find(acc => acc.name === 'Cash');
    const bankAccount = accounts.find(acc => acc.name === 'Bank');

    // Test YYYY/MM/DD format
    const result = await databaseService.createJournalEntry({
      date: '2025/10/26',
      description: 'Test transaction with YYYY/MM/DD format',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 100,
    });

    expect(result.skipped).toBe(false);
    expect(result.entry).toBeDefined();
    expect(result.entry?.date).toBe('2025-10-26');
  });

  it('should skip transactions with invalid date formats', async () => {
    const accounts = await databaseService.getAccounts();
    const cashAccount = accounts.find(acc => acc.name === 'Cash');
    const bankAccount = accounts.find(acc => acc.name === 'Bank');

    // Test invalid date
    const result = await databaseService.createJournalEntry({
      date: 'invalid-date',
      description: 'Test transaction with invalid date',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 100,
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('Invalid date format');
  });

  it('should skip transactions with invalid dates (e.g., Feb 30)', async () => {
    const accounts = await databaseService.getAccounts();
    const cashAccount = accounts.find(acc => acc.name === 'Cash');
    const bankAccount = accounts.find(acc => acc.name === 'Bank');

    // Test invalid date (Feb 30)
    const result = await databaseService.createJournalEntry({
      date: '2025-02-30',
      description: 'Test transaction with invalid date',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 100,
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('Invalid date format');
  });

  it('should import transactions with posting date in various formats', async () => {
    const accounts = await databaseService.getAccounts();
    const cashAccount = accounts.find(acc => acc.name === 'Cash');
    const bankAccount = accounts.find(acc => acc.name === 'Bank');

    // Test with YYYYMMDD posting date format
    const result = await databaseService.createJournalEntry({
      date: '2025-10-26',
      postingDate: '20251027',
      description: 'Test transaction with posting date',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 100,
    });

    expect(result.skipped).toBe(false);
    expect(result.entry).toBeDefined();
    expect(result.entry?.date).toBe('2025-10-26');
    expect(result.entry?.postingDate).toBe('2025-10-27');
  });

  it('should skip transactions where posting date is before transaction date', async () => {
    const accounts = await databaseService.getAccounts();
    const cashAccount = accounts.find(acc => acc.name === 'Cash');
    const bankAccount = accounts.find(acc => acc.name === 'Bank');

    // Test with posting date before transaction date
    const result = await databaseService.createJournalEntry({
      date: '2025-10-26',
      postingDate: '2025-10-25',
      description: 'Test transaction with invalid posting date',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 100,
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('Posting date cannot be before transaction date');
  });

  it('should allow empty posting date', async () => {
    const accounts = await databaseService.getAccounts();
    const cashAccount = accounts.find(acc => acc.name === 'Cash');
    const bankAccount = accounts.find(acc => acc.name === 'Bank');

    // Test with no posting date
    const result = await databaseService.createJournalEntry({
      date: '2025-10-26',
      description: 'Test transaction without posting date',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 100,
    });

    expect(result.skipped).toBe(false);
    expect(result.entry).toBeDefined();
    expect(result.entry?.postingDate).toBeNull();
  });

  it('should use user account currency when transacting with category accounts', async () => {
    // Create a CAD user account
    const cadAccount = await databaseService.createAccount({
      name: 'CAD Credit Card',
      type: 'user',
      subtype: 'liability',
      currency: 'CAD',
    });

    // Get the default USD category account
    const accounts = await databaseService.getAccounts();
    const uncategorizedExpense = accounts.find(
      acc => acc.name === 'Uncategorized Expense' && acc.type === 'category'
    );

    expect(uncategorizedExpense).toBeDefined();
    expect(uncategorizedExpense?.currency).toBe('USD'); // Default category is USD

    // Create a transaction from USD category to CAD user account
    // This simulates an import where the category account becomes fromAccount
    const result = await databaseService.createJournalEntry({
      date: '2025-11-09',
      description: 'Test transaction with category',
      fromAccountId: uncategorizedExpense!.id,
      toAccountId: cadAccount.id,
      amount: 100,
    });

    expect(result.skipped).toBe(false);
    expect(result.entry).toBeDefined();
    
    // Both journal lines should use CAD (the user account's currency), not USD
    const lines = result.entry?.lines;
    expect(lines).toHaveLength(2);
    expect(lines?.[0].currency).toBe('CAD');
    expect(lines?.[1].currency).toBe('CAD');
  });

  it('should flag strict duplicates and allow explicit import', async () => {
    const accounts = await databaseService.getAccounts();
    const cashAccount = accounts.find(acc => acc.name === 'Cash');
    const bankAccount = accounts.find(acc => acc.name === 'Bank');

    expect(cashAccount).toBeDefined();
    expect(bankAccount).toBeDefined();

    const first = await databaseService.createJournalEntry({
      date: '2025-10-26',
      description: 'Duplicate test',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 100,
    });

    expect(first.skipped).toBe(false);

    const second = await databaseService.createJournalEntry({
      date: '2025-10-26',
      description: 'Duplicate test',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 100,
    });

    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('potential_duplicate');

    const third = await databaseService.createJournalEntry({
      date: '2025-10-26',
      description: 'Duplicate test',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 100,
      forceDuplicate: true,
    });

    expect(third.skipped).toBe(false);
    expect(third.entry).toBeDefined();
  });

  it('should allow non-exact matches during import', async () => {
    const accounts = await databaseService.getAccounts();
    const cashAccount = accounts.find(acc => acc.name === 'Cash');
    const bankAccount = accounts.find(acc => acc.name === 'Bank');

    expect(cashAccount).toBeDefined();
    expect(bankAccount).toBeDefined();

    const first = await databaseService.createJournalEntry({
      date: '2025-10-26',
      description: 'Duplicate test',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 100,
    });

    expect(first.skipped).toBe(false);

    const second = await databaseService.createJournalEntry({
      date: '2025-10-26',
      description: 'Duplicate test',
      fromAccountId: cashAccount!.id,
      toAccountId: bankAccount!.id,
      amount: 101,
    });

    expect(second.skipped).toBe(false);
    expect(second.entry).toBeDefined();
  });
});
