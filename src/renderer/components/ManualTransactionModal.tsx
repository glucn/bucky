import React, { useState } from "react";

import { JournalLine } from "../pages/AccountTransactionsPage";

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
  description: string;
}

import { useAccounts } from "../context/AccountsContext";
import { AccountType } from "../../shared/accountTypes";

export const ManualTransactionModal: React.FC<ManualTransactionModalProps> = ({
  accountId,
  onClose,
  onSuccess,
  transaction,
}) => {
  const { accounts, refreshAccounts } = useAccounts();
  const isEdit = !!transaction;
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
    amount: isEdit ? Math.abs(transaction?.amount ?? 0) : 0,
    date: isEdit
      ? new Date(transaction?.entry?.date ?? "").toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    description: isEdit
      ? transaction?.description || transaction?.entry?.description || ""
      : "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Multi-currency state
  const [targetAmount, setTargetAmount] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  // Lookup source and target accounts
  const fromAccount = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === newTransaction.toAccountId);

  // Determine if this is a transfer (user-to-user) and if it's multi-currency
  const isTransfer =
    toAccount &&
    toAccount.type === AccountType.User &&
    fromAccount &&
    fromAccount.type === AccountType.User;

  const isMultiCurrency =
    isTransfer &&
    fromAccount?.currency &&
    toAccount?.currency &&
    fromAccount.currency !== toAccount.currency;

  // When toAccount or amount changes, recalc exchange rate/target amount
  React.useEffect(() => {
    if (isMultiCurrency) {
      if (exchangeRate && newTransaction.amount) {
        setTargetAmount(Number((newTransaction.amount * exchangeRate).toFixed(2)));
      }
    }
    // eslint-disable-next-line
  }, [exchangeRate, newTransaction.amount, isMultiCurrency]);

  React.useEffect(() => {
    if (isMultiCurrency && newTransaction.amount && targetAmount) {
      if (Math.abs(targetAmount - newTransaction.amount * exchangeRate) > 0.01) {
        setExchangeError("Amounts and exchange rate are inconsistent.");
      } else {
        setExchangeError(null);
      }
    } else {
      setExchangeError(null);
    }
  }, [targetAmount, exchangeRate, newTransaction.amount, isMultiCurrency]);

  // When toAccount changes, reset targetAmount and exchangeRate
  React.useEffect(() => {
    if (isMultiCurrency) {
      setExchangeRate(1);
      setTargetAmount(Number(newTransaction.amount || 0));
    }
    // eslint-disable-next-line
  }, [newTransaction.toAccountId, isMultiCurrency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        // Add transaction
        await window.electron.ipcRenderer.invoke("add-transaction", {
          fromAccountId: accountId,
          ...newTransaction,
        });
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
              {isTransfer ? "Transfer To" : "Category"}
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
                {accounts.length === 0 ? "Loading..." : isTransfer ? "Select account" : "Select a category"}
              </option>
              {accounts
                .filter((acc) =>
                  isTransfer
                    ? acc.type === AccountType.User && acc.id !== accountId
                    : acc.type === AccountType.Category
                )
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} {acc.currency ? `(${acc.currency})` : ""}
                  </option>
                ))}
            </select>
          </div>

          {isMultiCurrency ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Amount in {fromAccount?.currency || "source currency"}
                </label>
                <input
                  type="number"
                  value={newTransaction.amount}
                  onChange={(e) => {
                    const amt = parseFloat(e.target.value);
                    setNewTransaction((prev) => ({
                      ...prev,
                      amount: isNaN(amt) ? 0 : amt,
                    }));
                    if (exchangeRate) {
                      setTargetAmount(isNaN(amt) ? 0 : Number((amt * exchangeRate).toFixed(2)));
                    }
                  }}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  required
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Amount in {toAccount?.currency || "target currency"}
                </label>
                <input
                  type="number"
                  value={targetAmount}
                  onChange={(e) => {
                    const tgt = parseFloat(e.target.value);
                    setTargetAmount(isNaN(tgt) ? 0 : tgt);
                    if (newTransaction.amount) {
                      setExchangeRate(isNaN(tgt) || !newTransaction.amount ? 1 : Number((tgt / newTransaction.amount).toFixed(6)));
                    }
                  }}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  required
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Exchange Rate ({fromAccount?.currency} → {toAccount?.currency})
                </label>
                <input
                  type="number"
                  value={exchangeRate}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value);
                    setExchangeRate(isNaN(rate) ? 1 : rate);
                    if (newTransaction.amount) {
                      setTargetAmount(Number((newTransaction.amount * (isNaN(rate) ? 1 : rate)).toFixed(2)));
                    }
                  }}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  required
                  min="0.000001"
                  step="0.000001"
                />
              </div>
              {exchangeError && (
                <div className="text-red-600 text-sm">{exchangeError}</div>
              )}
            </>
          ) : (
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
            </div>
          )}

          <div>
            <label
              htmlFor="date"
              className="block text-sm font-medium text-gray-700"
            >
              Date
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
          <button
            type="submit"
            className="w-full py-2 px-4 bg-primary-600 text-white rounded hover:bg-primary-700"
            disabled={!!(isSubmitting || (isMultiCurrency && !!exchangeError))}
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