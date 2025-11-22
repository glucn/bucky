import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Account } from "../types";
import { AccountModal } from "../components/AccountModal";
import { useAccounts } from "../context/AccountsContext";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";
import { normalizeAccountBalance } from "../utils/displayNormalization";

export const Accounts: React.FC = () => {
  const { accounts, refreshAccounts } = useAccounts();
  // Filter out category accounts - only show user and system accounts
  const nonCategoryAccounts = React.useMemo(
    () => accounts.filter((a) => a.type !== AccountType.Category),
    [accounts]
  );
  const [archivedAccounts, setArchivedAccounts] = useState<Account[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [accountBalances, setAccountBalances] = useState<
    Record<string, number>
  >({});
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(
    null
  );
  const [archivingAccountId, setArchivingAccountId] = useState<string | null>(
    null
  );
  const [restoringAccountId, setRestoringAccountId] = useState<string | null>(
    null
  );
  const [checkpointInfo, setCheckpointInfo] = useState<
    Record<string, { hasCheckpoints: boolean; latestCheckpoint?: any }>
  >({});

  useEffect(() => {
    // Only set archived accounts, as active accounts come from context
    // Filter out category accounts
    const fetchArchived = async () => {
      const allAccounts = await window.electron.ipcRenderer.invoke(
        "get-accounts",
        true // include archived
      );
      setArchivedAccounts(
        allAccounts.filter(
          (a: Account) => a.isArchived && a.type !== AccountType.Category
        )
      );
    };
    fetchArchived();
  }, [accounts]);

  // Fetch checkpoint information for all accounts
  useEffect(() => {
    const fetchCheckpointInfo = async () => {
      const checkpointData: Record<
        string,
        { hasCheckpoints: boolean; latestCheckpoint?: any }
      > = {};

      for (const account of [...nonCategoryAccounts, ...archivedAccounts]) {
        try {
          const result = await window.electron.ipcRenderer.invoke(
            "get-latest-checkpoint-for-account",
            account.id
          );
          if (result.success && result.checkpoint) {
            checkpointData[account.id] = {
              hasCheckpoints: true,
              latestCheckpoint: result.checkpoint,
            };
          } else {
            checkpointData[account.id] = { hasCheckpoints: false };
          }
        } catch (error) {
          console.error(
            `Error fetching checkpoint info for account ${account.id}:`,
            error
          );
          checkpointData[account.id] = { hasCheckpoints: false };
        }
      }
      setCheckpointInfo(checkpointData);
    };

    if (nonCategoryAccounts.length > 0 || archivedAccounts.length > 0) {
      fetchCheckpointInfo();
    }
  }, [nonCategoryAccounts, archivedAccounts]);

  // fetchAccounts removed; use refreshAccounts and fetchArchived instead

  // Compute balances for all accounts (using checkpoint-aware balance calculation)
  useEffect(() => {
    const fetchAllBalances = async () => {
      const balances: Record<string, number> = {};
      for (const account of [...nonCategoryAccounts, ...archivedAccounts]) {
        try {
          const result = await window.electron.ipcRenderer.invoke(
            "get-account-balance",
            account.id
          );
          if (result.success) {
            balances[account.id] = result.balance;
          } else {
            // Fallback to old method if checkpoint balance fails
            const lines = await window.electron.ipcRenderer.invoke(
              "get-transactions",
              account.id
            );
            balances[account.id] = lines.reduce(
              (sum: number, line: { amount: number }) => sum + line.amount,
              0
            );
          }
        } catch (error) {
          console.error(
            `Error fetching balance for account ${account.id}:`,
            error
          );
          balances[account.id] = 0;
        }
      }
      setAccountBalances(balances);
    };
    if (nonCategoryAccounts.length > 0 || archivedAccounts.length > 0) {
      fetchAllBalances();
    }
  }, [nonCategoryAccounts, archivedAccounts]);

  // Account creation now handled in AccountModal

  const handleDeleteOrArchive = async (account: Account) => {
    // Check if account can be deleted
    const result = await window.electron.ipcRenderer.invoke(
      "can-delete-account",
      account.id
    );
    if (result.canDelete) {
      // Confirm hard delete
      if (
        confirm(
          `Are you sure you want to delete the account "${account.name}"? This action cannot be undone.`
        )
      ) {
        setDeletingAccountId(account.id);
        const delResult = await window.electron.ipcRenderer.invoke(
          "delete-account",
          account.id
        );
        setDeletingAccountId(null);
        if (delResult.success) {
          alert("Account deleted successfully");
          await refreshAccounts();
        } else {
          alert(`Failed to delete account: ${delResult.error}`);
        }
      }
    } else {
      // Prompt to archive
      if (
        confirm(
          `The account "${account.name}" has ${result.transactionCount} transaction(s).\nYou cannot delete it, but you can archive it.\nArchived accounts are hidden from active lists but preserved for reporting.\n\nDo you want to archive this account?`
        )
      ) {
        setArchivingAccountId(account.id);
        const archResult = await window.electron.ipcRenderer.invoke(
          "archive-account",
          account.id
        );
        setArchivingAccountId(null);
        if (archResult.success) {
          alert("Account archived successfully");
          await refreshAccounts();
        } else {
          alert(`Failed to archive account: ${archResult.error}`);
        }
      }
    }
  };

  const handleRestore = async (account: Account) => {
    setRestoringAccountId(account.id);
    const result = await window.electron.ipcRenderer.invoke(
      "restore-account",
      account.id
    );
    setRestoringAccountId(null);
    if (result.success) {
      alert("Account restored successfully");
      await refreshAccounts();
    } else {
      alert(`Failed to restore account: ${result.error}`);
    }
  };

  // Helper function to get normalized balance for display
  const getNormalizedBalance = (account: Account): number => {
    const rawBalance = accountBalances[account.id] ?? 0;
    const accountSubtype = account.subtype as AccountSubtype;
    return normalizeAccountBalance(rawBalance, account.type, accountSubtype);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-medium text-gray-900">Your Accounts</h2>
            <button
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              onClick={() => setShowAccountModal(true)}
            >
              Add New Account
            </button>
            <AccountModal
              isOpen={showAccountModal}
              onClose={() => setShowAccountModal(false)}
              onAccountCreated={refreshAccounts}
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={() => setShowArchived((v) => !v)}
                className="mr-2"
              />
              Show Archived
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Currency
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Checkpoints
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {nonCategoryAccounts.map((account) => (
                <tr key={account.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {account.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {(account.type || "Unknown").charAt(0).toUpperCase() +
                      (account.type || "Unknown").slice(1)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span 
                      className={`font-medium ${
                        getNormalizedBalance(account) >= 0 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}
                      aria-label={getNormalizedBalance(account) >= 0 ? 'Positive amount' : 'Negative amount'}
                    >
                      {getNormalizedBalance(account).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {account.currency}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {checkpointInfo[account.id]?.hasCheckpoints ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✓ Active
                        </span>
                        {checkpointInfo[account.id]?.latestCheckpoint && (
                          <span className="text-xs text-gray-500">
                            {new Date(
                              checkpointInfo[account.id].latestCheckpoint.date
                            ).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">None</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex gap-2">
                      <Link
                        to={`/checkpoints?account=${account.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Manage
                      </Link>
                      <button
                        className={`text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed`}
                        onClick={() => handleDeleteOrArchive(account)}
                        disabled={
                          deletingAccountId === account.id ||
                          archivingAccountId === account.id
                        }
                      >
                        {deletingAccountId === account.id
                          ? "Deleting..."
                          : archivingAccountId === account.id
                          ? "Archiving..."
                          : "Delete / Archive"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showArchived && archivedAccounts.length > 0 && (
          <div className="mt-8">
            <h3 className="text-md font-semibold text-gray-700 mb-2">
              Archived Accounts
            </h3>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Currency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Checkpoints
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {archivedAccounts.map((account) => (
                  <tr key={account.id} className="opacity-60">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {account.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {(account.type || "Unknown").charAt(0).toUpperCase() +
                        (account.type || "Unknown").slice(1)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span 
                        className={`font-medium ${
                          getNormalizedBalance(account) >= 0 
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`}
                        aria-label={getNormalizedBalance(account) >= 0 ? 'Positive amount' : 'Negative amount'}
                      >
                        {getNormalizedBalance(account).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {account.currency}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {checkpointInfo[account.id]?.hasCheckpoints ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            ✓ Active
                          </span>
                          {checkpointInfo[account.id]?.latestCheckpoint && (
                            <span className="text-xs text-gray-500">
                              {new Date(
                                checkpointInfo[account.id].latestCheckpoint.date
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        className={`text-green-600 hover:text-green-900 disabled:opacity-50 disabled:cursor-not-allowed`}
                        onClick={() => handleRestore(account)}
                        disabled={restoringAccountId === account.id}
                      >
                        {restoringAccountId === account.id
                          ? "Restoring..."
                          : "Restore"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
