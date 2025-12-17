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
          // Show the actual normalized amount (can be negative for refunds)
          return normalizedAmount;
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
  
  // Separate state for amount display to allow empty string
  const [amountDisplay, setAmountDisplay] = useState<string>(
    isEdit && transaction && fromAccount
      ? (() => {
          const normalizedAmount = normalizeTransactionAmount(
            transaction.amount,
            fromAccount.type,
            fromAccount.subtype as AccountSubtype,
            true
          );
          return normalizedAmount.toString();
        })()
      : ""
  );

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
      // Determine transactionType (needed for both create and update)
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
      
      if (isEdit && transaction) {
        // Update transaction
        await window.electron.ipcRenderer.invoke("update-transaction", {
          lineId: transaction.id,
          fromAccountId: accountId,
          ...newTransaction,
          transactionType,
        });
      } else {
        // Add transaction, handle potential duplicate
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
              value={amountDisplay}
              onChange={(e) => {
                setAmountDisplay(e.target.value);
                setNewTransaction((prev) => ({
                  ...prev,
                  amount: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0,
                }));
              }}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
              step="0.01"
            />
            {fromAccount && (
              <p className="mt-1 text-xs text-gray-500">
                Enter positive amounts for expenses/payments, negative amounts for refunds/returns.
                {fromAccount.subtype === 'asset'
                  ? ' Positive amounts will be deducted from this account.'
                  : ' Positive amounts will be added to this account\'s balance.'}
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
          {fromAccount && toAccount && newTransaction.amount !== 0 && (() => {
            // Determine transaction type for preview
            let transactionType: "income" | "expense" | "transfer" = "transfer";
            if (fromAccount.type === AccountType.User && toAccount.type === AccountType.Category) {
              transactionType = toAccount.subtype === 'asset' ? 'income' : 'expense';
            } else if (fromAccount.type === AccountType.Category && toAccount.type === AccountType.User) {
              transactionType = fromAccount.subtype === 'asset' ? 'expense' : 'income';
            }

            // Calculate the actual amounts that will be stored based on transaction type
            let userAccountAmount = 0;
            let categoryAmount = 0;
            
            if (transactionType === 'income') {
              // Income: user account increases, category shows positive
              if (fromAccount.type === AccountType.User) {
                userAccountAmount = fromAccount.subtype === 'asset' 
                  ? newTransaction.amount  // Asset increases (positive)
                  : -newTransaction.amount; // Liability decreases (negative)
                categoryAmount = newTransaction.amount; // Always positive for categories
              } else {
                // Category is fromAccount (unusual but possible)
                categoryAmount = newTransaction.amount;
                userAccountAmount = toAccount.subtype === 'asset'
                  ? newTransaction.amount
                  : -newTransaction.amount;
              }
            } else if (transactionType === 'expense') {
              // Expense: user account decreases, category shows positive
              if (fromAccount.type === AccountType.User) {
                userAccountAmount = fromAccount.subtype === 'asset'
                  ? -newTransaction.amount // Asset decreases (negative)
                  : newTransaction.amount;  // Liability increases (positive)
                categoryAmount = newTransaction.amount; // Always positive for categories
              } else {
                // Category is fromAccount (unusual but possible)
                categoryAmount = newTransaction.amount;
                userAccountAmount = toAccount.subtype === 'asset'
                  ? -newTransaction.amount
                  : newTransaction.amount;
              }
            } else {
              // Transfer: use the old logic
              userAccountAmount = fromAccount.subtype === 'asset'
                ? -newTransaction.amount
                : newTransaction.amount;
              categoryAmount = toAccount.subtype === 'asset'
                ? newTransaction.amount
                : -newTransaction.amount;
            }

            const fromAmount = fromAccount.type === AccountType.User ? userAccountAmount : categoryAmount;
            const toAmount = toAccount.type === AccountType.User ? userAccountAmount : categoryAmount;

            return (
              <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Transaction Preview</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{fromAccount.name}</span>
                    <span className={`font-medium ${
                      fromAmount > 0 ? 'text-green-600' : fromAmount < 0 ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {formatNormalizedTransactionAmount(
                        fromAmount,
                        fromAccount.currency,
                        fromAccount.type,
                        fromAccount.subtype as AccountSubtype,
                        true,
                        { showSymbol: true, showCode: false }
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{toAccount.name}</span>
                    <span className={`font-medium ${
                      toAmount > 0 ? 'text-green-600' : toAmount < 0 ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {formatNormalizedTransactionAmount(
                        toAmount,
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
            );
          })()}

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