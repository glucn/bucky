import React, { useEffect, useState } from "react";
import Papa from "papaparse";

interface Account {
  id: string;
  name: string;
  currency: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
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

export const Transactions: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<JournalLine[]>([]);
  const [newTransaction, setNewTransaction] = useState({
    fromAccountId: "",
    toAccountId: "",
    amount: 0,
    category: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
  });
  const [newCategory, setNewCategory] = useState({
    name: "",
    type: "expense",
  });

  // CSV Import State
  const [csvRows, setCsvRows] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMap, setFieldMap] = useState<{ [key: string]: string }>({});
  const [showMapping, setShowMapping] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const systemFields = [
    "date",
    "amount",
    "description",
    "fromAccountId",
    "toAccountId",
    "category",
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log("Fetching accounts and categories...");
        const [accountsData, categoriesData] = await Promise.all([
          window.electron.ipcRenderer.invoke("get-accounts"),
          window.electron.ipcRenderer.invoke("get-categories"),
        ]);
        console.log("Accounts data:", accountsData);
        console.log("Categories data:", categoriesData);
        setAccounts(accountsData);
        setCategories(categoriesData);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (newTransaction.fromAccountId) {
      const fetchTransactions = async () => {
        try {
          const transactionsData = await window.electron.ipcRenderer.invoke(
            "get-transactions",
            newTransaction.fromAccountId
          );
          setTransactions(transactionsData);
        } catch (error) {
          console.error("Error fetching transactions:", error);
        }
      };
      fetchTransactions();
    }
  }, [newTransaction.fromAccountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const transaction = await window.electron.ipcRenderer.invoke(
      "add-transaction",
      newTransaction
    );
    setTransactions([...(transaction.lines || []), ...transactions]);
    setNewTransaction({
      fromAccountId: newTransaction.fromAccountId,
      toAccountId: "",
      amount: 0,
      category: "",
      date: new Date().toISOString().split("T")[0],
      description: "",
    });
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const category = await window.electron.ipcRenderer.invoke(
      "add-category",
      newCategory
    );
    setCategories([...categories, category]);
    setNewCategory({ name: "", type: "expense" });
  };

  // Attempt to auto-map CSV headers to system fields
  const autoMapFields = (headers: string[]) => {
    const map: { [key: string]: string } = {};
    systemFields.forEach((field) => {
      const match = headers.find((h) =>
        h.toLowerCase().includes(field.toLowerCase())
      );
      if (match) map[field] = match;
    });
    return map;
  };

  // Handle CSV file upload
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        setCsvHeaders(headers);
        setCsvRows(results.data as any[]);
        const autoMap = autoMapFields(headers);
        setFieldMap(autoMap);
        setShowMapping(true);
      },
    });
  };

  // Handle field mapping change
  const handleFieldMapChange = (systemField: string, csvField: string) => {
    setFieldMap((prev) => ({ ...prev, [systemField]: csvField }));
  };

  // Preview mapped data
  useEffect(() => {
    if (csvRows.length && Object.keys(fieldMap).length) {
      const preview = csvRows.map((row) => {
        const mapped: any = {};
        systemFields.forEach((field) => {
          mapped[field] = row[fieldMap[field]] || "";
        });
        return mapped;
      });
      setImportPreview(preview);
    }
  }, [csvRows, fieldMap]);

  // Send mapped data to backend
  const handleImport = async () => {
    try {
      await window.electron.ipcRenderer.invoke("import-transactions", {
        transactions: importPreview,
      });
      setShowMapping(false);
      setCsvRows([]);
      setImportPreview([]);
      // Optionally, refresh transactions list here
    } catch (err) {
      alert("Failed to import transactions");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Add New Category
        </h2>
        <form onSubmit={handleAddCategory} className="space-y-4">
          <div>
            <label
              htmlFor="categoryName"
              className="block text-sm font-medium text-gray-700"
            >
              Category Name
            </label>
            <input
              type="text"
              id="categoryName"
              value={newCategory.name}
              onChange={(e) =>
                setNewCategory({ ...newCategory, name: e.target.value })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
            />
          </div>

          <div>
            <label
              htmlFor="categoryType"
              className="block text-sm font-medium text-gray-700"
            >
              Type
            </label>
            <select
              id="categoryType"
              value={newCategory.type}
              onChange={(e) =>
                setNewCategory({ ...newCategory, type: e.target.value })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>

          <button
            type="submit"
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Add Category
          </button>
        </form>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Add New Transaction
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="fromAccount"
              className="block text-sm font-medium text-gray-700"
            >
              From Account
            </label>
            <select
              id="fromAccount"
              value={newTransaction.fromAccountId}
              onChange={(e) =>
                setNewTransaction({
                  ...newTransaction,
                  fromAccountId: e.target.value,
                })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
            >
              <option value="">Select an account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="toAccount"
              className="block text-sm font-medium text-gray-700"
            >
              To Account
            </label>
            <select
              id="toAccount"
              value={newTransaction.toAccountId}
              onChange={(e) =>
                setNewTransaction({
                  ...newTransaction,
                  toAccountId: e.target.value,
                })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
            >
              <option value="">Select an account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="amount"
              className="block text-sm font-medium text-gray-700"
            >
              Amount
            </label>
            <input
              type="number"
              id="amount"
              value={newTransaction.amount}
              onChange={(e) =>
                setNewTransaction({
                  ...newTransaction,
                  amount: parseFloat(e.target.value),
                })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
              min="0"
              step="0.01"
            />
          </div>

          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-gray-700"
            >
              Category
            </label>
            <select
              id="category"
              value={newTransaction.category}
              onChange={(e) =>
                setNewTransaction({
                  ...newTransaction,
                  category: e.target.value,
                })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="date"
              className="block text-sm font-medium text-gray-700"
            >
              Date
            </label>
            <input
              type="date"
              id="date"
              value={newTransaction.date}
              onChange={(e) =>
                setNewTransaction({
                  ...newTransaction,
                  date: e.target.value,
                })
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
                setNewTransaction({
                  ...newTransaction,
                  description: e.target.value,
                })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              rows={3}
            />
          </div>

          <button
            type="submit"
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Add Transaction
          </button>
        </form>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Recent Transactions
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions
                .filter((line) => line.entry)
                .map((line) => (
                  <tr key={line.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(line.entry.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {line.entry.category}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {line.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {line.account?.name}
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

      {/* CSV Import Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Import Transactions from CSV
        </h2>
        <input type="file" accept=".csv" onChange={handleCsvUpload} />
        {showMapping && (
          <div className="mt-4">
            <h3 className="font-semibold mb-2">
              Map CSV Columns to System Fields
            </h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {systemFields.map((field) => (
                <div key={field} className="flex items-center space-x-2">
                  <label className="w-32 font-medium">{field}</label>
                  <select
                    value={fieldMap[field] || ""}
                    onChange={(e) =>
                      handleFieldMapChange(field, e.target.value)
                    }
                    className="border rounded px-2 py-1"
                  >
                    <option value="">-- Not Mapped --</option>
                    {csvHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <h4 className="font-semibold mb-2">Preview</h4>
            <div className="overflow-x-auto max-h-48 border rounded">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    {systemFields.map((field) => (
                      <th key={field} className="px-2 py-1 border-b">
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {systemFields.map((field) => (
                        <td key={field} className="px-2 py-1 border-b">
                          {row[field]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="mt-4 px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
              onClick={handleImport}
            >
              Import Transactions
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
