import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { TransactionModal } from "../components/TransactionModal";

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
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

export const AccountTransactionsPage: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const [transactions, setTransactions] = useState<JournalLine[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchTransactions = async () => {
    if (!accountId) return;
    try {
      const txs = await window.electron.ipcRenderer.invoke(
        "get-transactions",
        accountId
      );
      setTransactions(txs);
    } catch (err) {
      console.error("Failed to fetch transactions", err);
    }
  };

  const fetchAccount = async () => {
    try {
      const accounts: Account[] = await window.electron.ipcRenderer.invoke(
        "get-accounts"
      );
      setAccount(accounts.find((a) => a.id === accountId) || null);
    } catch (err) {
      setAccount(null);
    }
  };

  useEffect(() => {
    fetchAccount();
    fetchTransactions();
    // eslint-disable-next-line
  }, [accountId]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">
          Transactions for {account?.name || "Account"}
        </h1>
        <button
          className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
          onClick={() => setShowModal(true)}
        >
          Add / Import Transactions
        </button>
      </div>
      <div className="bg-white shadow rounded-lg p-6">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-4 text-gray-500">
                    No transactions found.
                  </td>
                </tr>
              )}
              {transactions.map((line) => (
                <tr key={line.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(line.entry.date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {line.amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {line.description || line.entry.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showModal && (
        <TransactionModal
          accountId={accountId!}
          onClose={() => setShowModal(false)}
          onSuccess={fetchTransactions}
        />
      )}
    </div>
  );
};