import { AccountType } from "../../shared/accountTypes";
import React, { useEffect, useState } from "react";
import { formatCurrencyAmount } from "../utils/currencyUtils";

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

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

export const Dashboard: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountBalances, setAccountBalances] = useState<
    Record<string, number>
  >({});
  type NetWorthState = {
    assets: Record<string, number>;
    liabilities: Record<string, number>;
    netWorth: Record<string, number>;
  } | null;
  const [netWorth, setNetWorth] = useState<NetWorthState>(null);
  type IncomeExpenseState = {
    income: Record<string, number>;
    expenses: Record<string, number>;
  } | null;
  const [incomeExpense, setIncomeExpense] = useState<IncomeExpenseState>(null);

  useEffect(() => {
    // Fetch accounts and their balances
    const fetchAccounts = async () => {
      const accountsData = await window.electron.ipcRenderer.invoke(
        "get-accounts"
      );
      setAccounts(accountsData);
      // Compute balances for all accounts
      const balances: Record<string, number> = {};
      for (const account of accountsData) {
        const lines: JournalLine[] = await window.electron.ipcRenderer.invoke(
          "get-transactions",
          account.id
        );
        balances[account.id] = lines.reduce(
          (sum, line) => sum + line.amount,
          0
        );
      }
      setAccountBalances(balances);
    };
    fetchAccounts();
  }, []);

  useEffect(() => {
    // Fetch net worth
    const fetchNetWorth = async () => {
      const nw = await window.electron.ipcRenderer.invoke("get-net-worth");
      setNetWorth(nw);
    };
    fetchNetWorth();
  }, []);

  useEffect(() => {
    // Fetch income/expense for this month
    const fetchIncomeExpense = async () => {
      const ie = await window.electron.ipcRenderer.invoke(
        "get-income-expense-this-month"
      );
      setIncomeExpense(ie);
    };
    fetchIncomeExpense();
  }, []);

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return formatCurrencyAmount(amount, currency, {
      showSymbol: true,
      showCode: true,
    });
  };

  return (
    <div className="space-y-6">
      {/* Net Worth Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900">Net Worth</h2>
        {netWorth ? (
          <>
            {Object.keys(netWorth.netWorth).map((currency) => (
              <div key={currency} className="mb-4 last:mb-0">
                <p className="mt-2 text-3xl font-bold text-primary-600">
                  {formatCurrency(netWorth.netWorth[currency], currency)}
                </p>
                <div className="flex space-x-8 mt-2">
                  <span className="text-green-700">
                    Assets: {formatCurrency(netWorth.assets[currency] || 0, currency)}
                  </span>
                  <span className="text-red-700">
                    Liabilities: {formatCurrency(netWorth.liabilities[currency] || 0, currency)}
                  </span>
                </div>
              </div>
            ))}
          </>
        ) : (
          <p>Loading...</p>
        )}
      </div>

      {/* Income vs Expenses Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900">
          This Month: Income vs Expenses
        </h2>
        {incomeExpense ? (
          <>
            {(() => {
              const allCurrencies = Array.from(
                new Set([
                  ...Object.keys(incomeExpense.income),
                  ...Object.keys(incomeExpense.expenses),
                ])
              );
              return allCurrencies.map((currency) => (
                <div key={currency} className="flex space-x-8 mt-2">
                  <span className="text-green-700">
                    Income: {formatCurrency(incomeExpense.income[currency] || 0, currency)}
                  </span>
                  <span className="text-red-700">
                    Expenses: {formatCurrency(incomeExpense.expenses[currency] || 0, currency)}
                  </span>
                </div>
              ));
            })()}
          </>
        ) : (
          <p>Loading...</p>
        )}
      </div>

      {/* Account Balances Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900">Accounts</h2>
        <div className="mt-4">
          {accounts
            .filter((account) => account.type === AccountType.User)
            .map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between py-3 border-b last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {account.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {account.type.charAt(0).toUpperCase() +
                      account.type.slice(1)}{" "}
                    • {account.currency}
                  </p>
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {formatCurrency(
                    accountBalances[account.id] ?? 0,
                    account.currency
                  )}
                </p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
