import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ManualTransactionModal } from "../components/ManualTransactionModal";
import { ImportTransactionsWizard } from "../components/ImportTransactionsWizard";
import { TransferModal } from "../components/TransferModal";

// Modal for setting opening balance for the current account
const SetOpeningBalanceModal: React.FC<{
  accountId: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ accountId, onClose, onSuccess }) => {
  const [currentBalance, setCurrentBalance] = React.useState<number | null>(
    null
  );
  const [desiredBalance, setDesiredBalance] = React.useState<string>("");
  const [entryDate, setEntryDate] = React.useState(
    new Date().toISOString().split("T")[0]
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    const fetchCurrentBalance = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const lines = await window.electron.ipcRenderer.invoke(
          "get-transactions",
          accountId
        );
        const sum = lines.reduce(
          (total: number, line: { amount: number }) => total + line.amount,
          0
        );
        setCurrentBalance(Math.round(sum * 100) / 100);
      } catch (err) {
        setError("Failed to fetch current balance.");
        setCurrentBalance(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCurrentBalance();
  }, [accountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (currentBalance === null) return;

    const desired = Math.round(parseFloat(desiredBalance || "0") * 100) / 100;
    const diff = desired - currentBalance;

    if (isNaN(desired) || diff === 0) {
      setError("Please enter a balance different from the current balance.");
      return;
    }

    setIsSubmitting(true);
    try {
      await window.electron.ipcRenderer.invoke("create-opening-balance-entry", {
        balances: [{ accountId, balance: diff }],
        entryDate,
      });
      setDesiredBalance("");
      onSuccess();
      onClose();
    } catch (err) {
      setError("Failed to save opening balance.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 relative">
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 className="text-xl font-bold mb-4">Set Opening Balance</h2>
        {isLoading ? (
          <div className="text-gray-500">Loading balance...</div>
        ) : (
          <>
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-2">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  As of date
                </label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Balance
                </label>
                <div className="text-gray-800 font-mono">
                  ${currentBalance?.toFixed(2) ?? "0.00"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Desired Opening Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={desiredBalance}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (val !== "") {
                      const rounded = Math.round(parseFloat(val) * 100) / 100;
                      val = rounded.toString();
                    }
                    setDesiredBalance(val);
                  }}
                  className="block w-full rounded-md border-gray-300 pl-2 pr-2 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  placeholder="0.00"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
}

// Modal for creating a checkpoint for the current account
const CreateCheckpointModal: React.FC<{
  accountId: string;
  onClose: () => void;
}> = ({ accountId, onClose }) => {
  const [form, setForm] = React.useState({
    date: new Date().toISOString().split("T")[0],
    balance: "",
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!accountId || !form.balance) return;

    setIsSubmitting(true);
    try {
      const roundedBalance = Math.round(parseFloat(form.balance) * 100) / 100;
      const result = await window.electron.ipcRenderer.invoke(
        "create-checkpoint",
        {
          accountId,
          date: form.date,
          balance: roundedBalance,
          description: form.description || undefined,
        }
      );
      if (result.success) {
        setForm({
          date: new Date().toISOString().split("T")[0],
          balance: "",
          description: "",
        });
        alert("Checkpoint created successfully!");
        onClose();
      } else {
        setError(result.error || "Failed to create checkpoint");
      }
    } catch (err) {
      setError("Failed to create checkpoint.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 relative">
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 className="text-xl font-bold mb-4">Create Checkpoint</h2>
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-2">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={form.date}
              onChange={(e) =>
                setForm({
                  ...form,
                  date: e.target.value,
                })
              }
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Balance
            </label>
            <div className="flex items-center gap-2 rounded-md shadow-sm border border-gray-300 px-3">
              <span className="text-gray-500 sm:text-sm">$</span>
              <input
                type="number"
                step="0.01"
                value={form.balance}
                onChange={(e) => {
                  let val = e.target.value;
                  if (val !== "") {
                    const rounded = Math.round(parseFloat(val) * 100) / 100;
                    val = rounded.toString();
                  }
                  setForm({
                    ...form,
                    balance: val,
                  });
                }}
                className="block w-full rounded-md border-none focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                placeholder="0.00"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description: e.target.value,
                })
              }
              rows={3}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              placeholder="Enter a description for this checkpoint..."
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create Checkpoint"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export interface JournalEntry {
  id: string;
  date: string;
  postingDate?: string;
  description?: string;
  lines: JournalLine[];
}

export interface JournalLine {
  id: string;
  entryId: string;
  accountId: string;
  amount: number;
  description?: string;
  entry: JournalEntry;
  account: Account;
}

export const AccountTransactionsPage: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const [transactions, setTransactions] = useState<JournalLine[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showOpenBalanceModal, setShowOpenBalanceModal] = useState(false);
  const [showCheckpointModal, setShowCheckpointModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [editTransaction, setEditTransaction] = useState<JournalLine | null>(
    null
  );
  
  // Date filtering state
  const [transactionDateFrom, setTransactionDateFrom] = useState<string>("");
  const [transactionDateTo, setTransactionDateTo] = useState<string>("");
  const [postingDateFrom, setPostingDateFrom] = useState<string>("");
  const [postingDateTo, setPostingDateTo] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const fetchTransactions = async () => {
    if (!accountId) return;
    try {
      const txs = await window.electron.ipcRenderer.invoke(
        "get-transactions",
        accountId
      );
      setTransactions(txs);
    } catch (err) {
      console.error("Failed to fetch transactions", err);
    }
  };

  // Filter transactions based on date filters
  const filteredTransactions = React.useMemo(() => {
    return transactions.filter((line) => {
      const transactionDate = line.entry.date;
      const postingDate = line.entry.postingDate || line.entry.date;

      // Filter by transaction date range
      if (transactionDateFrom && transactionDate < transactionDateFrom) {
        return false;
      }
      if (transactionDateTo && transactionDate > transactionDateTo) {
        return false;
      }

      // Filter by posting date range
      if (postingDateFrom && postingDate < postingDateFrom) {
        return false;
      }
      if (postingDateTo && postingDate > postingDateTo) {
        return false;
      }

      return true;
    });
  }, [transactions, transactionDateFrom, transactionDateTo, postingDateFrom, postingDateTo]);

  const fetchAccount = async () => {
    try {
      const accounts: Account[] = await window.electron.ipcRenderer.invoke(
        "get-accounts"
      );
      setAccount(accounts.find((a) => a.id === accountId) || null);
    } catch (err) {
      setAccount(null);
    }
  };

  useEffect(() => {
    fetchAccount();
    fetchTransactions();
    // eslint-disable-next-line
  }, [accountId]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">
          Transactions for {account?.name || "Account"}
        </h1>
        <div className="flex gap-2 items-center">
          {/* Dropdown for less-used actions */}
          <div className="relative group">
            <button
              className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md shadow-sm text-sm font-medium hover:bg-gray-50 focus:outline-none"
              type="button"
              aria-haspopup="true"
              aria-expanded="false"
            >
              More Actions
              <svg
                className="ml-2 h-4 w-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 20 20"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 7l3-3 3 3m0 6l-3 3-3-3"
                />
              </svg>
            </button>
            <div className="absolute right-0 z-10 mt-2 w-48 origin-top-right bg-white border border-gray-200 rounded-md shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto transition-opacity duration-150">
              <div className="py-1">
                <button
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setShowOpenBalanceModal(true)}
                  type="button"
                >
                  Set Opening Balance
                </button>
                <button
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setShowCheckpointModal(true)}
                  type="button"
                >
                  Create Checkpoint
                </button>
              </div>
            </div>
          </div>
          {/* Primary action buttons */}
          <button
            className="px-4 py-2 bg-primary-600 text-white rounded-md shadow-sm text-sm font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            onClick={() => setShowManualModal(true)}
            type="button"
          >
            Add Transaction
          </button>
          <button
            className="px-4 py-2 bg-primary-600 text-white rounded-md shadow-sm text-sm font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            onClick={() => setShowTransferModal(true)}
            type="button"
          >
            Transfer Money
          </button>
          <button
            className="px-4 py-2 bg-primary-600 text-white rounded-md shadow-sm text-sm font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            onClick={() => setShowImportModal(true)}
            type="button"
          >
            Import Transactions
          </button>
        </div>
      </div>
      <div className="bg-white shadow rounded-lg p-6">
        {/* Date Filters */}
        <div className="mb-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            type="button"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          
          {showFilters && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Transaction Date Range</h3>
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    value={transactionDateFrom}
                    onChange={(e) => setTransactionDateFrom(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="From"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={transactionDateTo}
                    onChange={(e) => setTransactionDateTo(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="To"
                  />
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Posting Date Range</h3>
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    value={postingDateFrom}
                    onChange={(e) => setPostingDateFrom(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="From"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="date"
                    value={postingDateTo}
                    onChange={(e) => setPostingDateTo(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    placeholder="To"
                  />
                </div>
              </div>
              
              <div className="md:col-span-2 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setTransactionDateFrom("");
                    setTransactionDateTo("");
                    setPostingDateFrom("");
                    setPostingDateTo("");
                  }}
                  className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  type="button"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transaction Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Posting Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount / Exchange Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-4 text-gray-500">
                    {transactions.length === 0 ? "No transactions found." : "No transactions match the current filters."}
                  </td>
                </tr>
              )}
              {filteredTransactions.map((line) => {
                // Find the "other" line in the same entry (the other side of the double-entry)
                const otherLine = line.entry?.lines?.find(
                  (l: any) => l.accountId !== line.accountId
                );
                const categoryName = otherLine?.account?.name || "—";
                return (
                  <tr
                    key={line.id}
                    className={
                      categoryName === "Uncategorized Income" ||
                      categoryName === "Uncategorized Expense"
                        ? "bg-yellow-50 border-l-4 border-yellow-400"
                        : "border-b border-gray-200"
                    }
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {/* Display transaction date string as-is to avoid timezone shift */}
                      {typeof line.entry.date === "string"
                        ? line.entry.date
                        : ""}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {/* Display posting date, show only if different from transaction date */}
                      {line.entry.postingDate && line.entry.postingDate !== line.entry.date ? (
                        <span className="text-blue-600">{line.entry.postingDate}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {/* Multi-currency transfer display */}
                      {(() => {
                        const otherLine = line.entry?.lines?.find(
                          (l: any) => l.accountId !== line.accountId
                        );
                        const isUser = (acc: any) =>
                          acc?.type === "user" || acc?.type === "User";
                        const isTransfer =
                          otherLine &&
                          isUser(line.account) &&
                          isUser(otherLine.account) &&
                          line.account.currency !== otherLine.account.currency;
                        if (isTransfer) {
                          // Show both sides and exchange rate
                          const thisAmt = line.amount;
                          const otherAmt = otherLine.amount;
                          const thisCur = line.account.currency;
                          const otherCur = otherLine.account.currency;
                          // Avoid division by zero
                          const rate =
                            Math.abs(thisAmt) > 0
                              ? Math.abs(otherAmt / thisAmt)
                              : 1;
                          return (
                            <div>
                              <div>
                                {thisAmt.toFixed(2)} {thisCur}
                              </div>
                              <div>
                                {otherAmt.toFixed(2)} {otherCur}
                              </div>
                              <div className="text-xs text-gray-500">
                                Exchange Rate: {rate.toFixed(6)} ({thisCur} →{" "}
                                {otherCur})
                              </div>
                            </div>
                          );
                        } else {
                          // Regular transaction
                          return (
                            <span>
                              {line.amount.toFixed(2)} {line.account.currency}
                            </span>
                          );
                        }
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {line.description || line.entry.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {categoryName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        className="text-primary-600 hover:underline"
                        onClick={() => setEditTransaction(line)}
                        type="button"
                        aria-label="Edit transaction"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {showManualModal && (
        <ManualTransactionModal
          accountId={accountId!}
          onClose={() => setShowManualModal(false)}
          onSuccess={fetchTransactions}
        />
      )}
      {editTransaction && (
        <ManualTransactionModal
          accountId={accountId!}
          transaction={editTransaction}
          onClose={() => setEditTransaction(null)}
          onSuccess={() => {
            setEditTransaction(null);
            fetchTransactions();
          }}
        />
      )}
      {showImportModal && (
        <ImportTransactionsWizard
          accountId={accountId!}
          onClose={() => setShowImportModal(false)}
          onSuccess={fetchTransactions}
        />
      )}
      {showOpenBalanceModal && accountId && (
        <SetOpeningBalanceModal
          accountId={accountId}
          onClose={() => setShowOpenBalanceModal(false)}
          onSuccess={fetchTransactions}
        />
      )}
      {showCheckpointModal && accountId && (
        <CreateCheckpointModal
          accountId={accountId}
          onClose={() => setShowCheckpointModal(false)}
        />
      )}
      {showTransferModal && accountId && (
        <TransferModal
          fromAccountId={accountId}
          onClose={() => setShowTransferModal(false)}
          onSuccess={() => {
            fetchTransactions();
            fetchAccount();
          }}
        />
      )}
    </div>
  );
};
