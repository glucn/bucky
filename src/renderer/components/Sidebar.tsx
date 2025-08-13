import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAccounts } from "../context/AccountsContext";
import AccountNavItem from "./AccountNavItem";
import AccountManagementButton from "./AccountManagementButton";
import { AccountType } from "../../shared/accountTypes";

const Sidebar: React.FC = () => {
  const { accounts, loading, error } = useAccounts();
  const location = useLocation();

  // Extract selected accountId from the current path
  const match = location.pathname.match(/^\/accounts\/([^/]+)/);
  const selectedAccountId = match ? match[1] : null;

  // Filter to only user accounts
  const userAccounts = accounts.filter((account) => account.type === AccountType.User);
  /* Removed per-account balance fetching and local accountBalances state */

  return (
    <aside className="flex flex-col min-h-0 w-64 bg-white border-r shadow-md p-4 flex-shrink-0">
      <div className="flex-1 overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">Accounts</h2>
        {loading && <div className="text-gray-500">Loading accounts...</div>}
        {error && <div className="text-red-500">Failed to load accounts.</div>}
        {!loading && !error && userAccounts.length === 0 && (
          <div className="text-gray-400">No user accounts found.</div>
        )}
        {!loading && !error && userAccounts.map((account: typeof accounts[0]) => (
          <AccountNavItem
            key={account.id}
            account={account}
            selected={account.id === selectedAccountId}
            balance={account.balance}
          />
        ))}
      </div>
      <div className="mt-4">
        <AccountManagementButton />
      </div>
    </aside>
  );
};

export default Sidebar;