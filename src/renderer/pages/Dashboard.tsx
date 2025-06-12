import React, { useEffect, useState } from "react";

interface Account {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
}

export const Dashboard: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      const accountsData = await window.electron.ipcRenderer.invoke(
        "get-accounts"
      );
      const transactionsData = await window.electron.ipcRenderer.invoke(
        "get-transactions"
      );
      setAccounts(accountsData);
      setTransactions(transactionsData);
    };

    fetchData();
  }, []);

  useEffect(() => {
    const total = accounts.reduce((sum, account) => sum + account.balance, 0);
    setTotalBalance(total);
  }, [accounts]);

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900">Total Balance</h2>
        <p className="mt-2 text-3xl font-bold text-primary-600">
          ${(totalBalance ?? 0).toFixed(2)}
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900">
          Recent Transactions
        </h2>
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
                <p className="text-sm text-gray-500">{transaction.date}</p>
              </div>
              <p
                className={`text-sm font-medium ${
                  transaction.type === "income"
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {transaction.type === "income" ? "+" : "-"}$
                {Math.abs(transaction.amount ?? 0).toFixed(2)}
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
                <p className="text-sm text-gray-500">{account.currency}</p>
              </div>
              <p className="text-sm font-medium text-gray-900">
                ${(account.balance ?? 0).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
