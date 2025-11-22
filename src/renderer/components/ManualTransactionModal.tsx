import React, { useState } from "react";

import { JournalLine } from "../pages/AccountTransactionsPage";
import { normalizeTransactionAmount } from "../utils/displayNormalization";
import { formatNormalizedTransactionAmount } from "../utils/currencyUtils";

interface ManualTransactionModalProps {
  accountId: string;
  onClose: () => void;
  onSuccess: () => void;
  transaction?: JournalLine; // Optional, for editing
}

interface NewTransaction {
  toAccountId: string;
  amount: number;
  date: string;
  postingDate: string | null;
  description: string;
}

import { useAccounts } from "../context/AccountsContext";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";

export const ManualTransactionModal: React.FC<ManualTransactionModalProps> = ({
  accountId,
  onClose,
  onSuccess,
  transaction,
}) => {
  const { accounts, refreshAccounts } = useAccounts();
  const isEdit = !!transaction;
  
  // Lookup source account
  const fromAccount = accounts.find((a) => a.id === accountId);
  
  const [newTransaction, setNewTransaction] = useState<NewTransaction>({
    toAccountId: isEdit
      ? (() => {
          // Find the "other" account in the entry
          const otherLine = transaction?.entry?.lines?.find(
            (l: any) => l.accountId !== transaction.accountId
          );
          return otherLine?.accountId || "";
        })()
      : "",
    amount: isEdit && transaction && fromAccount
      ? (() => {
          // Use normalized amount for display when editing
          const normalizedAmount = normalizeTransactionAmount(
            transaction.amount,
            fromAccount.type,
            fromAccount.subtype as AccountSubtype,
            true
          );
          // Always show as positive in the input field
          return Math.abs(normalizedAmount);
        })()
      : 0,
    date: isEdit
      ? new Date(transaction?.entry?.date ?? "").toISOString().split("T")[0]
      : (() => {
          const now = new Date();
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, "0");
          const dd = String(now.getDate()).padStart(2, "0");
          return `${yyyy}-${mm}-${dd}`;
        })(),
    postingDate: isEdit
      ? (transaction?.entry?.postingDate || null)
      : null,
    description: isEdit
      ? transaction?.description || transaction?.entry?.description || ""
      : "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lookup target account
  const toAccount = accounts.find((a) => a.id === newTransaction.toAccountId);

  // When transaction date changes, update posting date to match if posting date is set and before transaction date
  React.useEffect(() => {
    if (newTransaction.postingDate && newTransaction.postingDate < newTransaction.date) {
      setNewTransaction((prev) => ({
        ...prev,
        postingDate: newTransaction.date,
      }));
    }
    // eslint-disable-next-line
  }, [newTransaction.date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate posting date is not before transaction date (if provided)
    if (newTransaction.postingDate && newTransaction.postingDate < newTransaction.date) {
      alert("Posting date cannot be before transaction date");
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (isEdit && transaction) {
        // Update transaction
        await window.electron.ipcRenderer.invoke("update-transaction", {
          lineId: transaction.id,
          fromAccountId: accountId,
          ...newTransaction,
        });
      } else {
        // Add transaction, handle potential duplicate
        // Determine transactionType
        let transactionType: "income" | "expense" | "transfer" = "transfer";
        if (fromAccount && toAccount) {
          if (fromAccount.type === AccountType.User && toAccount.type === AccountType.Category) {
            if (toAccount.subtype === "asset") {
              transactionType = "income";
            } else if (toAccount.subtype === "liability") {
              transactionType = "expense";
            } else {
              transactionType = "expense";
            }
          } else if (fromAccount.type === AccountType.Category && toAccount.type === AccountType.User) {
            if (fromAccount.subtype === "asset") {
              transactionType = "expense";
            } else if (fromAccount.subtype === "liability") {
              transactionType = "income";
            } else {
              transactionType = "expense";
            }
          } else {
            transactionType = "transfer";
          }
        }
        let result = await window.electron.ipcRenderer.invoke("add-transaction", {
          fromAccountId: accountId,
          ...newTransaction,
          transactionType,
        });
        if (result && result.skipped && result.reason === "potential_duplicate") {
          // Show warning and ask for confirmation
          const confirmMsg =
            "A transaction with the same date, accounts, amount, and description already exists.\n\n" +
            "Existing transaction:\n" +
            JSON.stringify(result.existing, null, 2) +
            "\n\nDo you want to add this transaction anyway?";
          if (window.confirm(confirmMsg)) {
            // Retry with forceDuplicate
            result = await window.electron.ipcRenderer.invoke("add-transaction", {
              fromAccountId: accountId,
              ...newTransaction,
              forceDuplicate: true,
              transactionType,
            });
          } else {
            setIsSubmitting(false);
            return;
          }
        }
      }
      setIsSubmitting(false);
      await refreshAccounts();
      onSuccess();
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      alert(isEdit ? "Failed to update transaction" : "Failed to add transaction");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6 relative">
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 className="text-xl font-bold mb-4">
          {isEdit ? "Edit Transaction" : "Add Transaction"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="toAccountId"
              className="block text-sm font-medium text-gray-700"
            >
              Category
            </label>
            <select
              id="toAccountId"
              value={newTransaction.toAccountId}
              onChange={(e) => {
                setNewTransaction((prev) => ({
                  ...prev,
                  toAccountId: e.target.value,
                }));
              }}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
            >
              <option value="" disabled>
                {accounts.length === 0 ? "Loading..." : "Select a category"}
              </option>
              {accounts
                .filter((acc) => acc.type === AccountType.Category)
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="amount"
              className="block text-sm font-medium text-gray-700"
            >
              Amount {fromAccount?.currency ? `(${fromAccount.currency})` : ""}
            </label>
            <input
              id="amount"
              type="number"
              value={newTransaction.amount}
              onChange={(e) =>
                setNewTransaction((prev) => ({
                  ...prev,
                  amount: parseFloat(e.target.value),
                }))
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
              min="0"
              step="0.01"
            />
            {fromAccount && (
              <p className="mt-1 text-xs text-gray-500">
                {fromAccount.subtype === 'asset'
                  ? 'Enter the amount as a positive number. It will be deducted from this account.'
                  : 'Enter the amount as a positive number. It will be added to this account\'s balance.'}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="date"
              className="block text-sm font-medium text-gray-700"
            >
              Transaction Date
            </label>
            <input
              id="date"
              type="date"
              value={newTransaction.date}
              onChange={(e) =>
                setNewTransaction((prev) => ({
                  ...prev,
                  date: e.target.value,
                }))
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
            />
          </div>
          <div>
            <label
              htmlFor="postingDate"
              className="block text-sm font-medium text-gray-700"
            >
              Posting Date (Optional)
            </label>
            <input
              id="postingDate"
              type="date"
              value={newTransaction.postingDate || ""}
              onChange={(e) =>
                setNewTransaction((prev) => ({
                  ...prev,
                  postingDate: e.target.value || null,
                }))
              }
              min={newTransaction.date}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            />
            {newTransaction.postingDate && newTransaction.postingDate < newTransaction.date && (
              <p className="mt-1 text-sm text-red-600">
                Posting date cannot be before transaction date
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700"
            >
              Description
            </label>
            <textarea
              id="description"
              value={newTransaction.description}
              onChange={(e) =>
                setNewTransaction((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              rows={2}
            />
          </div>

          {/* Transaction Preview with Normalized Amounts */}
          {fromAccount && toAccount && newTransaction.amount > 0 && (
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Transaction Preview</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">From: {fromAccount.name}</span>
                  <span className={`font-medium ${
                    fromAccount.subtype === 'asset' ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {formatNormalizedTransactionAmount(
                      -newTransaction.amount,
                      fromAccount.currency,
                      fromAccount.type,
                      fromAccount.subtype as AccountSubtype,
                      true,
                      { showSymbol: true, showCode: false }
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">To: {toAccount.name}</span>
                  <span className={`font-medium ${
                    toAccount.type === AccountType.Category && toAccount.subtype === 'asset'
                      ? 'text-green-600'
                      : toAccount.type === AccountType.Category && toAccount.subtype === 'liability'
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatNormalizedTransactionAmount(
                      newTransaction.amount,
                      toAccount.currency,
                      toAccount.type,
                      toAccount.subtype as AccountSubtype,
                      false,
                      { showSymbol: true, showCode: false }
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2 px-4 bg-primary-600 text-white rounded hover:bg-primary-700"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? isEdit
                ? "Saving..."
                : "Adding..."
              : isEdit
              ? "Save Changes"
              : "Add Transaction"}
          </button>
        </form>
      </div>
    </div>
  );
};