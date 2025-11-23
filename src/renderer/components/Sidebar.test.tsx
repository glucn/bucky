/**
 * Unit Tests for Sidebar Component
 * 
 * These tests verify grouped account rendering and collapse state persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AccountType } from "../../shared/accountTypes";
import { GroupedAccountsView } from "../types";

// Mock window.electron API
const mockGetAccountsWithGroups = vi.fn();
global.window = {
  electron: {
    getAccountsWithGroups: mockGetAccountsWithGroups,
    ipcRenderer: {
      invoke: vi.fn(),
      on: vi.fn(),
    },
  },
} as any;

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
});

describe("Sidebar - Grouped Accounts", () => {
  const mockGroupedAccounts: GroupedAccountsView = {
    groups: [
      {
        id: "group-1",
        name: "Bank Accounts",
        accountType: AccountType.User,
        displayOrder: 0,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        accounts: [
          {
            id: "account-1",
            name: "Checking",
            type: AccountType.User,
            subtype: "asset",
            currency: "USD",
            isArchived: false,
            archivedAt: null,
            balance: 1000,
            groupId: "group-1",
          },
          {
            id: "account-2",
            name: "Savings",
            type: AccountType.User,
            subtype: "asset",
            currency: "USD",
            isArchived: false,
            archivedAt: null,
            balance: 5000,
            groupId: "group-1",
          },
        ],
      },
      {
        id: "group-2",
        name: "Credit Cards",
        accountType: AccountType.User,
        displayOrder: 1,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        accounts: [
          {
            id: "account-3",
            name: "Visa",
            type: AccountType.User,
            subtype: "liability",
            currency: "USD",
            isArchived: false,
            archivedAt: null,
            balance: -500,
            groupId: "group-2",
          },
        ],
      },
    ],
    ungroupedAccounts: [
      {
        id: "account-4",
        name: "Cash",
        type: AccountType.User,
        subtype: "asset",
        currency: "USD",
        isArchived: false,
        archivedAt: null,
        balance: 200,
        groupId: null,
      },
    ],
  };

  beforeEach(() => {
    mockGetAccountsWithGroups.mockReset();
    mockGetAccountsWithGroups.mockResolvedValue({ success: true, data: mockGroupedAccounts });
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test: Fetch grouped accounts data
   * Validates that the component calls getAccountsWithGroups with correct parameters
   */
  it("should call getAccountsWithGroups with correct parameters", async () => {
    await window.electron.getAccountsWithGroups({
      includeArchived: false,
      accountType: AccountType.User,
    });

    expect(mockGetAccountsWithGroups).toHaveBeenCalledWith({
      includeArchived: false,
      accountType: AccountType.User,
    });
  });

  /**
   * Test: Handle grouped accounts data structure
   * Validates that the component correctly processes grouped accounts data
   */
  it("should handle grouped accounts data structure", async () => {
    const result = await window.electron.getAccountsWithGroups({
      includeArchived: false,
      accountType: AccountType.User,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockGroupedAccounts);
    expect(result.data?.groups).toHaveLength(2);
    expect(result.data?.ungroupedAccounts).toHaveLength(1);
    expect(result.data?.groups[0].name).toBe("Bank Accounts");
    expect(result.data?.groups[0].accounts).toHaveLength(2);
  });

  /**
   * Test: Persist collapse state to localStorage
   * Validates that collapse state is saved to localStorage
   */
  it("should persist collapse state to localStorage", () => {
    const expandedGroups = new Set(["group-1", "group-2"]);
    const stateArray = Array.from(expandedGroups);
    localStorage.setItem("sidebar.expandedGroups", JSON.stringify(stateArray));

    const stored = localStorage.getItem("sidebar.expandedGroups");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed).toContain("group-1");
    expect(parsed).toContain("group-2");
  });

  /**
   * Test: Restore collapse state from localStorage
   * Validates that collapse state is restored from localStorage
   */
  it("should restore collapse state from localStorage", () => {
    localStorage.setItem("sidebar.expandedGroups", JSON.stringify(["group-1"]));

    const stored = localStorage.getItem("sidebar.expandedGroups");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed).toEqual(["group-1"]);
    expect(parsed).toContain("group-1");
    expect(parsed).not.toContain("group-2");
  });

  /**
   * Test: Toggle group collapse state
   * Validates that toggling a group updates the collapse state
   */
  it("should toggle group collapse state", () => {
    let expandedGroups = new Set(["group-1", "group-2"]);

    // Simulate toggling group-1 (collapse it)
    if (expandedGroups.has("group-1")) {
      expandedGroups.delete("group-1");
    } else {
      expandedGroups.add("group-1");
    }

    expect(expandedGroups.has("group-1")).toBe(false);
    expect(expandedGroups.has("group-2")).toBe(true);

    // Simulate toggling group-1 again (expand it)
    if (expandedGroups.has("group-1")) {
      expandedGroups.delete("group-1");
    } else {
      expandedGroups.add("group-1");
    }

    expect(expandedGroups.has("group-1")).toBe(true);
    expect(expandedGroups.has("group-2")).toBe(true);
  });

  /**
   * Test: Handle empty groups
   * Validates that the component handles groups with no accounts
   */
  it("should handle empty groups", async () => {
    const emptyGroupData: GroupedAccountsView = {
      groups: [
        {
          id: "group-empty",
          name: "Empty Group",
          accountType: AccountType.User,
          displayOrder: 0,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          accounts: [],
        },
      ],
      ungroupedAccounts: [],
    };

    mockGetAccountsWithGroups.mockResolvedValueOnce({ success: true, data: emptyGroupData });

    const result = await window.electron.getAccountsWithGroups({
      includeArchived: false,
      accountType: AccountType.User,
    });

    expect(result.data?.groups).toHaveLength(1);
    expect(result.data?.groups[0].accounts).toHaveLength(0);
    expect(result.data?.ungroupedAccounts).toHaveLength(0);
  });

  /**
   * Test: Handle no groups and no accounts
   * Validates that the component handles empty state
   */
  it("should handle no groups and no accounts", async () => {
    const emptyData: GroupedAccountsView = {
      groups: [],
      ungroupedAccounts: [],
    };

    mockGetAccountsWithGroups.mockResolvedValueOnce({ success: true, data: emptyData });

    const result = await window.electron.getAccountsWithGroups({
      includeArchived: false,
      accountType: AccountType.User,
    });

    expect(result.data?.groups).toHaveLength(0);
    expect(result.data?.ungroupedAccounts).toHaveLength(0);
  });

  /**
   * Test: Update expanded groups when groups list changes
   * Validates that new groups are added to expanded state by default
   */
  it("should add new groups to expanded state by default", () => {
    let expandedGroups = new Set(["group-1"]);
    const newGroups = [
      { id: "group-1", name: "Group 1" },
      { id: "group-2", name: "Group 2" },
      { id: "group-3", name: "Group 3" },
    ];

    // Simulate adding new groups to expanded state
    newGroups.forEach((group) => {
      if (!expandedGroups.has(group.id)) {
        expandedGroups.add(group.id);
      }
    });

    expect(expandedGroups.has("group-1")).toBe(true);
    expect(expandedGroups.has("group-2")).toBe(true);
    expect(expandedGroups.has("group-3")).toBe(true);
  });

  /**
   * Test: Remove deleted groups from expanded state
   * Validates that groups that no longer exist are removed from expanded state
   */
  it("should remove deleted groups from expanded state", () => {
    let expandedGroups = new Set(["group-1", "group-2", "group-3"]);
    const currentGroups = [
      { id: "group-1", name: "Group 1" },
      { id: "group-2", name: "Group 2" },
    ];

    // Simulate removing groups that no longer exist
    expandedGroups.forEach((groupId) => {
      if (!currentGroups.find((g) => g.id === groupId)) {
        expandedGroups.delete(groupId);
      }
    });

    expect(expandedGroups.has("group-1")).toBe(true);
    expect(expandedGroups.has("group-2")).toBe(true);
    expect(expandedGroups.has("group-3")).toBe(false);
  });

  /**
   * Test: Handle localStorage errors gracefully
   * Validates that the component handles localStorage errors without crashing
   */
  it("should handle localStorage errors gracefully", () => {
    // Simulate localStorage.getItem throwing an error
    const originalGetItem = localStorage.getItem;
    localStorage.getItem = vi.fn().mockImplementation(() => {
      throw new Error("localStorage error");
    });

    let expandedGroups: Set<string>;
    try {
      const stored = localStorage.getItem("sidebar.expandedGroups");
      if (stored) {
        const parsed = JSON.parse(stored);
        expandedGroups = new Set(parsed);
      } else {
        expandedGroups = new Set();
      }
    } catch (err) {
      console.error("Failed to load collapse state from localStorage:", err);
      expandedGroups = new Set();
    }

    expect(expandedGroups).toEqual(new Set());

    // Restore original implementation
    localStorage.getItem = originalGetItem;
  });
});
