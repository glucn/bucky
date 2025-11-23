import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAccounts } from "../context/AccountsContext";
import AccountNavItem from "./AccountNavItem";
import AccountManagementButton from "./AccountManagementButton";
import { AccountType } from "../../shared/accountTypes";
import { GroupedAccountsView } from "../types";

const Sidebar: React.FC = () => {
  const { accounts, loading, error } = useAccounts();
  const location = useLocation();
  const [groupedAccounts, setGroupedAccounts] = useState<GroupedAccountsView | null>(null);
  const [loadingGrouped, setLoadingGrouped] = useState(false);

  // Extract selected accountId from the current path
  const match = location.pathname.match(/^\/accounts\/([^/]+)/);
  const selectedAccountId = match ? match[1] : null;

  // Fetch grouped accounts data
  useEffect(() => {
    fetchGroupedAccounts();
  }, [accounts]);

  const fetchGroupedAccounts = async () => {
    setLoadingGrouped(true);
    try {
      const response = await window.electron.getAccountsWithGroups({
        includeArchived: false,
        accountType: AccountType.User,
      });
      
      if (response.success && response.data) {
        setGroupedAccounts(response.data);
      } else {
        console.error("Failed to fetch grouped accounts:", response.error);
        setGroupedAccounts(null);
      }
    } catch (err) {
      console.error("Failed to fetch grouped accounts:", err);
      setGroupedAccounts(null);
    } finally {
      setLoadingGrouped(false);
    }
  };

  // Filter to only user accounts (fallback for old rendering)
  const userAccounts = accounts.filter((account) => account.type === AccountType.User);
  /* Removed per-account balance fetching and local accountBalances state */

  // Storage key for collapse state
  const storageKey = "sidebar.expandedGroups";

  // Initialize collapse state from localStorage
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return new Set(parsed);
      }
    } catch (err) {
      console.error("Failed to load collapse state from localStorage:", err);
    }
    // Default: all groups expanded
    return new Set(groupedAccounts?.groups.map((g) => g.id) || []);
  });

  // Persist collapse state to localStorage whenever it changes
  useEffect(() => {
    try {
      const stateArray = Array.from(expandedGroups);
      localStorage.setItem(storageKey, JSON.stringify(stateArray));
    } catch (err) {
      console.error("Failed to save collapse state to localStorage:", err);
    }
  }, [expandedGroups, storageKey]);

  // Update expanded groups when groups list changes (e.g., new group added)
  useEffect(() => {
    if (groupedAccounts) {
      setExpandedGroups((prev) => {
        const newSet = new Set(prev);
        // Add any new groups to expanded state by default
        groupedAccounts.groups.forEach((group) => {
          if (!prev.has(group.id)) {
            newSet.add(group.id);
          }
        });
        // Remove any groups that no longer exist
        prev.forEach((groupId) => {
          if (!groupedAccounts.groups.find((g) => g.id === groupId)) {
            newSet.delete(groupId);
          }
        });
        return newSet;
      });
    }
  }, [groupedAccounts]);

  const handleToggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  return (
    <aside className="flex flex-col min-h-0 w-64 bg-white border-r shadow-md p-4 flex-shrink-0">
      <div className="flex-1 overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">Accounts</h2>
        {(loading || loadingGrouped) && <div className="text-gray-500">Loading accounts...</div>}
        {error && <div className="text-red-500">Failed to load accounts.</div>}
        
        {!loading && !loadingGrouped && !error && groupedAccounts && (
          <div className="space-y-2">
            {/* Render Groups */}
            {groupedAccounts.groups.map((group) => (
              <div key={group.id} className="mb-2">
                {/* Group Header */}
                <div
                  className="flex items-center justify-between px-3 py-2 bg-gray-100 rounded-md hover:bg-gray-200 cursor-pointer"
                  onClick={() => handleToggleGroup(group.id)}
                >
                  <div className="flex items-center flex-1">
                    {/* Expand/Collapse Icon */}
                    <span className="mr-2 text-gray-600">
                      {expandedGroups.has(group.id) ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </span>
                    
                    {/* Group Name */}
                    <span className="font-semibold text-gray-900 text-sm">{group.name}</span>
                    
                    {/* Account Count */}
                    <span className="ml-2 text-xs text-gray-500">
                      ({group.accounts?.length || 0})
                    </span>
                  </div>
                </div>

                {/* Accounts List (shown when expanded) */}
                {expandedGroups.has(group.id) && group.accounts && group.accounts.length > 0 && (
                  <div className="ml-4 mt-1">
                    {group.accounts.map((account) => (
                      <AccountNavItem
                        key={account.id}
                        account={account}
                        selected={account.id === selectedAccountId}
                        balance={account.balance}
                      />
                    ))}
                  </div>
                )}

                {/* Empty state when expanded but no accounts */}
                {expandedGroups.has(group.id) && (!group.accounts || group.accounts.length === 0) && (
                  <div className="ml-4 mt-1 px-3 py-2 text-xs text-gray-500 italic">
                    No accounts in this group
                  </div>
                )}
              </div>
            ))}

            {/* Render Ungrouped Accounts */}
            {groupedAccounts.ungroupedAccounts.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-gray-700 mb-2 px-3 uppercase tracking-wide">
                  Ungrouped Accounts
                </h3>
                <div className="space-y-1">
                  {groupedAccounts.ungroupedAccounts.map((account) => (
                    <AccountNavItem
                      key={account.id}
                      account={account}
                      selected={account.id === selectedAccountId}
                      balance={account.balance}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state when no groups and no ungrouped accounts */}
            {groupedAccounts.groups.length === 0 && groupedAccounts.ungroupedAccounts.length === 0 && (
              <div className="text-gray-400">No user accounts found.</div>
            )}
          </div>
        )}
      </div>
      <div className="mt-4">
        <AccountManagementButton />
      </div>
    </aside>
  );
};

export default Sidebar;