import React, { useEffect, useState } from "react";
import { AccountGroup, Account } from "../types";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";
import { formatCurrencyAmount, formatCurrencyAmountDetail, formatMultiCurrencyBalances } from "../utils/currencyUtils";
import { normalizeAccountBalance } from "../utils/displayNormalization";
import { useNavigate } from "react-router-dom";

interface AccountGroupItemProps {
  group: AccountGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAccountEdit?: (account: Account) => void;
  onAccountMove?: (accountId: string, groupId: string | null) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  accountBalances?: Record<string, number>;
}

export const AccountGroupItem: React.FC<AccountGroupItemProps> = ({
  group,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onAccountEdit,
  onAccountMove,
  onMoveUp,
  onMoveDown,
  isFirst = false,
  isLast = false,
  accountBalances = {},
}) => {
  const navigate = useNavigate();
  const [aggregateBalance, setAggregateBalance] = useState<number | Record<string, number> | null>(null);

  // Helper function to format balances for categories (with multi-currency support)
  const formatBalances = (account: Account): string => {
    // For user accounts, use simple balance display
    if (group.accountType === AccountType.User) {
      const balance = accountBalances[account.id] ?? account.balance;
      if (typeof balance === "number") {
        return formatCurrencyAmount(balance, account.currency);
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
    if (group.accountType === AccountType.User) {
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

  // Calculate aggregate balance from accounts when component mounts or accounts change
  useEffect(() => {
    calculateAggregateBalance();
  }, [group.accounts, accountBalances]);

  const calculateAggregateBalance = () => {
    if (!group.accounts || group.accounts.length === 0) {
      setAggregateBalance(null);
      return;
    }

    const balances: Record<string, number> = {};
    
    for (const account of group.accounts) {
      const rawBalance = accountBalances[account.id] ?? account.balance ?? 0;
      
      // Normalize the balance for display (same logic as individual accounts)
      let normalizedBalance: number;
      if (group.accountType === AccountType.Category) {
        // Categories always display as positive
        normalizedBalance = Math.abs(rawBalance);
      } else {
        // User accounts: normalize based on subtype
        normalizedBalance = normalizeAccountBalance(
          rawBalance,
          account.type,
          account.subtype as AccountSubtype
        );
      }
      
      const currency = account.currency;
      balances[currency] = (balances[currency] || 0) + normalizedBalance;
    }
    
    // Round all balances to 2 decimal places
    for (const currency in balances) {
      balances[currency] = Math.round(balances[currency] * 100) / 100;
    }
    
    // If single currency, return just the number
    const currencies = Object.keys(balances);
    if (currencies.length === 0) {
      setAggregateBalance(0);
    } else if (currencies.length === 1) {
      setAggregateBalance(balances[currencies[0]]);
    } else {
      // Multi-currency: return the record
      setAggregateBalance(balances);
    }
  };

  const handleDeleteClick = () => {
    const accountCount = group.accounts?.length || 0;
    const message = accountCount > 0
      ? `Are you sure you want to delete "${group.name}"? This group contains ${accountCount} account(s). The accounts will be moved to the ungrouped section.`
      : `Are you sure you want to delete "${group.name}"?`;
    
    if (window.confirm(message)) {
      onDelete();
    }
  };

  const renderBalance = () => {
    if (aggregateBalance === null) {
      return null;
    }

    // Determine color based on account type
    const colorClass = group.accountType === AccountType.Category 
      ? "text-gray-900" // Categories show in neutral color
      : "text-gray-600";
    
    // Check if it's a multi-currency balance (Record<string, number>)
    if (typeof aggregateBalance === "object" && !Array.isArray(aggregateBalance)) {
      return (
        <span className={`text-sm font-medium ${colorClass}`}>
          {formatMultiCurrencyBalances(aggregateBalance)}
        </span>
      );
    }

    // Single currency balance (already normalized in calculateAggregateBalance)
    const displayBalance = aggregateBalance as number;
    
    // Get the first account's currency as default, or use USD
    const currency = group.accounts?.[0]?.currency || "USD";
    
    return (
      <span className={`text-sm font-medium ${colorClass}`}>
        {formatCurrencyAmountDetail(displayBalance, currency)}
      </span>
    );
  };

  return (
    <div className="mb-2">
      {/* Group Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 rounded-md hover:bg-gray-200">
        <div className="flex items-center flex-1 cursor-pointer" onClick={onToggle}>
          {/* Expand/Collapse Icon */}
          <span className="mr-2 text-gray-600">
            {isExpanded ? (
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
          <span className="font-semibold text-gray-900">{group.name}</span>
          
          {/* Account Count */}
          <span className="ml-2 text-sm text-gray-500">
            ({group.accounts?.length || 0})
          </span>
        </div>

        {/* Aggregate Balance */}
        <div className="flex items-center gap-3">
          {renderBalance()}
          
          {/* Move Up Button */}
          {onMoveUp && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              disabled={isFirst}
              className="text-gray-600 hover:text-gray-800 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Move group up"
              title="Move up"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </button>
          )}
          
          {/* Move Down Button */}
          {onMoveDown && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              disabled={isLast}
              className="text-gray-600 hover:text-gray-800 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Move group down"
              title="Move down"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
          
          {/* Edit Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="text-blue-600 hover:text-blue-800 text-sm"
            aria-label="Edit group"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          
          {/* Delete Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteClick();
            }}
            className="text-red-600 hover:text-red-800 text-sm"
            aria-label="Delete group"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Accounts List (shown when expanded) */}
      {isExpanded && group.accounts && group.accounts.length > 0 && (
        <div className="ml-6 mt-2">
          <table className="min-w-full divide-y divide-gray-200 table-fixed">
            <colgroup>
              <col className="w-[35%]" />
              {group.accountType === AccountType.User && <col className="w-[15%]" />}
              <col className="w-[20%]" />
              {group.accountType === AccountType.User && <col className="w-[10%]" />}
              <col className="w-[20%]" />
            </colgroup>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                {group.accountType === AccountType.User && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {group.accountType === AccountType.Category ? "Balances" : "Balance"}
                </th>
                {group.accountType === AccountType.User && (
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
              {group.accounts.map((account) => (
                <tr 
                  key={account.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/accounts/${account.id}/transactions`)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {account.name}
                  </td>
                  {group.accountType === AccountType.User && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {account.subtype}
                    </td>
                  )}
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${getBalanceColor(account)}`}>
                    {formatBalances(account)}
                  </td>
                  {group.accountType === AccountType.User && (
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
                      {onAccountMove && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Remove "${account.name}" from "${group.name}"?`)) {
                              onAccountMove(account.id, null);
                            }
                          }}
                          className="text-red-600 hover:text-red-800"
                          aria-label="Remove from group"
                          title="Remove from group"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state when expanded but no accounts */}
      {isExpanded && (!group.accounts || group.accounts.length === 0) && (
        <div className="ml-6 mt-1 px-4 py-2 text-sm text-gray-500 italic">
          No accounts in this group
        </div>
      )}
    </div>
  );
};
