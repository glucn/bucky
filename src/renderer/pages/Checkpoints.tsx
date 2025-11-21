import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Account } from "../types";
import { useAccounts } from "../context/AccountsContext";
import { formatCurrencyAmount } from "../utils/currencyUtils";

interface Checkpoint {
  id: string;
  accountId: string;
  date: string;
  balance: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
  account: Account;
}

export const Checkpoints: React.FC = () => {
  const { refreshAccounts } = useAccounts();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCheckpoint, setNewCheckpoint] = useState({
    date: new Date().toISOString().split("T")[0],
    balance: "",
    description: "",
  });
  const [isCreating, setIsCreating] = useState(false);
  const [deletingCheckpointId, setDeletingCheckpointId] = useState<
    string | null
  >(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setIsLoading(true);
        const accountsData = await window.electron.ipcRenderer.invoke(
          "get-accounts"
        );
        // Filter to only show user accounts (not system or category accounts)
        const userAccounts = accountsData.filter(
          (acc: Account) => acc.type === "user"
        );
        setAccounts(userAccounts);

        // Check if account is specified in URL
        const accountFromUrl = searchParams.get("account");
        if (
          accountFromUrl &&
          userAccounts.some((acc: Account) => acc.id === accountFromUrl)
        ) {
          setSelectedAccount(accountFromUrl);
        } else if (userAccounts.length > 0) {
          setSelectedAccount(userAccounts[0].id);
        }
      } catch (err) {
        setError("Failed to fetch accounts.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAccounts();
  }, [searchParams]);

  useEffect(() => {
    if (selectedAccount) {
      fetchCheckpoints();
    }
  }, [selectedAccount]);

  const fetchCheckpoints = async () => {
    if (!selectedAccount) return;

    try {
      const result = await window.electron.ipcRenderer.invoke(
        "get-checkpoints-for-account",
        selectedAccount
      );
      if (result.success) {
        setCheckpoints(result.checkpoints);
      } else {
        setError(result.error || "Failed to fetch checkpoints");
      }
    } catch (err) {
      setError("Failed to fetch checkpoints.");
      console.error(err);
    }
  };

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount || !newCheckpoint.balance) return;

    setIsCreating(true);
    try {
      // Always round to two decimals before sending to backend
      const roundedBalance =
        Math.round(parseFloat(newCheckpoint.balance) * 100) / 100;
      const result = await window.electron.ipcRenderer.invoke(
        "create-checkpoint",
        {
          accountId: selectedAccount,
          date: newCheckpoint.date,
          balance: roundedBalance,
          description: newCheckpoint.description || undefined,
        }
      );

      if (result.success) {
        setShowCreateForm(false);
        setNewCheckpoint({
          date: new Date().toISOString().split("T")[0],
          balance: "",
          description: "",
        });
        await fetchCheckpoints();
        await refreshAccounts();
        alert("Checkpoint created successfully!");
      } else {
        setError(result.error || "Failed to create checkpoint");
      }
    } catch (err) {
      setError("Failed to create checkpoint.");
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteCheckpoint = async (checkpointId: string) => {
    const checkpoint = checkpoints.find((cp) => cp.id === checkpointId);
    if (!checkpoint) return;

    const confirmMessage = `Are you sure you want to delete this checkpoint?

Date: ${new Date(checkpoint.date).toLocaleDateString()}
Balance: $${Math.round(checkpoint.balance * 100) / 100}
Account: ${checkpoint.account.name}
Description: ${checkpoint.description || "No description"}

This action cannot be undone.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setDeletingCheckpointId(checkpointId);
    try {
      const result = await window.electron.ipcRenderer.invoke(
        "delete-checkpoint",
        checkpointId
      );
      if (result.success) {
        await fetchCheckpoints();
        await refreshAccounts();
        alert("Checkpoint deleted successfully");
      } else {
        setError(result.error || "Failed to delete checkpoint");
      }
    } catch (error) {
      console.error("Error deleting checkpoint:", error);
      setError("Failed to delete checkpoint. Please try again.");
    } finally {
      setDeletingCheckpointId(null);
    }
  };

  const handleReconcileAgain = async (checkpointId: string) => {
    if (
      !confirm(
        "Are you sure you want to reconcile this checkpoint again? This will update the checkpoint to match the current sum of all transactions up to its date."
      )
    )
      return;
    try {
      const result = await window.electron.ipcRenderer.invoke(
        "reconcile-checkpoint",
        checkpointId
      );
      if (result.success) {
        await fetchCheckpoints();
        await refreshAccounts();
        alert("Checkpoint reconciled again successfully!");
      } else {
        setError(result.error || "Failed to reconcile checkpoint");
      }
    } catch (err) {
      setError("Failed to reconcile checkpoint.");
      console.error(err);
    }
  };

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return formatCurrencyAmount(amount, currency, {
      showSymbol: true,
      showCode: true,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Account Checkpoints
          </h1>
          <button
            onClick={() => navigate("/accounts")}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Back to Accounts
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
            {error}
            <button
              onClick={() => setError(null)}
              className="absolute top-0 bottom-0 right-0 px-4 py-3"
            >
              <span className="sr-only">Dismiss</span>×
            </button>
          </div>
        )}

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Select Account
          </h2>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        {selectedAccount && (
          <>
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium text-gray-900">
                  Checkpoints
                </h2>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700"
                >
                  Create Checkpoint
                </button>
              </div>

              {checkpoints.length === 0 ? (
                <p className="text-gray-500">
                  No checkpoints found for this account.
                </p>
              ) : (
                <div className="space-y-4">
                  {checkpoints.map((checkpoint) => (
                    <div
                      key={checkpoint.id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-gray-900">
                              {new Date(checkpoint.date).toLocaleDateString()}
                            </span>
                            <span className="text-sm text-gray-500">
                              Balance:{" "}
                              {formatCurrency(
                                Math.round(checkpoint.balance * 100) / 100
                              )}
                            </span>
                          </div>
                          {checkpoint.description && (
                            <p className="text-sm text-gray-600 mb-2">
                              {checkpoint.description}
                            </p>
                          )}
                          <p className="text-xs text-gray-500">
                            Created:{" "}
                            {new Date(checkpoint.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 ml-4">
                          <button
                            onClick={() =>
                              handleDeleteCheckpoint(checkpoint.id)
                            }
                            disabled={deletingCheckpointId === checkpoint.id}
                            className="px-3 py-1 text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {deletingCheckpointId === checkpoint.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                          <button
                            onClick={() => handleReconcileAgain(checkpoint.id)}
                            className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
                          >
                            Reconcile Again
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {showCreateForm && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Create New Checkpoint
                </h3>
                <form onSubmit={handleCreateCheckpoint}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date
                      </label>
                      <input
                        type="date"
                        value={newCheckpoint.date}
                        onChange={(e) =>
                          setNewCheckpoint({
                            ...newCheckpoint,
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
                      <div className="relative rounded-md shadow-sm">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <span className="text-gray-500 sm:text-sm">$</span>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          value={newCheckpoint.balance}
                          onChange={(e) => {
                            // Always round to two decimals for input
                            let val = e.target.value;
                            if (val !== "") {
                              const rounded =
                                Math.round(parseFloat(val) * 100) / 100;
                              val = rounded.toString();
                            }
                            setNewCheckpoint({
                              ...newCheckpoint,
                              balance: val,
                            });
                          }}
                          className="block w-full rounded-md border-gray-300 pl-7 pr-12 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          placeholder="0.00"
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description (optional)
                    </label>
                    <textarea
                      value={newCheckpoint.description}
                      onChange={(e) =>
                        setNewCheckpoint({
                          ...newCheckpoint,
                          description: e.target.value,
                        })
                      }
                      rows={3}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      placeholder="Enter a description for this checkpoint..."
                    />
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreating}
                      className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
                    >
                      {isCreating ? "Creating..." : "Create Checkpoint"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
