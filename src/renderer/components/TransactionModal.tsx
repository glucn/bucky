import React, { useState } from "react";
import Papa from "papaparse";

interface TransactionModalProps {
  accountId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface NewTransaction {
  toAccountId: string;
  amount: number;
  date: string;
  description: string;
}

const systemFields = [
  "date",
  "amount",
  "description",
  "fromAccountId",
  "toAccountId",
];

export const TransactionModal: React.FC<TransactionModalProps> = ({
  accountId,
  onClose,
  onSuccess,
}) => {
  const [newTransaction, setNewTransaction] = useState<NewTransaction>({
    toAccountId: "",
    amount: 0,
    date: new Date().toISOString().split("T")[0],
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // CSV Import State
  const [csvRows, setCsvRows] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMap, setFieldMap] = useState<{ [key: string]: string }>({});
  const [showMapping, setShowMapping] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);

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
  React.useEffect(() => {
    if (csvRows.length && Object.keys(fieldMap).length) {
      const preview = csvRows.map((row) => {
        const mapped: any = {};
        systemFields.forEach((field) => {
          mapped[field] = row[fieldMap[field]] || "";
        });
        // Always set fromAccountId to the current account
        mapped["fromAccountId"] = accountId;
        return mapped;
      });
      setImportPreview(preview);
    }
  }, [csvRows, fieldMap, accountId]);

  // Add single transaction
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await window.electron.ipcRenderer.invoke("add-transaction", {
        fromAccountId: accountId,
        ...newTransaction,
      });
      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      alert("Failed to add transaction");
    }
  };

  // Import transactions
  const handleImport = async () => {
    setIsSubmitting(true);
    try {
      await window.electron.ipcRenderer.invoke("import-transactions", {
        transactions: importPreview,
      });
      setIsSubmitting(false);
      setShowMapping(false);
      setCsvRows([]);
      setImportPreview([]);
      onSuccess();
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      alert("Failed to import transactions");
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
        <h2 className="text-xl font-bold mb-4">Add / Import Transaction</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="toAccountId"
              className="block text-sm font-medium text-gray-700"
            >
              To Account ID
            </label>
            <input
              id="toAccountId"
              type="text"
              value={newTransaction.toAccountId}
              onChange={(e) =>
                setNewTransaction((prev) => ({
                  ...prev,
                  toAccountId: e.target.value,
                }))
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
            />
          </div>
          <div>
            <label
              htmlFor="amount"
              className="block text-sm font-medium text-gray-700"
            >
              Amount
            </label>
            <input
              id="amount"
              type="number"
              value={newTransaction.amount}
              onChange={(e) =>
                setNewTransaction((prev) => ({
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
              value={newTransaction.date}
              onChange={(e) =>
                setNewTransaction((prev) => ({
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
              value={newTransaction.description}
              onChange={(e) =>
                setNewTransaction((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              rows={2}
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 px-4 bg-primary-600 text-white rounded hover:bg-primary-700"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Adding..." : "Add Transaction"}
          </button>
        </form>
        <div className="my-6 border-t pt-4">
          <h3 className="text-lg font-semibold mb-2">Import Transactions from CSV</h3>
          <input type="file" accept=".csv" onChange={handleCsvUpload} />
          {showMapping && (
            <div className="mt-4">
              <h4 className="font-semibold mb-2">
                Map CSV Columns to System Fields
              </h4>
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
                disabled={isSubmitting}
              >
                {isSubmitting ? "Importing..." : "Import Transactions"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};