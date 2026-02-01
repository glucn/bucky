import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ManualTransactionModal } from "../components/ManualTransactionModal";
import { ImportTransactionsWizard } from "../components/ImportTransactionsWizard";
import { TransferModal } from "../components/TransferModal";
import { CreditCardSetupModal } from "../components/CreditCardSetupModal";
import { useAccounts } from "../context/AccountsContext";
import { formatTransactionCurrency } from "../utils/currencyUtils";
import { 
  normalizeTransactionAmount, 
  normalizeAccountBalance,
  getTransactionColorClass,
  getTransactionAriaLabel
} from "../utils/displayNormalization";
import { AccountType, AccountSubtype, toAccountType } from "../../shared/accountTypes";

// Modal for setting opening balance for the current account
const SetOpeningBalanceModal: React.FC<{
  accountId: string;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ accountId, onClose, onSuccess }) => {
  const [openingBalance, setOpeningBalance] = React.useState<number | null>(
    null
  );
  const [accountCurrency, setAccountCurrency] = React.useState<string>("USD");
  const [accountSubtype, setAccountSubtype] = React.useState<AccountSubtype>(
    AccountSubtype.Asset
  );
  const [desiredBalance, setDesiredBalance] = React.useState<string>("");
  const [entryDate, setEntryDate] = React.useState(
    new Date().toISOString().split("T")[0]
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    const fetchOpeningBalance = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const account = await window.electron.ipcRenderer.invoke(
          "get-account",
          accountId
        );
        setAccountCurrency(account?.currency || "USD");
        const subtype = (account?.subtype === "liability"
          ? AccountSubtype.Liability
          : AccountSubtype.Asset) as AccountSubtype;
        setAccountSubtype(subtype);

        const openingEntry = await window.electron.getOpeningBalance(accountId);
        if (openingEntry) {
          setOpeningBalance(openingEntry.displayAmount);
          setDesiredBalance(openingEntry.displayAmount.toString());
          setEntryDate(openingEntry.date);
        } else {
          setOpeningBalance(null);
          setDesiredBalance("");
          setEntryDate(new Date().toISOString().split("T")[0]);
        }
      } catch (err) {
        setError("Failed to fetch opening balance.");
        setOpeningBalance(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOpeningBalance();
  }, [accountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const desired = Math.round(parseFloat(desiredBalance || "0") * 100) / 100;

    if (isNaN(desired)) {
      setError("Please enter a valid opening balance.");
      return;
    }

    setIsSubmitting(true);
    try {
      await window.electron.setOpeningBalance({
        accountId,
        displayAmount: desired,
        asOfDate: entryDate,
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
          <div className="text-gray-500">Loading opening balance...</div>
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
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Opening Balance
                </label>
                <div className="text-gray-800 font-mono">
                  {openingBalance === null
                    ? "Not set"
                    : formatTransactionCurrency(openingBalance, accountCurrency)}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {accountSubtype === AccountSubtype.Liability
                    ? "Balance owed"
                    : "Opening Balance"}
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
  subtype: string;
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
  type?: string; // e.g., 'regular', 'currency_transfer'
  lines: JournalLine[];
}

export interface JournalLine {
  id: string;
  entryId: string;
  accountId: string;
  amount: number;
  currency: string;
  exchangeRate?: number; // Optional, for currency-transfer transactions
  description?: string;
  entry: JournalEntry;
  account: Account;
}

interface CreditCardMetrics {
  accountId: string;
  currentBalance: number;
  availableCredit: number;
  creditUtilization: number;
  minimumPayment: number;
  creditLimit: number;
}

export const AccountTransactionsPage: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const { refreshAccounts, accounts } = useAccounts();
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
  const [editTransferTransaction, setEditTransferTransaction] = useState<any>(null);

  // Helper function to detect if a transaction is a transfer (between two user accounts)
  const isTransferTransaction = (line: JournalLine): boolean => {
    if (!line.entry?.lines || line.entry.lines.length !== 2) return false;
    
    const allAccountIds = line.entry.lines.map((l: any) => l.accountId);
    const involvedAccounts = accounts.filter(acc => allAccountIds.includes(acc.id));
    
    // Transfer if both accounts are user accounts
    return involvedAccounts.length === 2 && 
           involvedAccounts.every(acc => acc.type === AccountType.User);
  };

  // Helper function to prepare transfer data for editing
  const prepareTransferEditData = (line: JournalLine) => {
    if (!line.entry?.lines) return null;
    
    const otherLine = line.entry.lines.find((l: any) => l.accountId !== line.accountId);
    if (!otherLine) return null;

    // Get account information to determine transfer direction correctly
    const currentAccount = accounts.find(acc => acc.id === line.accountId);
    const otherAccount = accounts.find(acc => acc.id === otherLine.accountId);
    
    if (!currentAccount || !otherAccount) return null;

    // Determine the actual transfer direction based on account types and amounts
    // For transfers, the "from" account should be the one that decreases (loses money)
    // and the "to" account should be the one that increases (receives money)
    
    let fromAccountId: string;
    let toAccountId: string;
    let amount: number;
    
    // For asset accounts: negative amount means money going out (from), positive means money coming in (to)
    // For liability accounts: positive amount means debt increasing (money coming in), negative means debt decreasing (money going out)
    
    if (currentAccount.subtype === 'asset') {
      if (line.amount < 0) {
        // Current asset account is losing money (from account)
        fromAccountId = line.accountId;
        toAccountId = otherLine.accountId;
        amount = Math.abs(line.amount);
      } else {
        // Current asset account is receiving money (to account)
        fromAccountId = otherLine.accountId;
        toAccountId = line.accountId;
        amount = Math.abs(line.amount);
      }
    } else {
      // For liability accounts (like credit cards), the logic is different
      if (line.amount > 0) {
        // Liability increasing (debt going up) means money was received/spent (current account is receiving)
        fromAccountId = otherLine.accountId;
        toAccountId = line.accountId;
        amount = Math.abs(line.amount);
      } else {
        // Liability decreasing (debt going down) means payment was made (current account is paying)
        fromAccountId = line.accountId;
        toAccountId = otherLine.accountId;
        amount = Math.abs(line.amount);
      }
    }

    return {
      id: line.id,
      entryId: line.entry.id,
      fromAccountId,
      toAccountId,
      amount,
      date: line.entry.date,
      description: line.description || line.entry.description || "",
      type: line.entry.type,
      amountFrom: line.entry.type === "currency_transfer" ? Math.abs(line.amount) : undefined,
      amountTo: line.entry.type === "currency_transfer" ? Math.abs(otherLine.amount) : undefined,
      exchangeRate: line.exchangeRate || otherLine.exchangeRate,
    };
  };

  // Handle edit transaction click
  const handleEditTransaction = (line: JournalLine) => {
    if (isTransferTransaction(line)) {
      const transferData = prepareTransferEditData(line);
      if (transferData) {
        setEditTransferTransaction(transferData);
      }
    } else {
      setEditTransaction(line);
    }
  };

  // Handle delete transaction click
  const handleDeleteTransaction = async (line: JournalLine) => {
    const confirmMessage = `Are you sure you want to delete this transaction?\n\nDate: ${line.entry.date}\nDescription: ${line.description || line.entry.description || 'No description'}\nAmount: ${formatTransactionCurrency(line.amount, line.currency)}\n\nThis action cannot be undone.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const result = await window.electron.ipcRenderer.invoke("delete-transaction", line.entry.id);
      
      if (result.success) {
        // Refresh the transactions and account data
        await fetchTransactions();
        await fetchAccount();
        await refreshAccounts();
      } else {
        alert(`Failed to delete transaction: ${result.error}`);
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
      alert("Failed to delete transaction. Please try again.");
    }
  };
  
  // Credit card state
  const [creditCardMetrics, setCreditCardMetrics] = useState<CreditCardMetrics | null>(null);
  const [isCreditCard, setIsCreditCard] = useState(false);
  const [showCreditCardSetupModal, setShowCreditCardSetupModal] = useState(false);
  const [creditCardProperties, setCreditCardProperties] = useState<any>(null);
  
  // Date filtering state
  const [transactionDateFrom, setTransactionDateFrom] = useState<string>("");
  const [transactionDateTo, setTransactionDateTo] = useState<string>("");
  const [postingDateFrom, setPostingDateFrom] = useState<string>("");
  const [postingDateTo, setPostingDateTo] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  
  // Reordering state
  const [reorderingEntryId, setReorderingEntryId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

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

  const handleMoveUp = async (entryId: string) => {
    setReorderingEntryId(entryId);
    setReorderError(null);
    try {
      const result = await window.electron.moveTransactionUp(entryId);
      if (result.success) {
        await fetchTransactions();
      } else {
        setReorderError(result.error || "Failed to move transaction up");
      }
    } catch (err) {
      setReorderError("Failed to move transaction up");
      console.error(err);
    } finally {
      setReorderingEntryId(null);
    }
  };

  const handleMoveDown = async (entryId: string) => {
    setReorderingEntryId(entryId);
    setReorderError(null);
    try {
      const result = await window.electron.moveTransactionDown(entryId);
      if (result.success) {
        await fetchTransactions();
      } else {
        setReorderError(result.error || "Failed to move transaction down");
      }
    } catch (err) {
      setReorderError("Failed to move transaction down");
      console.error(err);
    } finally {
      setReorderingEntryId(null);
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

  // Helper function to group transactions by date and determine position
  const getTransactionPositionInfo = React.useMemo(() => {
    const dateGroups = new Map<string, JournalLine[]>();
    
    // Group transactions by date
    filteredTransactions.forEach((line) => {
      const date = line.entry.date;
      if (!dateGroups.has(date)) {
        dateGroups.set(date, []);
      }
      dateGroups.get(date)!.push(line);
    });
    
    // Create position info map
    const positionInfo = new Map<string, { isFirst: boolean; isLast: boolean; isOnly: boolean }>();
    
    dateGroups.forEach((lines) => {
      const count = lines.length;
      lines.forEach((line, index) => {
        positionInfo.set(line.id, {
          isFirst: index === 0,
          isLast: index === count - 1,
          isOnly: count === 1,
        });
      });
    });
    
    return positionInfo;
  }, [filteredTransactions]);

  const fetchAccount = async () => {
    try {
      const accounts: Account[] = await window.electron.ipcRenderer.invoke(
        "get-accounts"
      );
      const foundAccount = accounts.find((a) => a.id === accountId) || null;
      setAccount(foundAccount);
      
      // Check if this account has credit card properties
      if (foundAccount) {
        checkIfCreditCard();
      } else {
        setIsCreditCard(false);
        setCreditCardMetrics(null);
      }
    } catch (err) {
      setAccount(null);
      setIsCreditCard(false);
      setCreditCardMetrics(null);
    }
  };

  const checkIfCreditCard = async () => {
    if (!accountId) return;
    try {
      const result = await window.electron.ipcRenderer.invoke(
        "get-credit-card-properties",
        accountId
      );
      if (result.success && result.properties) {
        setIsCreditCard(true);
        setCreditCardProperties(result.properties);
        fetchCreditCardMetrics();
      } else {
        setIsCreditCard(false);
        setCreditCardMetrics(null);
        setCreditCardProperties(null);
      }
    } catch (err) {
      setIsCreditCard(false);
      setCreditCardMetrics(null);
      setCreditCardProperties(null);
    }
  };

  const fetchCreditCardMetrics = async () => {
    if (!accountId) return;
    try {
      const result = await window.electron.ipcRenderer.invoke(
        "get-credit-card-metrics",
        accountId
      );
      if (result.success) {
        setCreditCardMetrics(result.metrics);
      }
    } catch (err) {
      console.error("Failed to fetch credit card metrics", err);
    }
  };

  useEffect(() => {
    fetchAccount();
    fetchTransactions();
    // eslint-disable-next-line
  }, [accountId]);

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 90) return "text-red-600";
    if (utilization >= 70) return "text-yellow-600";
    return "text-green-600";
  };

  const getUtilizationBgColor = (utilization: number) => {
    if (utilization >= 90) return "bg-red-100";
    if (utilization >= 70) return "bg-yellow-100";
    return "bg-green-100";
  };

  return (
    <div className="space-y-6" data-testid="transactions-page">
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
            data-testid="import-transactions-button"
          >
            Import Transactions
          </button>
        </div>
      </div>
      
      {/* Credit Card Metrics Section */}
      {isCreditCard && creditCardMetrics && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Credit Card Overview</h2>
            <button
              onClick={() => setShowCreditCardSetupModal(true)}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              type="button"
            >
              Edit Settings
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Current Balance */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500 mb-1">Current Balance</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatTransactionCurrency(creditCardMetrics.currentBalance, account?.currency || "USD")}
              </div>
            </div>
            
            {/* Credit Limit */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm font-medium text-gray-500 mb-1">Credit Limit</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatTransactionCurrency(creditCardMetrics.creditLimit, account?.currency || "USD")}
              </div>
            </div>
            
            {/* Available Credit */}
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm font-medium text-blue-700 mb-1">Available Credit</div>
              <div className="text-2xl font-bold text-blue-900">
                {formatTransactionCurrency(creditCardMetrics.availableCredit, account?.currency || "USD")}
              </div>
            </div>
            
            {/* Credit Utilization */}
            <div className={`${getUtilizationBgColor(creditCardMetrics.creditUtilization)} rounded-lg p-4`}>
              <div className="text-sm font-medium text-gray-700 mb-1">Credit Utilization</div>
              <div className={`text-2xl font-bold ${getUtilizationColor(creditCardMetrics.creditUtilization)}`}>
                {creditCardMetrics.creditUtilization.toFixed(1)}%
              </div>
              {creditCardMetrics.creditUtilization >= 70 && (
                <div className="text-xs text-gray-600 mt-1">
                  {creditCardMetrics.creditUtilization >= 90 ? "⚠️ Very High" : "⚠️ High"}
                </div>
              )}
            </div>
          </div>
          
          {/* Minimum Payment */}
          {creditCardMetrics.minimumPayment > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-yellow-800">Minimum Payment Due</div>
                  <div className="text-xs text-yellow-700 mt-1">Based on current balance</div>
                </div>
                <div className="text-xl font-bold text-yellow-900">
                  {formatTransactionCurrency(creditCardMetrics.minimumPayment, account?.currency || "USD")}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className="bg-white shadow rounded-lg p-6">
        {/* Reorder Error Display */}
        {reorderError && (
          <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded flex justify-between items-center">
            <span>{reorderError}</span>
            <button
              onClick={() => setReorderError(null)}
              className="text-red-700 hover:text-red-900 font-bold"
              type="button"
              aria-label="Close error"
            >
              ×
            </button>
          </div>
        )}
        
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
                const positionInfo = getTransactionPositionInfo.get(line.id);
                const isReordering = reorderingEntryId === line.entry.id;
                
                return (
                  <tr
                    key={line.id}
                    className={`group ${
                      categoryName === "Uncategorized Income" ||
                      categoryName === "Uncategorized Expense"
                        ? "bg-yellow-50 border-l-4 border-yellow-400"
                        : "border-b border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {/* Display transaction date string as-is to avoid timezone shift */}
                      {typeof line.entry.date === "string"
                        ? line.entry.date
                        : ""}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {/* Display posting date */}
                      {line.entry.postingDate ? (
                        line.entry.postingDate !== line.entry.date ? (
                          <span className="text-blue-600">{line.entry.postingDate}</span>
                        ) : (
                          <span>{line.entry.postingDate}</span>
                        )
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
                          line.currency !== otherLine.currency;
                        
                        // Get account type and subtype for normalization
                        const accountType = toAccountType(line.account?.type || "user");
                        const accountSubtype = (line.account?.subtype === "liability" 
                          ? AccountSubtype.Liability 
                          : AccountSubtype.Asset) as AccountSubtype;
                        
                        if (isTransfer) {
                          // Multi-currency transfer: Show both sides with normalization and exchange rate
                          const thisAmt = line.amount;
                          const otherAmt = otherLine.amount;
                          const thisCur = line.currency;
                          const otherCur = otherLine.currency;
                          
                          // Normalize amounts for display
                          const normalizedThisAmt = normalizeTransactionAmount(
                            thisAmt,
                            accountType,
                            accountSubtype,
                            true // This is the current account being viewed
                          );
                          
                          // Get other account's type and subtype for normalization
                          const otherAccountType = toAccountType(otherLine.account?.type || "user");
                          const otherAccountSubtype = (otherLine.account?.subtype === "liability"
                            ? AccountSubtype.Liability
                            : AccountSubtype.Asset) as AccountSubtype;
                          
                          const normalizedOtherAmt = normalizeTransactionAmount(
                            otherAmt,
                            otherAccountType,
                            otherAccountSubtype,
                            false // This is not the current account being viewed
                          );
                          
                          // Get visual indicators for this account
                          const colorClass = getTransactionColorClass(
                            thisAmt,
                            accountType,
                            accountSubtype,
                            true
                          );
                          const ariaLabel = getTransactionAriaLabel(
                            thisAmt,
                            accountType,
                            accountSubtype,
                            true
                          );
                          
                          // Avoid division by zero
                          const rate =
                            Math.abs(thisAmt) > 0
                              ? Math.abs(otherAmt / thisAmt)
                              : 1;
                          return (
                            <div>
                              <div className={`font-medium ${colorClass}`} aria-label={ariaLabel}>
                                {formatTransactionCurrency(normalizedThisAmt, thisCur)}
                              </div>
                              <div className="text-xs text-gray-400">
                                {formatTransactionCurrency(normalizedOtherAmt, otherCur)}
                              </div>
                              <div className="text-xs text-gray-500">
                                Exchange Rate: {rate.toFixed(6)} ({thisCur} →{" "}
                                {otherCur})
                              </div>
                            </div>
                          );
                        } else {
                          // Regular transaction - normalize and show currency from journal line
                          const normalizedAmount = normalizeTransactionAmount(
                            line.amount,
                            accountType,
                            accountSubtype,
                            true // This is the current account being viewed
                          );
                          
                          // Get visual indicators for styling
                          const colorClass = getTransactionColorClass(
                            line.amount,
                            accountType,
                            accountSubtype,
                            true
                          );
                          const ariaLabel = getTransactionAriaLabel(
                            line.amount,
                            accountType,
                            accountSubtype,
                            true
                          );
                          
                          return (
                            <span className={`font-medium ${colorClass}`} aria-label={ariaLabel}>
                              {formatTransactionCurrency(normalizedAmount, line.currency)}
                            </span>
                          );
                        }
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {line.description || line.entry.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>
                        <div>{categoryName}</div>
                        {/* Show currency if different from account currency */}
                        {otherLine && otherLine.currency && otherLine.currency !== line.currency && (
                          <div className="text-xs text-gray-400">
                            ({otherLine.currency})
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center gap-2">
                        <button
                          className="text-primary-600 hover:underline"
                          onClick={() => handleEditTransaction(line)}
                          type="button"
                          aria-label="Edit transaction"
                        >
                          Edit
                        </button>
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => handleDeleteTransaction(line)}
                          type="button"
                          aria-label="Delete transaction"
                        >
                          Delete
                        </button>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleMoveUp(line.entry.id)}
                            disabled={positionInfo?.isFirst || positionInfo?.isOnly || isReordering}
                            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-0 disabled:cursor-not-allowed"
                            type="button"
                            aria-label="Move transaction up"
                            title="Move up"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 15l7-7 7 7"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleMoveDown(line.entry.id)}
                            disabled={positionInfo?.isLast || positionInfo?.isOnly || isReordering}
                            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-0 disabled:cursor-not-allowed"
                            type="button"
                            aria-label="Move transaction down"
                            title="Move down"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
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
          onSuccess={async () => {
            await fetchTransactions();
            await refreshAccounts();
          }}
        />
      )}
      {editTransaction && (
        <ManualTransactionModal
          accountId={accountId!}
          transaction={editTransaction}
          onClose={() => setEditTransaction(null)}
          onSuccess={async () => {
            setEditTransaction(null);
            await fetchTransactions();
            await refreshAccounts();
          }}
        />
      )}
      {showImportModal && (
        <ImportTransactionsWizard
          accountId={accountId!}
          onClose={() => setShowImportModal(false)}
          onSuccess={async () => {
            await fetchTransactions();
            await refreshAccounts();
          }}
        />
      )}
    {showOpenBalanceModal && accountId && (
        <SetOpeningBalanceModal
          accountId={accountId}
          onClose={() => setShowOpenBalanceModal(false)}
          onSuccess={async () => {
            await fetchTransactions();
            await refreshAccounts();
          }}
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
          onSuccess={async () => {
            await fetchTransactions();
            await fetchAccount();
            await refreshAccounts();
          }}
        />
      )}
      {editTransferTransaction && (
        <TransferModal
          editTransaction={editTransferTransaction}
          onClose={() => setEditTransferTransaction(null)}
          onSuccess={async () => {
            setEditTransferTransaction(null);
            await fetchTransactions();
            await fetchAccount();
            await refreshAccounts();
          }}
        />
      )}
      {showCreditCardSetupModal && accountId && (
        <CreditCardSetupModal
          accountId={accountId}
          isOpen={showCreditCardSetupModal}
          onClose={() => setShowCreditCardSetupModal(false)}
          onSuccess={async () => {
            setShowCreditCardSetupModal(false);
            await checkIfCreditCard();
            await fetchCreditCardMetrics();
          }}
          existingProperties={creditCardProperties}
        />
      )}
    </div>
  );
};
