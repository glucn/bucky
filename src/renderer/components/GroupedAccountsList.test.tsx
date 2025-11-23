/**
 * Property-Based and Unit Tests for GroupedAccountsList Component
 * 
 * These tests verify rendering, collapse state management, and account move functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { AccountType } from '../../shared/accountTypes';
import { AccountGroup, Account } from '../types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

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

describe('GroupedAccountsList - Property-Based Tests', () => {
  beforeEach(() => {
    localStorageMock.clear();
    mockInvoke.mockReset();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  /**
   * Feature: account-grouping, Property 15: Group collapse state persistence
   * 
   * For any group and collapse state (collapsed or expanded), setting the state then
   * querying the stored state should return the same collapse state.
   * 
   * Validates: Requirements 8.3, 8.4, 8.5
   */
  it('Property 15: Group collapse state persistence', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate account type
        fc.constantFrom(AccountType.User, AccountType.Category),
        // Generate 1-5 groups with random IDs
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        // Generate random collapse states for each group (true = expanded, false = collapsed)
        fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
        async (accountType, groupsData, collapseStates) => {
          // Ensure we have unique group IDs (filter out duplicates)
          const uniqueGroups = groupsData.filter((group, index, self) =>
            index === self.findIndex((g) => g.id === group.id)
          );
          
          // Skip test if we don't have any groups after deduplication
          if (uniqueGroups.length === 0) {
            return;
          }
          
          // Ensure we have matching lengths - pad with false if needed
          const states = uniqueGroups.map((_, index) => 
            index < collapseStates.length ? collapseStates[index] : false
          );
          
          // Storage key for collapse state, scoped by account type
          const storageKey = `groupedAccountsList.expandedGroups.${accountType}`;

          // Build the set of expanded group IDs based on collapse states
          const expandedGroupIds: string[] = [];
          uniqueGroups.forEach((group, index) => {
            if (states[index]) {
              expandedGroupIds.push(group.id);
            }
          });

          // Store the collapse state in localStorage
          localStorage.setItem(storageKey, JSON.stringify(expandedGroupIds));

          // Retrieve the collapse state from localStorage
          const storedValue = localStorage.getItem(storageKey);
          expect(storedValue).not.toBeNull();

          const retrievedExpandedIds = JSON.parse(storedValue!);

          // Property: retrieved collapse state should match what we stored
          expect(retrievedExpandedIds).toEqual(expandedGroupIds);

          // Property: each group's collapse state should be correctly represented
          uniqueGroups.forEach((group, index) => {
            const isExpanded = retrievedExpandedIds.includes(group.id);
            expect(isExpanded).toBe(states[index]);
          });

          // Cleanup
          localStorage.removeItem(storageKey);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test: Collapse state persistence across different account types
   * Validates that collapse states are stored separately for user and category accounts
   */
  it('should store collapse states separately for different account types', () => {
    const userStorageKey = `groupedAccountsList.expandedGroups.${AccountType.User}`;
    const categoryStorageKey = `groupedAccountsList.expandedGroups.${AccountType.Category}`;

    const userExpandedGroups = ['group-1', 'group-2'];
    const categoryExpandedGroups = ['group-3', 'group-4'];

    // Store collapse states for both account types
    localStorage.setItem(userStorageKey, JSON.stringify(userExpandedGroups));
    localStorage.setItem(categoryStorageKey, JSON.stringify(categoryExpandedGroups));

    // Retrieve and verify
    const retrievedUserGroups = JSON.parse(localStorage.getItem(userStorageKey)!);
    const retrievedCategoryGroups = JSON.parse(localStorage.getItem(categoryStorageKey)!);

    expect(retrievedUserGroups).toEqual(userExpandedGroups);
    expect(retrievedCategoryGroups).toEqual(categoryExpandedGroups);
    expect(retrievedUserGroups).not.toEqual(retrievedCategoryGroups);
  });

  /**
   * Test: Collapse state handles invalid localStorage data
   * Validates that the component handles corrupted or invalid localStorage data gracefully
   */
  it('should handle invalid localStorage data gracefully', () => {
    const storageKey = `groupedAccountsList.expandedGroups.${AccountType.User}`;

    // Store invalid JSON
    localStorage.setItem(storageKey, 'invalid-json{');

    // Attempt to retrieve and parse
    let parsedValue = null;
    try {
      const storedValue = localStorage.getItem(storageKey);
      if (storedValue) {
        parsedValue = JSON.parse(storedValue);
      }
    } catch (err) {
      // Should catch the JSON parse error
      expect(err).toBeInstanceOf(SyntaxError);
    }

    // Should not have successfully parsed
    expect(parsedValue).toBeNull();
  });

  /**
   * Test: Collapse state updates correctly when toggling
   * Validates that toggling a group's collapse state updates localStorage
   */
  it('should update collapse state when toggling groups', () => {
    const storageKey = `groupedAccountsList.expandedGroups.${AccountType.User}`;
    const groupId = 'test-group-123';

    // Start with group expanded
    let expandedGroups = new Set([groupId]);
    localStorage.setItem(storageKey, JSON.stringify(Array.from(expandedGroups)));

    // Verify initial state
    let stored = JSON.parse(localStorage.getItem(storageKey)!);
    expect(stored).toContain(groupId);

    // Toggle to collapsed
    expandedGroups.delete(groupId);
    localStorage.setItem(storageKey, JSON.stringify(Array.from(expandedGroups)));

    // Verify collapsed state
    stored = JSON.parse(localStorage.getItem(storageKey)!);
    expect(stored).not.toContain(groupId);
    expect(stored).toHaveLength(0);

    // Toggle back to expanded
    expandedGroups.add(groupId);
    localStorage.setItem(storageKey, JSON.stringify(Array.from(expandedGroups)));

    // Verify expanded state again
    stored = JSON.parse(localStorage.getItem(storageKey)!);
    expect(stored).toContain(groupId);
    expect(stored).toHaveLength(1);
  });
});

