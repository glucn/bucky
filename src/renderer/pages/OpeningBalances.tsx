import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Account } from "../types";

const RELEVANT_ACCOUNT_TYPES = ["cash", "bank", "credit", "investment"];

export const OpeningBalances: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountBalances, setAccountBalances] = useState<{
    [key: string]: number;
  }>({});
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(
    new Set()
  );
  const [balances, setBalances] = useState<{ [key: string]: string }>({});
  const [entryDate, setEntryDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAccountsAndBalances = async () => {
      try {
        setIsLoading(true);
        const fetchedAccounts = await window.electron.ipcRenderer.invoke(
          "get-accounts"
        );
        const filteredAccounts = fetchedAccounts.filter((acc: Account) =>
          RELEVANT_ACCOUNT_TYPES.includes(acc.type)
        );
        setAccounts(filteredAccounts);
        // Fetch current balances for each account
        const balancesObj: { [key: string]: number } = {};
        for (const acc of filteredAccounts) {
          const lines = await window.electron.ipcRenderer.invoke(
            "get-transactions",
            acc.id
          );
          const sum = lines.reduce(
            (total: number, line: { amount: number }) => total + line.amount,
            0
          );
          balancesObj[acc.id] = Math.round(sum * 100) / 100;
        }
        setAccountBalances(balancesObj);
      } catch (err) {
        setError("Failed to fetch accounts or balances.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAccountsAndBalances();
  }, []);

  const handleAccountSelect = (accountId: string) => {
    setSelectedAccounts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(accountId)) {
        newSet.delete(accountId);
        setBalances((prevBalances) => {
          const { [accountId]: _, ...rest } = prevBalances;
          return rest;
        });
      } else {
        newSet.add(accountId);
        setBalances((prevBalances) => ({
          ...prevBalances,
          [accountId]: prevBalances[accountId] ?? "",
        }));
      }
      return newSet;
    });
  };

  const handleBalanceChange = (accountId: string, value: string) => {
    setBalances({
      ...balances,
      [accountId]: value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Calculate the diff for each selected account
    const diffsToSubmit = Array.from(selectedAccounts)
      .map((accountId) => {
        const desired =
          Math.round(parseFloat(balances[accountId] ?? "0") * 100) / 100;
        const current = accountBalances[accountId] ?? 0;
        const diff = desired - current;
        return {
          accountId,
          balance: diff,
        };
      })
      .filter((item) => item.balance !== 0);

    if (diffsToSubmit.length === 0) {
      setError(
        "Please select at least one account and enter a balance different from the current balance."
      );
      return;
    }

    try {
      await window.electron.ipcRenderer.invoke("create-opening-balance-entry", {
        balances: diffsToSubmit,
        entryDate: entryDate,
      });
      navigate("/accounts");
    } catch (err) {
      setError("Failed to save opening balances.");
      console.error(err);
    }
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
      <div className="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          Set Opening Balances
        </h2>
        {error && (
          <div
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4"
            role="alert"
          >
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label
              htmlFor="entryDate"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Balances as of date
            </label>
            <input
              type="date"
              id="entryDate"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            />
          </div>

          <div className="space-y-4 mb-6">
            {accounts.map((account) => {
              const current = accountBalances[account.id] ?? 0;
              const desired =
                Math.round(parseFloat(balances[account.id] ?? "") * 100) / 100;
              const diff = selectedAccounts.has(account.id)
                ? isNaN(desired)
                  ? 0
                  : desired - current
                : 0;
              return (
                <div key={account.id} className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    id={`select-${account.id}`}
                    checked={selectedAccounts.has(account.id)}
                    onChange={() => handleAccountSelect(account.id)}
                    className="h-4 w-4 text-primary-600 border-gray-300 rounded"
                  />
                  <label
                    htmlFor={`select-${account.id}`}
                    className="text-sm font-medium text-gray-700 flex-1"
                  >
                    {account.name}{" "}
                    <span className="text-xs text-gray-500">
                      ({account.type})
                    </span>
                  </label>
                  <span className="text-xs text-gray-500">
                    Current: ${Math.round(current * 100) / 100}
                  </span>
                  {selectedAccounts.has(account.id) && (
                    <>
                      <div className="relative rounded-md shadow-sm w-32">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <span className="text-gray-500 sm:text-sm">$</span>
                        </div>
                        <input
                          type="number"
                          id={`balance-${account.id}`}
                          step="0.01"
                          value={balances[account.id] ?? ""}
                          onChange={(e) => {
                            // Always round to two decimals for input
                            let val = e.target.value;
                            if (val !== "") {
                              const rounded =
                                Math.round(parseFloat(val) * 100) / 100;
                              val = rounded.toString();
                            }
                            handleBalanceChange(account.id, val);
                          }}
                          className="block w-full rounded-md border-gray-300 pl-7 pr-12 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                          placeholder="0.00"
                        />
                      </div>
                      <span
                        className={`text-xs ml-2 ${
                          diff === 0
                            ? "text-gray-400"
                            : diff > 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {diff === 0
                          ? "No change"
                          : diff > 0
                          ? `+${diff.toFixed(2)}`
                          : diff.toFixed(2)}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-8 border-t pt-5">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => navigate("/accounts")}
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Save Opening Balances
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
