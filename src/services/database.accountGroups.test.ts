/**
 * Property-Based Tests for Account Group Database Operations
 * 
 * These tests verify that the account group CRUD operations correctly implement
 * the requirements specified in the account-grouping feature design.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { databaseService } from './database';
import { AccountType } from '../shared/accountTypes';

// Helper to clean up test data
async function cleanupTestGroups() {
  const groups = await databaseService.getAccountGroups();
  for (const group of groups) {
    try {
      await databaseService.deleteAccountGroup(group.id);
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
}

// Skip these tests by default since they touch the real database
// Run with: npm test -- --run database.accountGroups.test.ts
describe.skip('Account Group Database Operations - Property-Based Tests', () => {
  beforeEach(async () => {
    await cleanupTestGroups();
  });

  afterEach(async () => {
    await cleanupTestGroups();
  });

  /**
   * Feature: account-grouping, Property 1: Group creation persistence
   * 
   * For any valid group name and account type, creating a group then querying the database
   * should return a group with the same name and account type.
   * 
   * Validates: Requirements 1.1, 1.2, 1.4
   */
  it('Property 1: Group creation persistence', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random group names (1-50 characters, alphanumeric with spaces)
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate account type (user or category)
        fc.constantFrom(AccountType.User, AccountType.Category),
        async (groupName, accountType) => {
          // Create the group
          const createdGroup = await databaseService.createAccountGroup({
            name: groupName.trim(),
            accountType,
          });

          // Query the database for the created group
          const retrievedGroup = await databaseService.getAccountGroupById(createdGroup.id);

          // Property: retrieved group should match created group
          expect(retrievedGroup).not.toBeNull();
          expect(retrievedGroup!.name).toBe(groupName.trim());
          expect(retrievedGroup!.accountType).toBe(accountType);
          expect(retrievedGroup!.id).toBe(createdGroup.id);

          // Cleanup
          await databaseService.deleteAccountGroup(createdGroup.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: account-grouping, Property 2: Duplicate group name prevention
   * 
   * For any existing group with a given name and account type, attempting to create
   * another group with the same name and account type should fail with an error.
   * 
   * Validates: Requirements 1.3
   */
  it('Property 2: Duplicate group name prevention', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random group name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate account type
        fc.constantFrom(AccountType.User, AccountType.Category),
        async (groupName, accountType) => {
          // Create the first group
          const firstGroup = await databaseService.createAccountGroup({
            name: groupName.trim(),
            accountType,
          });

          // Attempt to create a duplicate group
          let errorThrown = false;
          try {
            await databaseService.createAccountGroup({
              name: groupName.trim(),
              accountType,
            });
          } catch (error: any) {
            errorThrown = true;
            // Property: error message should indicate duplicate
            expect(error.message).toContain('already exists');
          }

          // Property: duplicate creation should fail
          expect(errorThrown).toBe(true);

          // Cleanup
          await databaseService.deleteAccountGroup(firstGroup.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: account-grouping, Property 17: New group default ordering
   * 
   * For any existing set of groups, creating a new group should result in the new group
   * having a displayOrder value greater than all existing groups of the same account type.
   * 
   * Validates: Requirements 9.5
   */
  it('Property 17: New group default ordering', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-5 existing groups
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            accountType: fc.constantFrom(AccountType.User, AccountType.Category),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        // Generate new group to add
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          accountType: fc.constantFrom(AccountType.User, AccountType.Category),
        }),
        async (existingGroupsData, newGroupData) => {
          // Create existing groups
          const existingGroups = [];
          for (const groupData of existingGroupsData) {
            try {
              const group = await databaseService.createAccountGroup({
                name: `${groupData.name.trim()}-${Date.now()}-${Math.random()}`,
                accountType: groupData.accountType,
              });
              existingGroups.push(group);
            } catch (e) {
              // Skip duplicates
            }
          }

          // Find max displayOrder for the new group's account type
          const sameTypeGroups = existingGroups.filter(
            g => g.accountType === newGroupData.accountType
          );
          const maxDisplayOrder = sameTypeGroups.length > 0
            ? Math.max(...sameTypeGroups.map(g => g.displayOrder))
            : -1;

          // Create new group
          const newGroup = await databaseService.createAccountGroup({
            name: `${newGroupData.name.trim()}-${Date.now()}-${Math.random()}`,
            accountType: newGroupData.accountType,
          });

          // Property: new group should have displayOrder greater than all existing groups of same type
          expect(newGroup.displayOrder).toBeGreaterThan(maxDisplayOrder);

          // Cleanup
          for (const group of [...existingGroups, newGroup]) {
            try {
              await databaseService.deleteAccountGroup(group.id);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Feature: account-grouping, Property 8: Group rename persistence
   * 
   * For any group and new name (that doesn't conflict with existing groups),
   * renaming the group then querying should return the group with the new name.
   * 
   * Validates: Requirements 4.1, 4.3
   */
  it('Property 8: Group rename persistence', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate original group name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate new group name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate account type
        fc.constantFrom(AccountType.User, AccountType.Category),
        async (originalName, newName, accountType) => {
          // Ensure names are different
          if (originalName.trim() === newName.trim()) {
            return; // Skip this test case
          }

          // Create the group
          const createdGroup = await databaseService.createAccountGroup({
            name: `${originalName.trim()}-${Date.now()}`,
            accountType,
          });

          // Rename the group
          const updatedGroup = await databaseService.updateAccountGroup(
            createdGroup.id,
            { name: `${newName.trim()}-${Date.now()}` }
          );

          // Query the database for the updated group
          const retrievedGroup = await databaseService.getAccountGroupById(createdGroup.id);

          // Property: retrieved group should have the new name
          expect(retrievedGroup).not.toBeNull();
          expect(retrievedGroup!.name).toBe(updatedGroup.name);
          expect(retrievedGroup!.id).toBe(createdGroup.id);

          // Cleanup
          await databaseService.deleteAccountGroup(createdGroup.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: account-grouping, Property 9: Duplicate group name prevention on rename
   * 
   * For any group A and existing group B with the same account type, attempting to
   * rename group A to group B's name should fail with an error.
   * 
   * Validates: Requirements 4.2
   */
  it('Property 9: Duplicate group name prevention on rename', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate two different group names
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate account type
        fc.constantFrom(AccountType.User, AccountType.Category),
        async (nameA, nameB, accountType) => {
          // Ensure names are different
          if (nameA.trim() === nameB.trim()) {
            return; // Skip this test case
          }

          // Create both groups with unique names
          const groupA = await databaseService.createAccountGroup({
            name: `${nameA.trim()}-${Date.now()}-A`,
            accountType,
          });

          const groupB = await databaseService.createAccountGroup({
            name: `${nameB.trim()}-${Date.now()}-B`,
            accountType,
          });

          // Attempt to rename groupA to groupB's name
          let errorThrown = false;
          try {
            await databaseService.updateAccountGroup(groupA.id, {
              name: groupB.name,
            });
          } catch (error: any) {
            errorThrown = true;
            // Property: error message should indicate duplicate
            expect(error.message).toContain('already exists');
          }

          // Property: rename to duplicate name should fail
          expect(errorThrown).toBe(true);

          // Cleanup
          await databaseService.deleteAccountGroup(groupA.id);
          await databaseService.deleteAccountGroup(groupB.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: account-grouping, Property 10: Empty group deletion
   * 
   * For any group with no accounts, deleting the group then querying for it should return null.
   * 
   * Validates: Requirements 5.2
   */
  it('Property 10: Empty group deletion', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random group name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate account type
        fc.constantFrom(AccountType.User, AccountType.Category),
        async (groupName, accountType) => {
          // Create the group
          const createdGroup = await databaseService.createAccountGroup({
            name: `${groupName.trim()}-${Date.now()}`,
            accountType,
          });

          // Verify group has no accounts
          const groupWithAccounts = await databaseService.getAccountGroupById(createdGroup.id);
          expect(groupWithAccounts!.accounts).toHaveLength(0);

          // Delete the group
          await databaseService.deleteAccountGroup(createdGroup.id);

          // Query for the deleted group
          const deletedGroup = await databaseService.getAccountGroupById(createdGroup.id);

          // Property: deleted group should not be found
          expect(deletedGroup).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: account-grouping, Property 11: Group deletion orphans accounts
   * 
   * For any group containing accounts, deleting the group should result in all those
   * accounts having groupId set to null.
   * 
   * Validates: Requirements 5.3
   */
  it('Property 11: Group deletion orphans accounts', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random group name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate 1-5 accounts to add to the group
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (groupName, accountsData) => {
          // Create the group
          const createdGroup = await databaseService.createAccountGroup({
            name: `${groupName.trim()}-${Date.now()}`,
            accountType: AccountType.User,
          });

          // Create accounts and add them to the group
          const accountIds = [];
          for (const accountData of accountsData) {
            const account = await databaseService.createAccount({
              name: `${accountData.name.trim()}-${Date.now()}-${Math.random()}`,
              type: AccountType.User,
            });
            
            // Update account to be in the group
            await databaseService.updateAccount(account.id, { name: account.name });
            // Manually set groupId using Prisma (since we haven't implemented addAccountToGroup yet)
            await databaseService['prisma'].account.update({
              where: { id: account.id },
              data: { groupId: createdGroup.id },
            });
            
            accountIds.push(account.id);
          }

          // Verify accounts are in the group
          for (const accountId of accountIds) {
            const account = await databaseService.getAccount(accountId);
            expect(account!.groupId).toBe(createdGroup.id);
          }

          // Delete the group
          await databaseService.deleteAccountGroup(createdGroup.id);

          // Property: all accounts should now have groupId set to null
          for (const accountId of accountIds) {
            const account = await databaseService.getAccount(accountId);
            expect(account!.groupId).toBeNull();
          }

          // Cleanup accounts
          for (const accountId of accountIds) {
            try {
              await databaseService.deleteAccount(accountId);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Feature: account-grouping, Property 12: Account preservation on group deletion
   * 
   * For any group, the count of accounts before and after deleting the group should
   * remain the same (accounts are not deleted, only orphaned).
   * 
   * Validates: Requirements 5.5
   */
  it('Property 12: Account preservation on group deletion', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random group name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate 1-5 accounts to add to the group
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (groupName, accountsData) => {
          // Create the group
          const createdGroup = await databaseService.createAccountGroup({
            name: `${groupName.trim()}-${Date.now()}`,
            accountType: AccountType.User,
          });

          // Create accounts and add them to the group
          const accountIds = [];
          for (const accountData of accountsData) {
            const account = await databaseService.createAccount({
              name: `${accountData.name.trim()}-${Date.now()}-${Math.random()}`,
              type: AccountType.User,
            });
            
            // Manually set groupId using Prisma
            await databaseService['prisma'].account.update({
              where: { id: account.id },
              data: { groupId: createdGroup.id },
            });
            
            accountIds.push(account.id);
          }

          // Count accounts before deletion
          const accountsBeforeDeletion = await databaseService.getAccounts();
          const countBefore = accountsBeforeDeletion.length;

          // Delete the group
          await databaseService.deleteAccountGroup(createdGroup.id);

          // Count accounts after deletion
          const accountsAfterDeletion = await databaseService.getAccounts();
          const countAfter = accountsAfterDeletion.length;

          // Property: account count should remain the same
          expect(countAfter).toBe(countBefore);

          // Verify all our test accounts still exist
          for (const accountId of accountIds) {
            const account = await databaseService.getAccount(accountId);
            expect(account).not.toBeNull();
          }

          // Cleanup accounts
          for (const accountId of accountIds) {
            try {
              await databaseService.deleteAccount(accountId);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Feature: account-grouping, Property 3: Account type matching validation
   * 
   * For any account and group, attempting to add an account to a group with a
   * mismatched account type should fail with an error.
   * 
   * Validates: Requirements 2.1
   */
  it('Property 3: Account type matching validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random account name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate random group name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate account type
        fc.constantFrom(AccountType.User, AccountType.Category),
        async (accountName, groupName, accountType) => {
          // Determine mismatched type
          const mismatchedType = accountType === AccountType.User 
            ? AccountType.Category 
            : AccountType.User;

          // Create account with one type
          const account = await databaseService.createAccount({
            name: `${accountName.trim()}-${Date.now()}`,
            type: accountType,
          });

          // Create group with different type
          const group = await databaseService.createAccountGroup({
            name: `${groupName.trim()}-${Date.now()}`,
            accountType: mismatchedType,
          });

          // Attempt to add account to group with mismatched type
          let errorThrown = false;
          try {
            await databaseService.addAccountToGroup(account.id, group.id);
          } catch (error: any) {
            errorThrown = true;
            // Property: error message should indicate type mismatch
            expect(error.message).toContain('does not match');
          }

          // Property: adding account to mismatched group should fail
          expect(errorThrown).toBe(true);

          // Cleanup
          await databaseService.deleteAccount(account.id);
          await databaseService.deleteAccountGroup(group.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: account-grouping, Property 4: Account group assignment persistence
   * 
   * For any account and group with matching types, adding the account to the group
   * then querying the account should show the account's groupId equals the group's id.
   * 
   * Validates: Requirements 2.2
   */
  it('Property 4: Account group assignment persistence', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random account name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate random group name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate account type
        fc.constantFrom(AccountType.User, AccountType.Category),
        async (accountName, groupName, accountType) => {
          // Create account
          const account = await databaseService.createAccount({
            name: `${accountName.trim()}-${Date.now()}`,
            type: accountType,
          });

          // Create group with matching type
          const group = await databaseService.createAccountGroup({
            name: `${groupName.trim()}-${Date.now()}`,
            accountType: accountType,
          });

          // Add account to group
          await databaseService.addAccountToGroup(account.id, group.id);

          // Query the account
          const retrievedAccount = await databaseService.getAccount(account.id);

          // Property: account's groupId should equal the group's id
          expect(retrievedAccount).not.toBeNull();
          expect(retrievedAccount!.groupId).toBe(group.id);

          // Cleanup
          await databaseService.deleteAccount(account.id);
          await databaseService.deleteAccountGroup(group.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: account-grouping, Property 5: Account group reassignment
   * 
   * For any account currently in group A, adding it to group B should result in
   * the account having groupId equal to B's id and group A no longer containing the account.
   * 
   * Validates: Requirements 2.3
   */
  it('Property 5: Account group reassignment', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random account name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate random group names
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate account type
        fc.constantFrom(AccountType.User, AccountType.Category),
        async (accountName, groupNameA, groupNameB, accountType) => {
          // Create account
          const account = await databaseService.createAccount({
            name: `${accountName.trim()}-${Date.now()}`,
            type: accountType,
          });

          // Create two groups with matching type
          const groupA = await databaseService.createAccountGroup({
            name: `${groupNameA.trim()}-${Date.now()}-A`,
            accountType: accountType,
          });

          const groupB = await databaseService.createAccountGroup({
            name: `${groupNameB.trim()}-${Date.now()}-B`,
            accountType: accountType,
          });

          // Add account to group A
          await databaseService.addAccountToGroup(account.id, groupA.id);

          // Verify account is in group A
          const accountInGroupA = await databaseService.getAccount(account.id);
          expect(accountInGroupA!.groupId).toBe(groupA.id);

          // Add account to group B (reassignment)
          await databaseService.addAccountToGroup(account.id, groupB.id);

          // Query the account
          const retrievedAccount = await databaseService.getAccount(account.id);

          // Property: account's groupId should now equal group B's id
          expect(retrievedAccount).not.toBeNull();
          expect(retrievedAccount!.groupId).toBe(groupB.id);

          // Query group A to verify it no longer contains the account
          const groupAWithAccounts = await databaseService.getAccountGroupById(groupA.id);
          const accountInGroupAList = groupAWithAccounts!.accounts.find(a => a.id === account.id);
          expect(accountInGroupAList).toBeUndefined();

          // Cleanup
          await databaseService.deleteAccount(account.id);
          await databaseService.deleteAccountGroup(groupA.id);
          await databaseService.deleteAccountGroup(groupB.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: account-grouping, Property 6: Account removal from group
   * 
   * For any account in a group, removing it from the group then querying the account
   * should show the account's groupId is null.
   * 
   * Validates: Requirements 3.1
   */
  it('Property 6: Account removal from group', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random account name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate random group name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate account type
        fc.constantFrom(AccountType.User, AccountType.Category),
        async (accountName, groupName, accountType) => {
          // Create account
          const account = await databaseService.createAccount({
            name: `${accountName.trim()}-${Date.now()}`,
            type: accountType,
          });

          // Create group with matching type
          const group = await databaseService.createAccountGroup({
            name: `${groupName.trim()}-${Date.now()}`,
            accountType: accountType,
          });

          // Add account to group
          await databaseService.addAccountToGroup(account.id, group.id);

          // Verify account is in group
          const accountInGroup = await databaseService.getAccount(account.id);
          expect(accountInGroup!.groupId).toBe(group.id);

          // Remove account from group
          await databaseService.removeAccountFromGroup(account.id);

          // Query the account
          const retrievedAccount = await databaseService.getAccount(account.id);

          // Property: account's groupId should be null
          expect(retrievedAccount).not.toBeNull();
          expect(retrievedAccount!.groupId).toBeNull();

          // Cleanup
          await databaseService.deleteAccount(account.id);
          await databaseService.deleteAccountGroup(group.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: account-grouping, Property 7: Transaction preservation on group operations
   * 
   * For any account with transactions, the count of transactions before and after
   * any group operation (add, remove, delete group) should remain the same.
   * 
   * Validates: Requirements 3.3, 5.5
   */
  it('Property 7: Transaction preservation on group operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random account names
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate random group name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate 1-3 transactions
        fc.array(
          fc.record({
            amount: fc.integer({ min: 1, max: 1000 }),
            description: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (accountName1, accountName2, groupName, transactionsData) => {
          // Create two accounts (for transactions)
          const account1 = await databaseService.createAccount({
            name: `${accountName1.trim()}-${Date.now()}`,
            type: AccountType.User,
          });

          const account2 = await databaseService.createAccount({
            name: `${accountName2.trim()}-${Date.now()}-${Math.random()}`,
            type: AccountType.User,
          });

          // Create group
          const group = await databaseService.createAccountGroup({
            name: `${groupName.trim()}-${Date.now()}`,
            accountType: AccountType.User,
          });

          // Create transactions for account1
          for (const txData of transactionsData) {
            await databaseService.createJournalEntry({
              date: new Date().toISOString().slice(0, 10),
              description: txData.description,
              fromAccountId: account1.id,
              toAccountId: account2.id,
              amount: txData.amount,
              transactionType: 'transfer',
            });
          }

          // Count transactions before group operations
          const transactionsBefore = await databaseService.getJournalEntriesForAccount(account1.id);
          const countBefore = transactionsBefore.length;

          // Perform group operations: add to group
          await databaseService.addAccountToGroup(account1.id, group.id);

          // Count transactions after adding to group
          const transactionsAfterAdd = await databaseService.getJournalEntriesForAccount(account1.id);
          expect(transactionsAfterAdd.length).toBe(countBefore);

          // Remove from group
          await databaseService.removeAccountFromGroup(account1.id);

          // Count transactions after removing from group
          const transactionsAfterRemove = await databaseService.getJournalEntriesForAccount(account1.id);
          expect(transactionsAfterRemove.length).toBe(countBefore);

          // Add back to group and delete the group
          await databaseService.addAccountToGroup(account1.id, group.id);
          await databaseService.deleteAccountGroup(group.id);

          // Count transactions after deleting group
          const transactionsAfterDeleteGroup = await databaseService.getJournalEntriesForAccount(account1.id);

          // Property: transaction count should remain the same throughout all operations
          expect(transactionsAfterDeleteGroup.length).toBe(countBefore);

          // Cleanup - archive accounts instead of deleting since they have transactions
          try {
            await databaseService.archiveAccount(account1.id);
            await databaseService.archiveAccount(account2.id);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Feature: account-grouping, Property 13: Aggregate balance calculation
   * 
   * For any group containing accounts, the calculated aggregate balance should equal
   * the sum of all account balances within the group.
   * 
   * Validates: Requirements 7.1, 7.3
   */
  it('Property 13: Aggregate balance calculation', { timeout: 15000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random group name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate 1-5 accounts with balances
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            balance: fc.integer({ min: -10000, max: 10000 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (groupName, accountsData) => {
          // Create the group
          const group = await databaseService.createAccountGroup({
            name: `${groupName.trim()}-${Date.now()}`,
            accountType: AccountType.User,
          });

          // Create accounts and set their balances
          const accountIds: string[] = [];
          let expectedSum = 0;

          for (const accountData of accountsData) {
            // Create account
            const account = await databaseService.createAccount({
              name: `${accountData.name.trim()}-${Date.now()}-${Math.random()}`,
              type: AccountType.User,
              currency: 'USD', // Single currency for this test
            });

            // Add account to group
            await databaseService.addAccountToGroup(account.id, group.id);

            // Set balance by creating a transaction if balance is non-zero
            if (accountData.balance !== 0) {
              // Create a system account for the transaction
              const systemAccount = await databaseService.createAccount({
                name: `System-${Date.now()}-${Math.random()}`,
                type: AccountType.User,
                currency: 'USD',
              });

              await databaseService.createJournalEntry({
                date: new Date().toISOString().slice(0, 10),
                description: 'Initial balance',
                fromAccountId: accountData.balance > 0 ? systemAccount.id : account.id,
                toAccountId: accountData.balance > 0 ? account.id : systemAccount.id,
                amount: Math.abs(accountData.balance),
                transactionType: 'transfer',
              });

              // Archive system account
              await databaseService.archiveAccount(systemAccount.id);
            }

            accountIds.push(account.id);
            expectedSum += accountData.balance;
          }

          // Round expected sum to 2 decimal places
          expectedSum = Math.round(expectedSum * 100) / 100;

          // Get aggregate balance
          const aggregateBalance = await databaseService.getGroupAggregateBalance(group.id);

          // Property: aggregate balance should equal sum of account balances
          expect(aggregateBalance).toBe(expectedSum);

          // Cleanup
          for (const accountId of accountIds) {
            try {
              await databaseService.archiveAccount(accountId);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
          await databaseService.deleteAccountGroup(group.id);
        }
      ),
      { numRuns: 10 } // Reduced runs due to transaction overhead
    );
  });

  /**
   * Feature: account-grouping, Property 14: Multi-currency aggregate balance calculation
   * 
   * For any group containing accounts with multiple currencies, the calculated aggregate
   * balances should contain a separate total for each currency, where each currency total
   * equals the sum of account balances in that currency.
   * 
   * Validates: Requirements 7.2, 7.4
   */
  it('Property 14: Multi-currency aggregate balance calculation', { timeout: 20000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random group name
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // Generate 2-5 accounts with different currencies and balances
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            currency: fc.constantFrom('USD', 'EUR', 'GBP'),
            balance: fc.integer({ min: -10000, max: 10000 }),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (groupName, accountsData) => {
          // Ensure we have at least 2 different currencies
          const currencies = new Set(accountsData.map(a => a.currency));
          if (currencies.size < 2) {
            return; // Skip this test case
          }

          // Create the group
          const group = await databaseService.createAccountGroup({
            name: `${groupName.trim()}-${Date.now()}`,
            accountType: AccountType.User,
          });

          // Create accounts and set their balances
          const accountIds: string[] = [];
          const expectedBalances: Record<string, number> = {};

          for (const accountData of accountsData) {
            // Create account
            const account = await databaseService.createAccount({
              name: `${accountData.name.trim()}-${Date.now()}-${Math.random()}`,
              type: AccountType.User,
              currency: accountData.currency,
            });

            // Add account to group
            await databaseService.addAccountToGroup(account.id, group.id);

            // Set balance by creating a transaction if balance is non-zero
            if (accountData.balance !== 0) {
              // Create a system account for the transaction
              const systemAccount = await databaseService.createAccount({
                name: `System-${Date.now()}-${Math.random()}`,
                type: AccountType.User,
                currency: accountData.currency,
              });

              await databaseService.createJournalEntry({
                date: new Date().toISOString().slice(0, 10),
                description: 'Initial balance',
                fromAccountId: accountData.balance > 0 ? systemAccount.id : account.id,
                toAccountId: accountData.balance > 0 ? account.id : systemAccount.id,
                amount: Math.abs(accountData.balance),
                transactionType: 'transfer',
              });

              // Archive system account
              await databaseService.archiveAccount(systemAccount.id);
            }

            accountIds.push(account.id);
            
            // Track expected balance per currency
            expectedBalances[accountData.currency] = 
              (expectedBalances[accountData.currency] || 0) + accountData.balance;
          }

          // Round expected balances to 2 decimal places
          for (const currency in expectedBalances) {
            expectedBalances[currency] = Math.round(expectedBalances[currency] * 100) / 100;
          }

          // Get aggregate balance
          const aggregateBalance = await databaseService.getGroupAggregateBalance(group.id);

          // Property: aggregate balance should be a Record<currency, sum>
          expect(typeof aggregateBalance).toBe('object');
          expect(aggregateBalance).not.toBeNull();

          // Property: each currency should have the correct sum
          for (const currency in expectedBalances) {
            expect((aggregateBalance as Record<string, number>)[currency]).toBe(
              expectedBalances[currency]
            );
          }

          // Property: no extra currencies should be present
          const actualCurrencies = Object.keys(aggregateBalance as Record<string, number>);
          const expectedCurrencies = Object.keys(expectedBalances);
          expect(actualCurrencies.sort()).toEqual(expectedCurrencies.sort());

          // Cleanup
          for (const accountId of accountIds) {
            try {
              await databaseService.archiveAccount(accountId);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
          await databaseService.deleteAccountGroup(group.id);
        }
      ),
      { numRuns: 10 } // Reduced runs due to transaction overhead
    );
  });

  /**
   * Feature: account-grouping, Property 16: Group order persistence
   * 
   * For any set of groups and new ordering (array of displayOrder values), setting the
   * order then querying the groups should return them in the specified order.
   * 
   * Validates: Requirements 9.1, 9.2, 9.3, 9.4
   */
  it('Property 16: Group order persistence', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 2-5 groups
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        // Generate account type
        fc.constantFrom(AccountType.User, AccountType.Category),
        async (groupsData, accountType) => {
          // Create groups
          const createdGroups: any[] = [];
          for (const groupData of groupsData) {
            const group = await databaseService.createAccountGroup({
              name: `${groupData.name.trim()}-${Date.now()}-${Math.random()}`,
              accountType,
            });
            createdGroups.push(group);
          }

          // Generate new random ordering
          const newOrdering = createdGroups.map((group, index) => ({
            id: group.id,
            displayOrder: index * 10, // Use multiples of 10 for clear ordering
          }));

          // Shuffle the ordering to make it different from current
          const shuffledOrdering = [...newOrdering].sort(() => Math.random() - 0.5);

          // Apply the new ordering
          await databaseService.reorderAccountGroups(shuffledOrdering);

          // Query the groups
          const retrievedGroups = await databaseService.getAccountGroups(accountType);

          // Filter to only our test groups
          const ourGroups = retrievedGroups.filter(g => 
            createdGroups.some(cg => cg.id === g.id)
          );

          // Property: groups should be ordered by displayOrder
          for (let i = 0; i < ourGroups.length - 1; i++) {
            expect(ourGroups[i].displayOrder).toBeLessThanOrEqual(ourGroups[i + 1].displayOrder);
          }

          // Property: each group should have the displayOrder we set
          for (const group of ourGroups) {
            const expectedOrder = shuffledOrdering.find(o => o.id === group.id);
            expect(group.displayOrder).toBe(expectedOrder!.displayOrder);
          }

          // Cleanup
          for (const group of createdGroups) {
            try {
              await databaseService.deleteAccountGroup(group.id);
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
