import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { TransactionModal } from "../components/TransactionModal";

// Modal for setting opening balance for the current account
const SetOpeningBalanceModal: React.FC<{
  accountId: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ accountId, onClose, onSuccess }) => {
  const [currentBalance, setCurrentBalance] = React.useState<number | null>(null);
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
                      const rounded =
                        Math.round(parseFloat(val) * 100) / 100;
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
      const roundedBalance =
        Math.round(parseFloat(form.balance) * 100) / 100;
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
                    const rounded =
                      Math.round(parseFloat(val) * 100) / 100;
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

interface JournalEntry {
  id: string;
  date: string;
  description?: string;
  lines: JournalLine[];
}

interface JournalLine {
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
  const [showModal, setShowModal] = useState(false);
  const [showOpenBalanceModal, setShowOpenBalanceModal] = useState(false);
  const [showCheckpointModal, setShowCheckpointModal] = useState(false);

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
              <svg className="ml-2 h-4 w-4 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 20 20">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7l3-3 3 3m0 6l-3 3-3-3" />
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
          {/* Primary action button */}
          <button
            className="px-4 py-2 bg-primary-600 text-white rounded-md shadow-sm text-sm font-medium hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            onClick={() => setShowModal(true)}
            type="button"
          >
            Add / Import Transactions
          </button>
        </div>
      </div>
      <div className="bg-white shadow rounded-lg p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-4 text-gray-500">
                    No transactions found.
                  </td>
                </tr>
              )}
              {transactions.map((line) => (
                <tr key={line.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(line.entry.date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {line.amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {line.description || line.entry.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showModal && (
        <TransactionModal
          accountId={accountId!}
          onClose={() => setShowModal(false)}
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
    </div>
  );
};