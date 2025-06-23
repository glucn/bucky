import React, { useEffect, useState } from "react";

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
  category: string;
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
  const [netWorth, setNetWorth] = useState<{
    assets: number;
    liabilities: number;
    netWorth: number;
  } | null>(null);
  const [incomeExpense, setIncomeExpense] = useState<{
    income: number;
    expenses: number;
  } | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<JournalEntry[]>(
    []
  );

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

  useEffect(() => {
    // Fetch recent transactions (latest 5)
    const fetchRecent = async () => {
      const txs = await window.electron.ipcRenderer.invoke(
        "get-recent-transactions",
        5
      );
      setRecentTransactions(txs);
    };
    fetchRecent();
  }, []);

  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Net Worth Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900">Net Worth</h2>
        {netWorth ? (
          <>
            <p className="mt-2 text-3xl font-bold text-primary-600">
              {formatCurrency(netWorth.netWorth)}
            </p>
            <div className="flex space-x-8 mt-2">
              <span className="text-green-700">
                Assets: {formatCurrency(netWorth.assets)}
              </span>
              <span className="text-red-700">
                Liabilities: {formatCurrency(netWorth.liabilities)}
              </span>
            </div>
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
          <div className="flex space-x-8 mt-2">
            <span className="text-green-700">
              Income: {formatCurrency(incomeExpense.income)}
            </span>
            <span className="text-red-700">
              Expenses: {formatCurrency(incomeExpense.expenses)}
            </span>
          </div>
        ) : (
          <p>Loading...</p>
        )}
      </div>

      {/* Recent Transactions Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900">
          Recent Transactions
        </h2>
        <div className="mt-4">
          {recentTransactions.length === 0 && <p>No recent transactions.</p>}
          {recentTransactions.map((entry) => (
            <div key={entry.id} className="mb-4 pb-4 border-b last:border-b-0">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {entry.category}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(entry.date).toLocaleDateString()}
                  </p>
                  {entry.description && (
                    <p className="text-sm text-gray-500">{entry.description}</p>
                  )}
                </div>
                {/* Show total amount for the entry (sum of all lines) */}
                <p className="text-sm font-bold text-gray-900">
                  {formatCurrency(
                    entry.lines.reduce((sum, l) => sum + l.amount, 0)
                  )}
                </p>
              </div>
              {/* Show accounts involved */}
              <div className="mt-2 text-xs text-gray-500">
                {entry.lines.map((line) => (
                  <div key={line.id}>
                    {line.account?.name}: {line.amount > 0 ? "+" : "-"}
                    {formatCurrency(
                      Math.abs(line.amount),
                      line.account?.currency || "USD"
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Account Balances Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900">Accounts</h2>
        <div className="mt-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between py-3 border-b last:border-b-0"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {account.name}
                </p>
                <p className="text-sm text-gray-500">
                  {account.type.charAt(0).toUpperCase() + account.type.slice(1)}{" "}
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
