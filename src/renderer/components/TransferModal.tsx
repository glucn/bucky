import React, { useState, useEffect } from "react";
import { useAccounts } from "../context/AccountsContext";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";
import { normalizeTransactionAmount } from "../utils/displayNormalization";
import { formatCurrencyAmount } from "../utils/currencyUtils";

interface TransferModalProps {
  onClose: () => void;
  onSuccess: () => void;
  fromAccountId?: string; // Optional: pre-select the "from" account
  editTransaction?: {
    id: string;
    entryId: string;
    amount: number;
    date: string;
    description: string;
    fromAccountId: string;
    toAccountId: string;
    type?: string;
    amountFrom?: number;
    amountTo?: number;
    exchangeRate?: number;
  }; // Optional: for editing existing transfers
}

interface TransferData {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  description: string;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  onClose,
  onSuccess,
  fromAccountId,
  editTransaction,
}) => {
  const { accounts, refreshAccounts } = useAccounts();
  const [transferData, setTransferData] = useState<TransferData>({
    fromAccountId: editTransaction?.fromAccountId || fromAccountId || "",
    toAccountId: editTransaction?.toAccountId || "",
    amount: editTransaction?.amountFrom || editTransaction?.amount || 0,
    date: editTransaction?.date || (() => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    })(),
    description: editTransaction?.description || "",
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Multi-currency state
  const [targetAmount, setTargetAmount] = useState<number>(editTransaction?.amountTo || 0);
  const [exchangeRate, setExchangeRate] = useState<number>(editTransaction?.exchangeRate || 1);
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  // Lookup source and target accounts
  const fromAccount = accounts.find((a) => a.id === transferData.fromAccountId);
  const toAccount = accounts.find((a) => a.id === transferData.toAccountId);

  // Determine if this is a multi-currency transfer
  const isMultiCurrency: boolean = Boolean(
    fromAccount?.currency &&
      toAccount?.currency &&
      fromAccount.currency !== toAccount.currency
  );

  // When toAccount or amount changes, recalc exchange rate/target amount
  useEffect(() => {
    if (isMultiCurrency) {
      if (exchangeRate && transferData.amount) {
        setTargetAmount(
          Number((transferData.amount * exchangeRate).toFixed(2))
        );
      }
    }
  }, [exchangeRate, transferData.amount, isMultiCurrency]);

  useEffect(() => {
    if (isMultiCurrency && transferData.amount && targetAmount) {
      if (Math.abs(targetAmount - transferData.amount * exchangeRate) > 0.01) {
        setExchangeError("Amounts and exchange rate are inconsistent.");
      } else {
        setExchangeError(null);
      }
    } else {
      setExchangeError(null);
    }
  }, [targetAmount, exchangeRate, transferData.amount, isMultiCurrency]);

  // When toAccount changes, reset targetAmount and exchangeRate
  useEffect(() => {
    if (isMultiCurrency) {
      setExchangeRate(1);
      setTargetAmount(Number(transferData.amount || 0));
    }
  }, [transferData.toAccountId, isMultiCurrency]);

  // Computed value for button disabled state
  const isButtonDisabled: boolean =
    isSubmitting || (isMultiCurrency && exchangeError !== null);

  // Filter user accounts only
  const userAccounts = accounts.filter((acc) => acc.type === AccountType.User);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate that both accounts are selected and different
      if (!transferData.fromAccountId || !transferData.toAccountId) {
        alert("Please select both source and destination accounts.");
        setIsSubmitting(false);
        return;
      }

      if (transferData.fromAccountId === transferData.toAccountId) {
        alert("Source and destination accounts must be different.");
        setIsSubmitting(false);
        return;
      }

      if (transferData.amount <= 0) {
        alert("Transfer amount must be greater than zero.");
        setIsSubmitting(false);
        return;
      }

      // Validate multi-currency transfer
      if (isMultiCurrency && (targetAmount <= 0 || exchangeRate <= 0)) {
        alert(
          "For multi-currency transfers, both amounts and exchange rate must be greater than zero."
        );
        setIsSubmitting(false);
        return;
      }

      if (editTransaction) {
        // Update existing transfer
        await window.electron.ipcRenderer.invoke("update-transaction", {
          lineId: editTransaction.id,
          fromAccountId: transferData.fromAccountId,
          toAccountId: transferData.toAccountId,
          amount: transferData.amount,
          date: transferData.date,
          description: transferData.description,
          transactionType: "transfer",
          type: isMultiCurrency ? "currency_transfer" : undefined,
          amountFrom: isMultiCurrency ? transferData.amount : undefined,
          amountTo: isMultiCurrency ? targetAmount : undefined,
          exchangeRate: isMultiCurrency ? exchangeRate : undefined,
        });
      } else {
        // Add new transaction with transfer type
        let result = await window.electron.ipcRenderer.invoke("add-transaction", {
          fromAccountId: transferData.fromAccountId,
          toAccountId: transferData.toAccountId,
          amount: transferData.amount,
          date: transferData.date,
          description: transferData.description,
          transactionType: "transfer",
          type: isMultiCurrency ? "currency_transfer" : undefined,
          amountFrom: isMultiCurrency ? transferData.amount : undefined,
          amountTo: isMultiCurrency ? targetAmount : undefined,
          exchangeRate: isMultiCurrency ? exchangeRate : undefined,
        });

        if (result && result.skipped && result.reason === "potential_duplicate") {
          // Show warning and ask for confirmation
          const confirmMsg =
            "A transfer with the same date, accounts, amount, and description already exists.\n\n" +
            "Existing transfer:\n" +
            JSON.stringify(result.existing, null, 2) +
            "\n\nDo you want to add this transfer anyway?";
          if (window.confirm(confirmMsg)) {
            // Retry with forceDuplicate
            result = await window.electron.ipcRenderer.invoke("add-transaction", {
              fromAccountId: transferData.fromAccountId,
              toAccountId: transferData.toAccountId,
              amount: transferData.amount,
              date: transferData.date,
              description: transferData.description,
              transactionType: "transfer",
              type: isMultiCurrency ? "currency_transfer" : undefined,
              amountFrom: isMultiCurrency ? transferData.amount : undefined,
              amountTo: isMultiCurrency ? targetAmount : undefined,
              exchangeRate: isMultiCurrency ? exchangeRate : undefined,
              forceDuplicate: true,
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
      alert("Failed to create transfer");
      console.error("Transfer error:", err);
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
          {editTransaction ? "Edit Transfer" : "Transfer Between Accounts"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="fromAccountId"
              className="block text-sm font-medium text-gray-700"
            >
              From Account
            </label>
            <select
              id="fromAccountId"
              value={transferData.fromAccountId}
              onChange={(e) => {
                setTransferData((prev) => ({
                  ...prev,
                  fromAccountId: e.target.value,
                }));
              }}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
            >
              <option value="" disabled>
                {userAccounts.length === 0
                  ? "Loading..."
                  : "Select source account"}
              </option>
              {userAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.currency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="toAccountId"
              className="block text-sm font-medium text-gray-700"
            >
              To Account
            </label>
            <select
              id="toAccountId"
              value={transferData.toAccountId}
              onChange={(e) => {
                setTransferData((prev) => ({
                  ...prev,
                  toAccountId: e.target.value,
                }));
              }}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
            >
              <option value="" disabled>
                {userAccounts.length === 0
                  ? "Loading..."
                  : "Select destination account"}
              </option>
              {userAccounts
                .filter((acc) => acc.id !== transferData.fromAccountId)
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
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
                  value={transferData.amount}
                  onChange={(e) => {
                    const amt = parseFloat(e.target.value);
                    setTransferData((prev) => ({
                      ...prev,
                      amount: isNaN(amt) ? 0 : amt,
                    }));
                    if (exchangeRate) {
                      setTargetAmount(
                        isNaN(amt) ? 0 : Number((amt * exchangeRate).toFixed(2))
                      );
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
                    if (transferData.amount) {
                      setExchangeRate(
                        isNaN(tgt) || !transferData.amount
                          ? 1
                          : Number((tgt / transferData.amount).toFixed(6))
                      );
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
                  Exchange Rate ({fromAccount?.currency} → {toAccount?.currency}
                  )
                </label>
                <input
                  type="number"
                  value={exchangeRate}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value);
                    setExchangeRate(isNaN(rate) ? 1 : rate);
                    if (transferData.amount) {
                      setTargetAmount(
                        Number(
                          (
                            transferData.amount * (isNaN(rate) ? 1 : rate)
                          ).toFixed(2)
                        )
                      );
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
                Amount{" "}
                {fromAccount?.currency ? `(${fromAccount.currency})` : ""}
              </label>
              <input
                id="amount"
                type="number"
                value={transferData.amount}
                onChange={(e) =>
                  setTransferData((prev) => ({
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
              value={transferData.date}
              onChange={(e) =>
                setTransferData((prev) => ({
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
              value={transferData.description}
              onChange={(e) =>
                setTransferData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              rows={2}
              placeholder="Optional description for this transfer"
            />
          </div>

          {/* Transfer Preview with Normalized Amounts */}
          {fromAccount && toAccount && transferData.amount > 0 && (
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Transfer Preview
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">From {fromAccount.name}:</span>
                  <span
                    className={
                      normalizeTransactionAmount(
                        -transferData.amount,
                        AccountType.User,
                        fromAccount.subtype as AccountSubtype,
                        true
                      ) < 0
                        ? "text-red-600 font-medium"
                        : "text-green-600 font-medium"
                    }
                  >
                    {formatCurrencyAmount(
                      normalizeTransactionAmount(
                        -transferData.amount,
                        AccountType.User,
                        fromAccount.subtype as AccountSubtype,
                        true
                      ),
                      fromAccount.currency,
                      { showSymbol: true, showCode: true }
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">To {toAccount.name}:</span>
                  <span
                    className={
                      normalizeTransactionAmount(
                        isMultiCurrency ? targetAmount : transferData.amount,
                        AccountType.User,
                        toAccount.subtype as AccountSubtype,
                        true
                      ) < 0
                        ? "text-red-600 font-medium"
                        : "text-green-600 font-medium"
                    }
                  >
                    {formatCurrencyAmount(
                      normalizeTransactionAmount(
                        isMultiCurrency ? targetAmount : transferData.amount,
                        AccountType.User,
                        toAccount.subtype as AccountSubtype,
                        true
                      ),
                      toAccount.currency,
                      { showSymbol: true, showCode: true }
                    )}
                  </span>
                </div>
                {isMultiCurrency && (
                  <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-gray-200">
                    <span>Exchange Rate:</span>
                    <span>
                      1 {fromAccount.currency} = {exchangeRate.toFixed(6)}{" "}
                      {toAccount.currency}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2 px-4 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:bg-gray-400"
            disabled={isButtonDisabled}
          >
            {isSubmitting 
              ? (editTransaction ? "Updating Transfer..." : "Creating Transfer...")
              : (editTransaction ? "Update Transfer" : "Create Transfer")
            }
          </button>
        </form>
      </div>
    </div>
  );
};
