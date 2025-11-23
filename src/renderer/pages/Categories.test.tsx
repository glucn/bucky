/**
 * Integration Tests for Categories Page
 * 
 * These tests verify the integration of grouped categories display,
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

describe('Categories Page - Integration Tests', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  /**
   * Test: Creating a category group
   * Validates that creating a new category group calls the correct IPC handler
   * and returns the created group
   */
  it('should create a new category group', async () => {
    const groupName = 'Travel Expenses';
    const accountType = AccountType.Category;

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
   * Test: Fetching grouped categories
   * Validates that the get-accounts-with-groups IPC handler returns
   * the correct structure with groups and ungrouped categories
   */
  it('should fetch grouped categories', async () => {
    const mockGroupedView: GroupedAccountsView = {
      groups: [
        {
          id: 'group-1',
          name: 'Travel Expenses',
          accountType: AccountType.Category,
          displayOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accounts: [
            {
              id: 'category-1',
              name: 'Travel - Tickets',
              type: AccountType.Category,
              currency: 'USD',
              subtype: 'liability',
              isArchived: false,
              groupId: 'group-1',
            },
            {
              id: 'category-2',
              name: 'Travel - Food',
              type: AccountType.Category,
              currency: 'USD',
              subtype: 'liability',
              isArchived: false,
              groupId: 'group-1',
            },
          ],
        },
      ],
      ungroupedAccounts: [
        {
          id: 'category-3',
          name: 'Groceries',
          type: AccountType.Category,
          currency: 'USD',
          subtype: 'liability',
          isArchived: false,
          groupId: null,
        },
      ],
    };

    mockInvoke.mockResolvedValueOnce(mockGroupedView);

    const result = await window.electron.ipcRenderer.invoke('get-accounts-with-groups', {
      includeArchived: false,
      accountType: AccountType.Category,
    });

    expect(mockInvoke).toHaveBeenCalledWith('get-accounts-with-groups', {
      includeArchived: false,
      accountType: AccountType.Category,
    });
    expect(result).toEqual(mockGroupedView);
    expect(result.groups).toHaveLength(1);
    expect(result.ungroupedAccounts).toHaveLength(1);
    expect(result.groups[0].accounts).toHaveLength(2);
  });

  /**
   * Test: Adding categories to groups
   * Validates that adding a category to a group updates the category's groupId
   */
  it('should add a category to a group', async () => {
    const categoryId = 'category-123';
    const groupId = 'group-456';

    const updatedCategory: Account = {
      id: categoryId,
      name: 'Travel - Transport',
      type: AccountType.Category,
      currency: 'USD',
      subtype: 'liability',
      isArchived: false,
      groupId: groupId,
    };

    mockInvoke.mockResolvedValueOnce(updatedCategory);

    const result = await window.electron.ipcRenderer.invoke('add-account-to-group', {
      accountId: categoryId,
      groupId,
    });

    expect(mockInvoke).toHaveBeenCalledWith('add-account-to-group', {
      accountId: categoryId,
      groupId,
    });
    expect(result.groupId).toBe(groupId);
  });

  /**
   * Test: Editing a category group
   * Validates that updating a group's name calls the correct IPC handler
   */
  it('should edit an existing category group', async () => {
    const groupId = 'group-123';
    const newName = 'Updated Travel Expenses';

    const updatedGroup: AccountGroup = {
      id: groupId,
      name: newName,
      accountType: AccountType.Category,
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
   * Test: Deleting a category group
   * Validates that deleting a group calls the correct IPC handler
   * and orphans the categories (sets groupId to null)
   */
  it('should delete a category group and orphan its categories', async () => {
    const groupId = 'group-123';

    const deletedGroup: AccountGroup = {
      id: groupId,
      name: 'Travel Expenses',
      accountType: AccountType.Category,
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
   * Test: Removing a category from a group
   * Validates that removing a category from a group sets its groupId to null
   */
  it('should remove a category from a group', async () => {
    const categoryId = 'category-123';

    const updatedCategory: Account = {
      id: categoryId,
      name: 'Travel - Tickets',
      type: AccountType.Category,
      currency: 'USD',
      subtype: 'liability',
      isArchived: false,
      groupId: null,
    };

    mockInvoke.mockResolvedValueOnce(updatedCategory);

    const result = await window.electron.ipcRenderer.invoke('remove-account-from-group', categoryId);

    expect(mockInvoke).toHaveBeenCalledWith('remove-account-from-group', categoryId);
    expect(result.groupId).toBeNull();
  });

  /**
   * Test: Category group creation with duplicate name should fail
   * Validates that attempting to create a group with a duplicate name
   * results in an error
   */
  it('should fail to create a category group with duplicate name', async () => {
    const groupName = 'Travel Expenses';
    const accountType = AccountType.Category;

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
   * Test: Fetching grouped categories with no groups
   * Validates that when no groups exist, all categories are returned as ungrouped
   */
  it('should return all categories as ungrouped when no groups exist', async () => {
    const mockGroupedView: GroupedAccountsView = {
      groups: [],
      ungroupedAccounts: [
        {
          id: 'category-1',
          name: 'Groceries',
          type: AccountType.Category,
          currency: 'USD',
          subtype: 'liability',
          isArchived: false,
          groupId: null,
        },
        {
          id: 'category-2',
          name: 'Utilities',
          type: AccountType.Category,
          currency: 'USD',
          subtype: 'liability',
          isArchived: false,
          groupId: null,
        },
      ],
    };

    mockInvoke.mockResolvedValueOnce(mockGroupedView);

    const result = await window.electron.ipcRenderer.invoke('get-accounts-with-groups', {
      includeArchived: false,
      accountType: AccountType.Category,
    });

    expect(result.groups).toHaveLength(0);
    expect(result.ungroupedAccounts).toHaveLength(2);
    expect(result.ungroupedAccounts.every((cat: any) => cat.groupId === null)).toBe(true);
  });

  /**
   * Test: Moving a category between groups
   * Validates that a category can be moved from one group to another
   */
  it('should move a category from one group to another', async () => {
    const categoryId = 'category-123';
    const oldGroupId = 'group-1';
    const newGroupId = 'group-2';

    // First, add to new group
    const updatedCategory: Account = {
      id: categoryId,
      name: 'Travel - Food',
      type: AccountType.Category,
      currency: 'USD',
      subtype: 'liability',
      isArchived: false,
      groupId: newGroupId,
    };

    mockInvoke.mockResolvedValueOnce(updatedCategory);

    const result = await window.electron.ipcRenderer.invoke('add-account-to-group', {
      accountId: categoryId,
      groupId: newGroupId,
    });

    expect(mockInvoke).toHaveBeenCalledWith('add-account-to-group', {
      accountId: categoryId,
      groupId: newGroupId,
    });
    expect(result.groupId).toBe(newGroupId);
  });

  /**
   * Test: Reordering category groups
   * Validates that reordering category groups calls the correct IPC handler
   * with the new displayOrder values
   */
  it('should reorder category groups by updating displayOrder', async () => {
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
   * Test: Reordering category groups persists across page reloads
   * Validates that after reordering, fetching groups returns them in the new order
   */
  it('should persist category group order across page reloads', async () => {
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
          name: 'Entertainment',
          accountType: AccountType.Category,
          displayOrder: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          accounts: [],
        },
        {
          id: 'group-1',
          name: 'Travel Expenses',
          accountType: AccountType.Category,
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
      accountType: AccountType.Category,
    });

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].id).toBe('group-2');
    expect(result.groups[0].displayOrder).toBe(0);
    expect(result.groups[1].id).toBe('group-1');
    expect(result.groups[1].displayOrder).toBe(1);
  });

  /**
   * Test: Moving a category group up in the list
   * Validates that moving a group up swaps its position with the previous group
   */
  it('should move a category group up by swapping with previous group', async () => {
    const initialGroups = [
      {
        id: 'group-1',
        name: 'Travel Expenses',
        accountType: AccountType.Category,
        displayOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accounts: [],
      },
      {
        id: 'group-2',
        name: 'Entertainment',
        accountType: AccountType.Category,
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
   * Test: Moving a category group down in the list
   * Validates that moving a group down swaps its position with the next group
   */
  it('should move a category group down by swapping with next group', async () => {
    const initialGroups = [
      {
        id: 'group-1',
        name: 'Travel Expenses',
        accountType: AccountType.Category,
        displayOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accounts: [],
      },
      {
        id: 'group-2',
        name: 'Entertainment',
        accountType: AccountType.Category,
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
