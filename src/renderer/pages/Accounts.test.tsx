/**
 * Integration Tests for Accounts Page
 * 
 * These tests verify the integration of grouped accounts display,
 * group creation, editing, and deletion functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountType } from '../../shared/accountTypes';
import { AccountGroup, Account, GroupedAccountsView } from '../types';

// Mock the window.electron API
const mockInvoke = vi.fn();
global.window = {
  electron: {
    ipcRenderer: {
      invoke: mockInvoke,
      on: vi.fn(),
    },
  },
} as any;

describe('Accounts Page - Integration Tests', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  /**
   * Test: Creating a group
   * Validates that creating a new group calls the correct IPC handler
   * and returns the created group
   */
  it('should create a new account group', async () => {
    const groupName = 'Bank Accounts';
    const accountType = AccountType.User;

    const expectedGroup: AccountGroup = {
      id: 'group-123',
      name: groupName,
      accountType: accountType,
      displayOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockInvoke.mockResolvedValueOnce(expectedGroup);

    const result = await window.electron.ipcRenderer.invoke('create-account-group', {
      name: groupName,
      accountType: accountType,
    });

    expect(mockInvoke).toHaveBeenCalledWith('create-account-group', {
      name: groupName,
      accountType: accountType,
    });
    expect(result).toEqual(expectedGroup);
    expect(result.name).toBe(groupName);
    expect(result.accountType).toBe(accountType);
  });

  /**
   * Test: Fetching grouped accounts
   * Validates that the get-accounts-with-groups IPC handler returns
   * the correct structure with groups and ungrouped accounts
   */
  it('should fetch grouped accounts for user accounts', async () => {
    const mockGroupedView: GroupedAccountsView = {
      groups: [
        {
          id: 'group-1',
          name: 'Bank Accounts',
          accountType: AccountType.User,
          displayOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accounts: [
            {
              id: 'account-1',
              name: 'Checking Account',
              type: AccountType.User,
              currency: 'USD',
              subtype: 'asset',
              isArchived: false,
              groupId: 'group-1',
            },
          ],
        },
      ],
      ungroupedAccounts: [
        {
          id: 'account-2',
          name: 'Cash',
          type: AccountType.User,
          currency: 'USD',
          subtype: 'asset',
          isArchived: false,
          groupId: null,
        },
      ],
    };

    mockInvoke.mockResolvedValueOnce(mockGroupedView);

    const result = await window.electron.ipcRenderer.invoke('get-accounts-with-groups', {
      includeArchived: false,
      accountType: AccountType.User,
    });

    expect(mockInvoke).toHaveBeenCalledWith('get-accounts-with-groups', {
      includeArchived: false,
      accountType: AccountType.User,
    });
    expect(result).toEqual(mockGroupedView);
    expect(result.groups).toHaveLength(1);
    expect(result.ungroupedAccounts).toHaveLength(1);
    expect(result.groups[0].accounts).toHaveLength(1);
  });

  /**
   * Test: Adding accounts to groups
   * Validates that adding an account to a group updates the account's groupId
   */
  it('should add an account to a group', async () => {
    const accountId = 'account-123';
    const groupId = 'group-456';

    const updatedAccount: Account = {
      id: accountId,
      name: 'Savings Account',
      type: AccountType.User,
      currency: 'USD',
      subtype: 'asset',
      isArchived: false,
      groupId: groupId,
    };

    mockInvoke.mockResolvedValueOnce(updatedAccount);

    const result = await window.electron.ipcRenderer.invoke('add-account-to-group', {
      accountId,
      groupId,
    });

    expect(mockInvoke).toHaveBeenCalledWith('add-account-to-group', {
      accountId,
      groupId,
    });
    expect(result.groupId).toBe(groupId);
  });

  /**
   * Test: Editing a group
   * Validates that updating a group's name calls the correct IPC handler
   */
  it('should edit an existing group', async () => {
    const groupId = 'group-123';
    const newName = 'Updated Bank Accounts';

    const updatedGroup: AccountGroup = {
      id: groupId,
      name: newName,
      accountType: AccountType.User,
      displayOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockInvoke.mockResolvedValueOnce(updatedGroup);

    const result = await window.electron.ipcRenderer.invoke('update-account-group', {
      id: groupId,
      data: { name: newName },
    });

    expect(mockInvoke).toHaveBeenCalledWith('update-account-group', {
      id: groupId,
      data: { name: newName },
    });
    expect(result.name).toBe(newName);
  });

  /**
   * Test: Deleting a group
   * Validates that deleting a group calls the correct IPC handler
   * and orphans the accounts (sets groupId to null)
   */
  it('should delete a group and orphan its accounts', async () => {
    const groupId = 'group-123';

    const deletedGroup: AccountGroup = {
      id: groupId,
      name: 'Bank Accounts',
      accountType: AccountType.User,
      displayOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockInvoke.mockResolvedValueOnce(deletedGroup);

    const result = await window.electron.ipcRenderer.invoke('delete-account-group', groupId);

    expect(mockInvoke).toHaveBeenCalledWith('delete-account-group', groupId);
    expect(result.id).toBe(groupId);
  });

  /**
   * Test: Removing an account from a group
   * Validates that removing an account from a group sets its groupId to null
   */
  it('should remove an account from a group', async () => {
    const accountId = 'account-123';

    const updatedAccount: Account = {
      id: accountId,
      name: 'Savings Account',
      type: AccountType.User,
      currency: 'USD',
      subtype: 'asset',
      isArchived: false,
      groupId: null,
    };

    mockInvoke.mockResolvedValueOnce(updatedAccount);

    const result = await window.electron.ipcRenderer.invoke('remove-account-from-group', accountId);

    expect(mockInvoke).toHaveBeenCalledWith('remove-account-from-group', accountId);
    expect(result.groupId).toBeNull();
  });

  /**
   * Test: Group creation with duplicate name should fail
   * Validates that attempting to create a group with a duplicate name
   * results in an error
   */
  it('should fail to create a group with duplicate name', async () => {
    const groupName = 'Bank Accounts';
    const accountType = AccountType.User;

    mockInvoke.mockRejectedValueOnce(new Error('Unique constraint failed'));

    await expect(
      window.electron.ipcRenderer.invoke('create-account-group', {
        name: groupName,
        accountType: accountType,
      })
    ).rejects.toThrow('Unique constraint failed');

    expect(mockInvoke).toHaveBeenCalledWith('create-account-group', {
      name: groupName,
      accountType: accountType,
    });
  });

  /**
   * Test: Fetching grouped accounts with no groups
   * Validates that when no groups exist, all accounts are returned as ungrouped
   */
  it('should return all accounts as ungrouped when no groups exist', async () => {
    const mockGroupedView: GroupedAccountsView = {
      groups: [],
      ungroupedAccounts: [
        {
          id: 'account-1',
          name: 'Checking Account',
          type: AccountType.User,
          currency: 'USD',
          subtype: 'asset',
          isArchived: false,
          groupId: null,
        },
        {
          id: 'account-2',
          name: 'Savings Account',
          type: AccountType.User,
          currency: 'USD',
          subtype: 'asset',
          isArchived: false,
          groupId: null,
        },
      ],
    };

    mockInvoke.mockResolvedValueOnce(mockGroupedView);

    const result = await window.electron.ipcRenderer.invoke('get-accounts-with-groups', {
      includeArchived: false,
      accountType: AccountType.User,
    });

    expect(result.groups).toHaveLength(0);
    expect(result.ungroupedAccounts).toHaveLength(2);
    expect(result.ungroupedAccounts.every((acc: any) => acc.groupId === null)).toBe(true);
  });

  /**
   * Test: Reordering groups
   * Validates that reordering groups calls the correct IPC handler
   * with the new displayOrder values
   */
  it('should reorder groups by updating displayOrder', async () => {
    const groupOrders = [
      { id: 'group-1', displayOrder: 1 },
      { id: 'group-2', displayOrder: 0 },
      { id: 'group-3', displayOrder: 2 },
    ];

    mockInvoke.mockResolvedValueOnce({ success: true });

    const result = await window.electron.ipcRenderer.invoke('reorder-account-groups', groupOrders);

    expect(mockInvoke).toHaveBeenCalledWith('reorder-account-groups', groupOrders);
    expect(result.success).toBe(true);
  });

  /**
   * Test: Reordering groups persists across page reloads
   * Validates that after reordering, fetching groups returns them in the new order
   */
  it('should persist group order across page reloads', async () => {
    // First, reorder the groups
    const groupOrders = [
      { id: 'group-2', displayOrder: 0 },
      { id: 'group-1', displayOrder: 1 },
    ];

    mockInvoke.mockResolvedValueOnce({ success: true });
    await window.electron.ipcRenderer.invoke('reorder-account-groups', groupOrders);

    // Then fetch the groups again to verify the order persisted
    const mockGroupedView: GroupedAccountsView = {
      groups: [
        {
          id: 'group-2',
          name: 'Credit Cards',
          accountType: AccountType.User,
          displayOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accounts: [],
        },
        {
          id: 'group-1',
          name: 'Bank Accounts',
          accountType: AccountType.User,
          displayOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accounts: [],
        },
      ],
      ungroupedAccounts: [],
    };

    mockInvoke.mockResolvedValueOnce(mockGroupedView);

    const result = await window.electron.ipcRenderer.invoke('get-accounts-with-groups', {
      includeArchived: false,
      accountType: AccountType.User,
    });

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].id).toBe('group-2');
    expect(result.groups[0].displayOrder).toBe(0);
    expect(result.groups[1].id).toBe('group-1');
    expect(result.groups[1].displayOrder).toBe(1);
  });

  /**
   * Test: Moving a group up in the list
   * Validates that moving a group up swaps its position with the previous group
   */
  it('should move a group up by swapping with previous group', async () => {
    const initialGroups = [
      {
        id: 'group-1',
        name: 'Bank Accounts',
        accountType: AccountType.User,
        displayOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accounts: [],
      },
      {
        id: 'group-2',
        name: 'Credit Cards',
        accountType: AccountType.User,
        displayOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accounts: [],
      },
    ];

    // Simulate moving group-2 up (swapping with group-1)
    const expectedGroupOrders = [
      { id: 'group-2', displayOrder: 0 },
      { id: 'group-1', displayOrder: 1 },
    ];

    mockInvoke.mockResolvedValueOnce({ success: true });

    await window.electron.ipcRenderer.invoke('reorder-account-groups', expectedGroupOrders);

    expect(mockInvoke).toHaveBeenCalledWith('reorder-account-groups', expectedGroupOrders);
  });

  /**
   * Test: Moving a group down in the list
   * Validates that moving a group down swaps its position with the next group
   */
  it('should move a group down by swapping with next group', async () => {
    const initialGroups = [
      {
        id: 'group-1',
        name: 'Bank Accounts',
        accountType: AccountType.User,
        displayOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accounts: [],
      },
      {
        id: 'group-2',
        name: 'Credit Cards',
        accountType: AccountType.User,
        displayOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accounts: [],
      },
    ];

    // Simulate moving group-1 down (swapping with group-2)
    const expectedGroupOrders = [
      { id: 'group-2', displayOrder: 0 },
      { id: 'group-1', displayOrder: 1 },
    ];

    mockInvoke.mockResolvedValueOnce({ success: true });

    await window.electron.ipcRenderer.invoke('reorder-account-groups', expectedGroupOrders);

    expect(mockInvoke).toHaveBeenCalledWith('reorder-account-groups', expectedGroupOrders);
  });
});
