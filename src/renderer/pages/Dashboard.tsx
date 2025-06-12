import React, { useEffect, useState } from "react";

interface Account {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export const Dashboard: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState<string>("");

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

  useEffect(() => {
    const total = accounts.reduce((sum, account) => sum + account.balance, 0);
    setTotalBalance(total);
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
          {transactions.slice(0, 5).map((transaction) => (
            <div
              key={transaction.id}
              className="flex items-center justify-between py-3 border-b last:border-b-0"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {transaction.category}
                </p>
                <p className="text-sm text-gray-500">
                  {new Date(transaction.date).toLocaleDateString()}
                </p>
                {transaction.description && (
                  <p className="text-sm text-gray-500">
                    {transaction.description}
                  </p>
                )}
              </div>
              <p
                className={`text-sm font-medium ${
                  transaction.type === "income"
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {transaction.type === "income" ? "+" : "-"}
                {formatCurrency(Math.abs(transaction.amount), "USD")}
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
                {formatCurrency(account.balance, account.currency)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
