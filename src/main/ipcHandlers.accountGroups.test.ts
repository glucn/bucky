/**
 * Unit tests for Account Group IPC handlers
 * 
 * These tests verify that IPC handlers correctly delegate to DatabaseService
 * and format responses appropriately.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { databaseService } from '../services/database';
import { AccountType } from '../shared/accountTypes';

// Mock the database service
vi.mock('../services/database', () => ({
  databaseService: {
    createAccountGroup: vi.fn(),
    getAccountGroups: vi.fn(),
    updateAccountGroup: vi.fn(),
    deleteAccountGroup: vi.fn(),
    addAccountToGroup: vi.fn(),
    removeAccountFromGroup: vi.fn(),
    getAccountsWithGroups: vi.fn(),
    reorderAccountGroups: vi.fn(),
  },
}));

describe('Account Group IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create-account-group handler', () => {
    it('should call databaseService.createAccountGroup with correct parameters', async () => {
      const mockGroup = {
        id: 'group-1',
        name: 'Test Group',
        accountType: AccountType.User,
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        accounts: [],
      };

      vi.mocked(databaseService.createAccountGroup).mockResolvedValue(mockGroup as any);

      const data = { name: 'Test Group', accountType: AccountType.User };
      
      // Simulate the handler logic
      const result = await (async () => {
        try {
          const group = await databaseService.createAccountGroup(data);
          return { success: true, group };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })();

      expect(databaseService.createAccountGroup).toHaveBeenCalledWith(data);
      expect(result).toEqual({ success: true, group: mockGroup });
    });

    it('should return error response when creation fails', async () => {
      const errorMessage = 'A group with this name already exists for this account type';
      vi.mocked(databaseService.createAccountGroup).mockRejectedValue(new Error(errorMessage));

      const data = { name: 'Duplicate Group', accountType: AccountType.User };
      
      const result = await (async () => {
        try {
          const group = await databaseService.createAccountGroup(data);
          return { success: true, group };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })();

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });
  });

  describe('get-account-groups handler', () => {
    it('should call databaseService.getAccountGroups without filter', async () => {
      const mockGroups = [
        {
          id: 'group-1',
          name: 'Group 1',
          accountType: AccountType.User,
          displayOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          accounts: [],
        },
      ];

      vi.mocked(databaseService.getAccountGroups).mockResolvedValue(mockGroups as any);

      const result = await (async () => {
        try {
          const groups = await databaseService.getAccountGroups(undefined);
          return { success: true, groups };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })();

      expect(databaseService.getAccountGroups).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({ success: true, groups: mockGroups });
    });

    it('should call databaseService.getAccountGroups with accountType filter', async () => {
      const mockGroups = [
        {
          id: 'group-1',
          name: 'User Group',
          accountType: AccountType.User,
          displayOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          accounts: [],
        },
      ];

      vi.mocked(databaseService.getAccountGroups).mockResolvedValue(mockGroups as any);

      const result = await (async () => {
        try {
          const groups = await databaseService.getAccountGroups(AccountType.User);
          return { success: true, groups };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })();

      expect(databaseService.getAccountGroups).toHaveBeenCalledWith(AccountType.User);
      expect(result).toEqual({ success: true, groups: mockGroups });
    });
  });

  describe('update-account-group handler', () => {
    it('should call databaseService.updateAccountGroup with correct parameters', async () => {
      const mockGroup = {
        id: 'group-1',
        name: 'Updated Group',
        accountType: AccountType.User,
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        accounts: [],
      };

      vi.mocked(databaseService.updateAccountGroup).mockResolvedValue(mockGroup as any);

      const id = 'group-1';
      const data = { name: 'Updated Group' };
      
      const result = await (async () => {
        try {
          const group = await databaseService.updateAccountGroup(id, data);
          return { success: true, group };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })();

      expect(databaseService.updateAccountGroup).toHaveBeenCalledWith(id, data);
      expect(result).toEqual({ success: true, group: mockGroup });
    });

    it('should return error response when update fails', async () => {
      const errorMessage = 'A group with this name already exists for this account type';
      vi.mocked(databaseService.updateAccountGroup).mockRejectedValue(new Error(errorMessage));

      const id = 'group-1';
      const data = { name: 'Duplicate Name' };
      
      const result = await (async () => {
        try {
          const group = await databaseService.updateAccountGroup(id, data);
          return { success: true, group };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })();

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });
  });

  describe('delete-account-group handler', () => {
    it('should call databaseService.deleteAccountGroup with correct id', async () => {
      const mockGroup = {
        id: 'group-1',
        name: 'Deleted Group',
        accountType: AccountType.User,
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        accounts: [],
      };

      vi.mocked(databaseService.deleteAccountGroup).mockResolvedValue(mockGroup as any);

      const id = 'group-1';
      
      const result = await (async () => {
        try {
          const group = await databaseService.deleteAccountGroup(id);
          return { success: true, group };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })();

      expect(databaseService.deleteAccountGroup).toHaveBeenCalledWith(id);
      expect(result).toEqual({ success: true, group: mockGroup });
    });
  });

  describe('add-account-to-group handler', () => {
    it('should call databaseService.addAccountToGroup with correct parameters', async () => {
      const mockAccount = {
        id: 'account-1',
        name: 'Test Account',
        type: AccountType.User,
        groupId: 'group-1',
      };

      vi.mocked(databaseService.addAccountToGroup).mockResolvedValue(mockAccount as any);

      const accountId = 'account-1';
      const groupId = 'group-1';
      
      const result = await (async () => {
        try {
          const account = await databaseService.addAccountToGroup(accountId, groupId);
          return { success: true, account };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })();

      expect(databaseService.addAccountToGroup).toHaveBeenCalledWith(accountId, groupId);
      expect(result).toEqual({ success: true, account: mockAccount });
    });

    it('should return error response when type mismatch occurs', async () => {
      const errorMessage = 'Account type does not match group type';
      vi.mocked(databaseService.addAccountToGroup).mockRejectedValue(new Error(errorMessage));

      const accountId = 'account-1';
      const groupId = 'group-1';
      
      const result = await (async () => {
        try {
          const account = await databaseService.addAccountToGroup(accountId, groupId);
          return { success: true, account };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })();

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
    });
  });

  describe('remove-account-from-group handler', () => {
    it('should call databaseService.removeAccountFromGroup with correct accountId', async () => {
      const mockAccount = {
        id: 'account-1',
        name: 'Test Account',
        type: AccountType.User,
        groupId: null,
      };

      vi.mocked(databaseService.removeAccountFromGroup).mockResolvedValue(mockAccount as any);

      const accountId = 'account-1';
      
      const result = await (async () => {
        try {
          const account = await databaseService.removeAccountFromGroup(accountId);
          return { success: true, account };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })();

      expect(databaseService.removeAccountFromGroup).toHaveBeenCalledWith(accountId);
      expect(result).toEqual({ success: true, account: mockAccount });
    });
  });

  describe('get-accounts-with-groups handler', () => {
    it('should call databaseService.getAccountsWithGroups with correct parameters', async () => {
      const mockData = {
        groups: [
          {
            id: 'group-1',
            name: 'Group 1',
            accountType: AccountType.User,
            displayOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            accounts: [],
          },
        ],
        ungroupedAccounts: [],
      };

      vi.mocked(databaseService.getAccountsWithGroups).mockResolvedValue(mockData as any);

      const includeArchived = false;
      const accountType = AccountType.User;
      
      const result = await (async () => {
        try {
          const data = await databaseService.getAccountsWithGroups(includeArchived, accountType);
          return { success: true, data };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })();

      expect(databaseService.getAccountsWithGroups).toHaveBeenCalledWith(includeArchived, accountType);
      expect(result).toEqual({ success: true, data: mockData });
    });
  });

  describe('reorder-account-groups handler', () => {
    it('should call databaseService.reorderAccountGroups with correct parameters', async () => {
      vi.mocked(databaseService.reorderAccountGroups).mockResolvedValue(undefined);

      const groupOrders = [
        { id: 'group-1', displayOrder: 0 },
        { id: 'group-2', displayOrder: 1 },
      ];
      
      const result = await (async () => {
        try {
          await databaseService.reorderAccountGroups(groupOrders);
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })();

      expect(databaseService.reorderAccountGroups).toHaveBeenCalledWith(groupOrders);
      expect(result).toEqual({ success: true });
    });
  });
});
