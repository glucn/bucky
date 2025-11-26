import React, { useState, useEffect } from "react";
import { AccountGroup, Account } from "../types";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";
import { AccountGroupItem } from "./AccountGroupItem";
import { formatCurrencyAmount, formatMultiCurrencyBalances } from "../utils/currencyUtils";
import { normalizeAccountBalance } from "../utils/displayNormalization";
import { useNavigate } from "react-router-dom";

interface GroupedAccountsListProps {
  groups: AccountGroup[];
  ungroupedAccounts: Account[];
  accountType: AccountType;
  onAccountClick?: (account: Account) => void;
  onAccountEdit?: (account: Account) => void;
  onGroupEdit?: (group: AccountGroup) => void;
  onGroupDelete?: (group: AccountGroup) => void;
  onAccountMove?: (accountId: string, groupId: string | null) => void;
  onGroupReorder?: (groupId: string, direction: 'up' | 'down') => void;
  accountBalances?: Record<string, number>;
}

export const GroupedAccountsList: React.FC<GroupedAccountsListProps> = ({
  groups,
  ungroupedAccounts,
  accountType,
  onAccountClick,
  onAccountEdit,
  onGroupEdit,
  onGroupDelete,
  onAccountMove,
  onGroupReorder,
  accountBalances = {},
}) => {
  const navigate = useNavigate();

  // Helper function to format balances for categories (with multi-currency support)
  const formatBalances = (account: Account): string => {
    // For user accounts, use simple balance display
    if (accountType === AccountType.User) {
      const balance = accountBalances[account.id] ?? account.balance;
      if (typeof balance === "number") {
        return formatCurrencyAmount(balance, account.currency, { showSymbol: true });
      }
      return "-";
    }

    // For categories, handle multi-currency balances with normalization
    const categoryAccount = account as any;
    
    // If multi-currency balances exist, normalize each currency balance
    if (categoryAccount.balances && Object.keys(categoryAccount.balances).length > 0) {
      const normalizedBalances: Record<string, number> = {};
      
      for (const [currency, balance] of Object.entries(categoryAccount.balances)) {
        // Normalize each currency balance (categories always display as positive)
        normalizedBalances[currency] = normalizeAccountBalance(
          balance as number,
          account.type,
          account.subtype as AccountSubtype
        );
      }
      
      return formatMultiCurrencyBalances(normalizedBalances);
    }
    
    // Single currency balance - normalize and format
    const balance = accountBalances[account.id] ?? account.balance ?? 0;
    const normalizedBalance = normalizeAccountBalance(
      balance,
      account.type,
      account.subtype as AccountSubtype
    );
    
    return formatCurrencyAmount(normalizedBalance, account.currency);
  };

  // Get balance color for accounts and categories
  const getBalanceColor = (account: Account): string => {
    if (accountType === AccountType.User) {
      // For user accounts, color based on whether the balance is "good" or "bad"
      const balance = accountBalances[account.id] ?? account.balance ?? 0;
      
      // Assets: positive = green, negative = red
      // Liabilities: negative = green (less debt), positive = red (more debt)
      if (account.subtype === AccountSubtype.Asset) {
        return balance >= 0 ? "text-green-600" : "text-red-600";
      } else if (account.subtype === AccountSubtype.Liability) {
        return balance <= 0 ? "text-green-600" : "text-red-600";
      }
      return "text-gray-900";
    }
    
    // Income categories (asset) = green, Expense categories (liability) = red
    return account.subtype === AccountSubtype.Asset ? "text-green-600" : "text-red-600";
  };
  // Storage key for collapse state, scoped by account type
  const storageKey = `groupedAccountsList.expandedGroups.${accountType}`;

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
    return new Set(groups?.map((g) => g.id) || []);
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
    if (!groups) return;
    
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      // Add any new groups to expanded state by default
      groups.forEach((group) => {
        if (!prev.has(group.id)) {
          newSet.add(group.id);
        }
      });
      // Remove any groups that no longer exist
      prev.forEach((groupId) => {
        if (!groups.find((g) => g.id === groupId)) {
          newSet.delete(groupId);
        }
      });
      return newSet;
    });
  }, [groups]);

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

  const handleGroupEdit = (group: AccountGroup) => {
    if (onGroupEdit) {
      onGroupEdit(group);
    }
  };

  const handleGroupDelete = (group: AccountGroup) => {
    if (onGroupDelete) {
      onGroupDelete(group);
    }
  };

  const handleAccountMove = async (accountId: string, targetGroupId: string | null) => {
    if (onAccountMove) {
      onAccountMove(accountId, targetGroupId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Render Groups */}
      {groups && groups.length > 0 && (
        <div className="space-y-2">
          {groups.map((group, index) => (
            <AccountGroupItem
              key={group.id}
              group={group}
              isExpanded={expandedGroups.has(group.id)}
              onToggle={() => handleToggleGroup(group.id)}
              onEdit={() => handleGroupEdit(group)}
              onDelete={() => handleGroupDelete(group)}
              onAccountEdit={onAccountEdit}
              onAccountMove={handleAccountMove}
              onMoveUp={onGroupReorder ? () => onGroupReorder(group.id, 'up') : undefined}
              onMoveDown={onGroupReorder ? () => onGroupReorder(group.id, 'down') : undefined}
              isFirst={index === 0}
              isLast={index === groups.length - 1}
              accountBalances={accountBalances}
            />
          ))}
        </div>
      )}

      {/* Render Ungrouped Accounts Section */}
      {ungroupedAccounts && ungroupedAccounts.length > 0 && (
        <div className="mt-6">
          <h3 className="text-md font-semibold text-gray-700 mb-2">
            Ungrouped {accountType === AccountType.User ? "Accounts" : "Categories"}
          </h3>
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <colgroup>
              <col className="w-[35%]" />
              {accountType === AccountType.User && <col className="w-[15%]" />}
              <col className="w-[20%]" />
              {accountType === AccountType.User && <col className="w-[10%]" />}
              <col className="w-[20%]" />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                {accountType === AccountType.User && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {accountType === AccountType.Category ? "Balances" : "Balance"}
                </th>
                {accountType === AccountType.User && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Currency
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ungroupedAccounts.map((account) => (
                <tr 
                  key={account.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/accounts/${account.id}/transactions`)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {account.name}
                  </td>
                  {accountType === AccountType.User && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {account.subtype}
                    </td>
                  )}
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${getBalanceColor(account)}`}>
                    {formatBalances(account)}
                  </td>
                  {accountType === AccountType.User && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {account.currency}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/accounts/${account.id}/transactions`);
                        }}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View
                      </button>
                      {onAccountEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAccountEdit(account);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>
                      )}
                      {onAccountMove && groups && groups.length > 0 && (
                        <select
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            const groupId = e.target.value;
                            if (groupId && onAccountMove) {
                              onAccountMove(account.id, groupId);
                            }
                            e.target.value = ""; // Reset selection
                          }}
                          className="text-sm border border-gray-300 rounded px-2 py-1 text-gray-700 hover:border-gray-400"
                          defaultValue=""
                        >
                          <option value="" disabled>Add to group...</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state when no groups and no ungrouped accounts */}
      {(!groups || groups.length === 0) && (!ungroupedAccounts || ungroupedAccounts.length === 0) && (
        <div className="text-center py-8 text-gray-500">
          No {accountType === AccountType.User ? "accounts" : "categories"} found.
        </div>
      )}
    </div>
  );
};
