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
  const [transactions, setTransactions] = useState<JournalLine[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [accountBalances, setAccountBalances] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    const fetchData = async () => {
      const accountsData = await window.electron.ipcRenderer.invoke(
        "get-accounts"
      );
      setAccounts(accountsData);
      if (accountsData.length > 0) {
        setSelectedAccount(accountsData[0].id);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      const fetchTransactions = async () => {
        const transactionsData = await window.electron.ipcRenderer.invoke(
          "get-transactions",
          selectedAccount
        );
        setTransactions(transactionsData);
      };
      fetchTransactions();
    }
  }, [selectedAccount]);

  // Compute balances for all accounts
  useEffect(() => {
    const fetchAllBalances = async () => {
      const balances: Record<string, number> = {};
      for (const account of accounts) {
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
      setTotalBalance(Object.values(balances).reduce((sum, b) => sum + b, 0));
    };
    if (accounts.length > 0) {
      fetchAllBalances();
    }
  }, [accounts]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900">Total Balance</h2>
        <p className="mt-2 text-3xl font-bold text-primary-600">
          {formatCurrency(totalBalance, "USD")}
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">
            Recent Transactions
          </h2>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4">
          {transactions.slice(0, 5).map((line) => (
            <div
              key={line.id}
              className="flex items-center justify-between py-3 border-b last:border-b-0"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {line.entry.category}
                </p>
                <p className="text-sm text-gray-500">
                  {new Date(line.entry.date).toLocaleDateString()}
                </p>
                {(line.description || line.entry.description) && (
                  <p className="text-sm text-gray-500">
                    {line.description || line.entry.description}
                  </p>
                )}
              </div>
              <p
                className={`text-sm font-medium ${
                  line.amount > 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {line.amount > 0 ? "+" : "-"}
                {formatCurrency(Math.abs(line.amount), "USD")}
              </p>
            </div>
          ))}
        </div>
      </div>

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