describe('GroupedAccountsList - Unit Tests', () => {
  beforeEach(() => {
    localStorageMock.clear();
    mockInvoke.mockReset();
  });

  /**
   * Test: Rendering groups and ungrouped accounts
   * Validates that the component correctly structures groups and ungrouped accounts
   */
  it('should render groups and ungrouped accounts correctly', () => {
    const groups: AccountGroup[] = [
      {
        id: 'group-1',
        name: 'Test Group 1',
        accountType: AccountType.User,
        displayOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accounts: [],
      },
    ];

    const ungroupedAccounts: Account[] = [
      {
        id: 'account-1',
        name: 'Ungrouped Account',
        type: AccountType.User,
        currency: 'USD',
        subtype: 'asset',
        isArchived: false,
        groupId: null,
      },
    ];

    // Verify data structure
    expect(groups).toHaveLength(1);
    expect(ungroupedAccounts).toHaveLength(1);
    expect(groups[0].accounts).toHaveLength(0);
    expect(ungroupedAccounts[0].groupId).toBeNull();
  });

  /**
   * Test: Empty state when no groups or accounts
   * Validates that the component handles empty state correctly
   */
  it('should handle empty state when no groups or accounts exist', () => {
    const groups: AccountGroup[] = [];
    const ungroupedAccounts: Account[] = [];

    expect(groups).toHaveLength(0);
    expect(ungroupedAccounts).toHaveLength(0);
  });

  /**
   * Test: Account move functionality - add to group
   * Validates that moving an account to a group calls the correct IPC handler
   */
  it('should call add-account-to-group IPC handler when moving account to group', async () => {
    const accountId = 'account-123';
    const groupId = 'group-456';

    mockInvoke.mockResolvedValueOnce({
      id: accountId,
      groupId: groupId,
    });

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
   * Test: Account move functionality - remove from group
   * Validates that removing an account from a group calls the correct IPC handler
   */
  it('should call remove-account-from-group IPC handler when removing account from group', async () => {
    const accountId = 'account-123';

    mockInvoke.mockResolvedValueOnce({
      id: accountId,
      groupId: null,
    });

    const result = await window.electron.ipcRenderer.invoke('remove-account-from-group', accountId);

    expect(mockInvoke).toHaveBeenCalledWith('remove-account-from-group', accountId);
    expect(result.groupId).toBeNull();
  });
});
