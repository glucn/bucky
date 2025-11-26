import { describe, it, expect, beforeEach } from 'vitest';
import { databaseService } from './database';
import { resetTestDatabase } from './database.test.utils';
import { PrismaClient } from '@prisma/client';

describe('Transaction displayOrder', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    await resetTestDatabase();
    prisma = new PrismaClient();
  });

  it('should set displayOrder to Date.now() for new regular transactions', async () => {
    // Create test accounts
    const fromAccount = await prisma.account.create({
      data: {
        name: 'Test From Account',
        type: 'user',
        subtype: 'asset',
        currency: 'USD',
      },
    });

    const toAccount = await prisma.account.create({
      data: {
        name: 'Test To Account',
        type: 'user',
        subtype: 'asset',
        currency: 'USD',
      },
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
    const fromAccount = await prisma.account.create({
      data: {
        name: 'USD Account',
        type: 'user',
        subtype: 'asset',
        currency: 'USD',
      },
    });

    const toAccount = await prisma.account.create({
      data: {
        name: 'EUR Account',
        type: 'user',
        subtype: 'asset',
        currency: 'EUR',
      },
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
    const account = await prisma.account.create({
      data: {
        name: 'Test Account',
        type: 'user',
        subtype: 'asset',
        currency: 'USD',
      },
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

    // Verify the journal entry has displayOrder set
    const entries = await prisma.journalEntry.findMany({
      where: {
        description: 'Opening Balance',
      },
    });

    expect(entries.length).toBe(1);
    expect(entries[0].displayOrder).toBeDefined();
    expect(entries[0].displayOrder).toBeGreaterThanOrEqual(beforeCreate);
    expect(entries[0].displayOrder).toBeLessThanOrEqual(afterCreate);
  });
});
