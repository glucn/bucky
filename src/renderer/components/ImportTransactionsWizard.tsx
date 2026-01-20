import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import { useAccounts } from "../context/AccountsContext";
import { normalizeTransactionAmount } from "../utils/displayNormalization";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";
import { formatCurrencyAmount } from "../utils/currencyUtils";
import {
  resolveImportAmount,
  isImportMappingValid,
  updateImportPreviewRow,
  getImportDuplicateKey,
  applyDuplicateFlags,
  applyForceDuplicate,
  filterOutDuplicateRows,
} from "../utils/importMapping";

interface ImportTransactionsWizardProps {
  accountId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const systemFields = [
  "date",
  "postingDate",
  "amount",
  "credit",
  "debit",
  "description",
  "toAccountId", // optional for mapping
];
const requiredFields = [
  "date",
  "amount",
];

// User-friendly labels and help text for each system field
const systemFieldMeta: {
  [key: string]: { label: string; help: string }
} = {
  date: {
    label: "Date",
    help: "The date of the transaction. Supports: YYYY-MM-DD, YYYYMMDD, MM/DD/YYYY, YYYY/MM/DD.",
  },
  postingDate: {
    label: "Posting Date",
    help: "The date the transaction was posted to the account (optional). Must be on or after the transaction date. Supports same formats as Date.",
  },
  amount: {
    label: "Amount",
    help:
      "The transaction amount. If both Credit and Debit columns are mapped, this will be calculated automatically.",
  },
  credit: {
    label: "Credit",
    help: "Column for credits (income, positive amounts).",
  },
  debit: {
    label: "Debit",
    help: "Column for debits (expenses, negative amounts).",
  },
  description: {
    label: "Description",
    help: "A brief description or memo for the transaction.",
  },
  toAccountId: {
    label: "To Account",
    help: "The destination account for transfers. Leave unmapped for non-transfer transactions.",
  },
};

type Step = 0 | 1 | 2; // 0: Upload, 1: Map Fields + Preview, 2: Confirm

export const ImportTransactionsWizard: React.FC<ImportTransactionsWizardProps> = ({
  accountId,
  onClose,
  onSuccess,
}) => {
  const { refreshAccounts, accounts } = useAccounts();
  const [step, setStep] = useState<Step>(0);
  
  // Get the account information for normalization
  const currentAccount = accounts.find(acc => acc.id === accountId);
  const accountType = currentAccount?.type as AccountType || AccountType.User;
  const accountSubtype = currentAccount?.subtype as AccountSubtype || AccountSubtype.Asset;

  // CSV header row option
  const [csvHasHeaderRow, setCsvHasHeaderRow] = useState<boolean>(true);

  // Feedback and summary states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{ imported: number; skipped: number } | null>(null);
  const [duplicateRows, setDuplicateRows] = useState<number[]>([]);
  const [duplicatePreview, setDuplicatePreview] = useState<any[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  // Step 1: Upload
  const [csvRows, setCsvRows] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>("");
  // Track transactions that used a default account
  const [usedDefaultAccountDetails, setUsedDefaultAccountDetails] = useState<any[]>([]);
  // Track auto-created categories
  const [autoCreatedCategories, setAutoCreatedCategories] = useState<Array<{ name: string; subtype: string }>>([]);

  // Step 2: Map Fields
  const [fieldMap, setFieldMap] = useState<{ [key: string]: string }>({});

  // Step 3: Preview
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const previewEditableFields = ["date", "amount", "description", "toAccountId", "category"];

  // Step 4: Confirm
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-map CSV headers to system fields
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
  // Store the file and name, but do NOT parse or advance step yet
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Reset all CSV-related state before loading new file
    setCsvRows([]);
    setCsvHeaders([]);
    setCsvFileName("");
    setCsvFile(null);
    setFieldMap({});
    setImportPreview([]);
    setError(null);
    setSuccess(null);
    setImportSummary(null);
    setUsedDefaultAccountDetails([]);
    setAutoCreatedCategories([]);

    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCsvFile(file);
    // Do NOT parse or advance step here. Wait for "Next" button.
  };

  // Handle field mapping change
  const handleFieldMapChange = (systemField: string, csvField: string) => {
    setFieldMap((prev) => ({ ...prev, [systemField]: csvField }));
  };

  const computeDuplicates = (rows: any[]) => {
    const duplicates: number[] = [];
    const seen = new Map<string, number>();

    rows.forEach((row, index) => {
      const key = getImportDuplicateKey(row);
      if (!key.trim()) {
        return;
      }

      const existingIndex = seen.get(key);
      if (existingIndex !== undefined) {
        duplicates.push(index, existingIndex);
        return;
      }

      seen.set(key, index);
    });

    return Array.from(new Set(duplicates));
  };

  // Generate preview when mapping or rows change
  useEffect(() => {
    if (csvRows.length && Object.keys(fieldMap).length) {
      const preview = csvRows.map((row) => {
        const mapped: any = {};

        // Map all fields except amount (we'll handle amount below)
        systemFields.forEach((field) => {
          if (["amount"].includes(field)) return;
          if (fieldMap[field]) {
            mapped[field] = row[fieldMap[field]] || "";
          } else if (field === "toAccountId" || field === "postingDate") {
            mapped[field] = ""; // leave blank if not mapped (optional fields)
          } else {
            mapped[field] = "";
          }
        });

        const amount = resolveImportAmount(row, fieldMap);

        mapped["amount"] = amount;
        mapped["fromAccountId"] = accountId;
        mapped["category"] = "";
        return mapped;
      });
      setImportPreview(preview);
      setDuplicateRows(computeDuplicates(preview));
    }
  }, [csvRows, fieldMap, accountId]);

  // Validation for navigation
  const canProceedFromUpload = csvRows.length > 0 && csvHeaders.length > 0;
  const canProceedFromMap = isImportMappingValid(fieldMap);
  const canProceedFromPreview = importPreview.length > 0;

  // Import transactions
  const buildImportPayload = (rows: any[]) =>
    rows.map((row, index) => {
      const base = {
        ...row,
        index,
      };

      if (!row.category) {
        return base;
      }

      return {
        ...base,
        toAccountId: row.category,
      };
    });

  const handleImport = async (rows: any[] = importPreview) => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    setImportSummary(null);
    try {
      // Assume backend returns { imported: number, skipped: number, usedDefaultAccountDetails: [], autoCreatedCategories: [] }
      const result = await window.electron.ipcRenderer.invoke("import-transactions", {
        transactions: buildImportPayload(rows),
      });
      console.log("[ImportTransactionsWizard] Import result:", result);
      setIsSubmitting(false);
      if (result && result.success && typeof result.imported === "number") {
        if (result.imported > 0) {
          setSuccess("Import completed successfully.");
        } else {
          setSuccess(null);
          setError("No transactions were imported. Please review the skipped details below.");
        }
      } else {
        setSuccess(null);
        setError("Import failed. Please check your data and try again.");
      }
      if (result && typeof result.imported === "number" && typeof result.skipped === "number") {
        setImportSummary({ imported: result.imported, skipped: result.skipped });
      } else {
        setImportSummary({ imported: rows.length, skipped: 0 });
      }
      if (result && Array.isArray(result.usedDefaultAccountDetails)) {
        setUsedDefaultAccountDetails(result.usedDefaultAccountDetails);
      } else {
        setUsedDefaultAccountDetails([]);
      }
      if (result && Array.isArray(result.autoCreatedCategories)) {
        setAutoCreatedCategories(result.autoCreatedCategories);
      } else {
        setAutoCreatedCategories([]);
      }
      if (result && Array.isArray(result.skippedDetails)) {
        const duplicates = result.skippedDetails
          .filter((detail: any) => detail.reason === "potential_duplicate")
          .map((detail: any) => detail.index)
          .filter((index: any) => typeof index === "number");
        if (duplicates.length > 0) {
          setDuplicateRows(duplicates);
          setDuplicatePreview(rows);
          setShowDuplicateDialog(true);
        }
      }
      // Do not close immediately; let user see summary
      // onSuccess();
      // onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      // Show backend error if available
      if (err && err.error) {
        setError(err.error);
      } else {
        setError("Import failed. Please check your data and try again.");
      }
      console.error("[ImportTransactionsWizard] Import error:", err);
    }
  };

  // Step content
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div>
            <h3 className="text-lg font-semibold mb-2">Upload CSV File</h3>
            <input type="file" accept=".csv" onChange={handleCsvUpload} />
            <div className="flex items-center mt-4">
              <input
                id="csv-has-header-row"
                type="checkbox"
                checked={csvHasHeaderRow}
                onChange={(e) => setCsvHasHeaderRow(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="csv-has-header-row" className="text-sm select-none">
                CSV has header row
              </label>
            </div>
            {csvFileName && (
              <div className="mt-2 text-sm text-gray-600">Selected: {csvFileName}</div>
            )}
            {error && (
              <div
                className="mt-2 text-sm text-red-600"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </div>
            )}
            <div className="flex justify-end mt-6">
              <button
                className="px-4 py-2 bg-gray-200 rounded mr-2"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
                onClick={() => {
                  if (!csvFile) {
                    setError("Please upload a valid CSV file.");
                    return;
                  }
                  setError(null);

                  // Parse the file using the current csvHasHeaderRow value
                  Papa.parse(csvFile, {
                    header: csvHasHeaderRow,
                    skipEmptyLines: true,
                    complete: (results) => {
                      if (csvHasHeaderRow) {
                        // Standard: use first row as headers
                        const headers = results.meta.fields || [];
                        setCsvHeaders(headers);
                        setCsvRows(results.data as any[]);
                        const autoMap = autoMapFields(headers);
                        setFieldMap(autoMap);
                      } else {
                        // No header: treat all rows as data, generate generic headers
                        const data = results.data as any[];
                        if (!Array.isArray(data) || data.length === 0) {
                          setCsvHeaders([]);
                          setCsvRows([]);
                          setFieldMap({});
                          setStep(1);
                          return;
                        }
                        // Each row is an array, not an object
                        const firstRow = data[0] as any[];
                        const colCount = Array.isArray(firstRow) ? firstRow.length : 0;
                        const headers = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`);
                        // Convert each row array to object
                        const rowObjects = data.map((row: any[]) => {
                          const obj: { [key: string]: any } = {};
                          headers.forEach((header, i) => {
                            obj[header] = row[i] ?? "";
                          });
                          return obj;
                        });
                        setCsvHeaders(headers);
                        setCsvRows(rowObjects);
                        const autoMap = autoMapFields(headers);
                        setFieldMap(autoMap);
                      }
                      setStep(1);
                    },
                    error: () => {
                      setError("Failed to parse CSV file.");
                    }
                  });
                }}
                disabled={!csvFile}
              >
                Next
              </button>
            </div>
          </div>
        );
      case 1:
        return (
          <div>
            <h3 className="text-lg font-semibold mb-2">Map CSV Columns to System Fields</h3>
            {!csvHasHeaderRow && (
              <div className="mb-3 p-2 bg-blue-50 border border-blue-300 text-blue-800 rounded text-sm">
                This CSV file does not have a header row. Generic column names (<strong>Column 1</strong>, <strong>Column 2</strong>, etc.) have been generated. Please map each column to the correct field.
              </div>
            )}
            <div className="flex flex-col gap-4 mb-4">
              {/* Only show mapping for amount, credit, debit, date, postingDate, description, toAccountId */}
              {["date", "postingDate", "amount", "credit", "debit", "description", "toAccountId"].map((field) => (
                <div
                  key={field}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 last:border-b-0 last:pb-0"
                >
                  <label
                    className="w-full sm:w-48 font-medium flex items-center"
                    htmlFor={`map-${field}`}
                  >
                    <span>
                      {systemFieldMeta[field]?.label || field}
                      {requiredFields.includes(field) && (
                        <span className="text-red-500 ml-1" aria-label="Required">*</span>
                      )}
                    </span>
                    <span
                      className="ml-1 relative group"
                      tabIndex={0}
                      aria-label={`Help: ${systemFieldMeta[field]?.help}`}
                    >
                      <svg
                        className="w-4 h-4 text-gray-400 hover:text-primary-600 cursor-pointer"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-1m0-4a1 1 0 1 1 2 0c0 1-2 1-2 3" />
                      </svg>
                      <span className="absolute left-1/2 -translate-x-1/2 mt-2 w-56 bg-gray-800 text-white text-xs rounded p-2 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-10 pointer-events-none group-hover:pointer-events-auto group-focus:pointer-events-auto"
                        role="tooltip"
                      >
                        {systemFieldMeta[field]?.help}
                      </span>
                    </span>
                  </label>
                  <select
                    id={`map-${field}`}
                    value={fieldMap[field] || ""}
                    onChange={(e) =>
                      handleFieldMapChange(field, e.target.value)
                    }
                    className="border rounded px-2 py-1 w-full sm:w-64"
                    aria-required={requiredFields.includes(field)}
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
            {/* Preview Table */}
            <h4 className="text-md font-semibold mb-2 mt-6">Preview Transactions</h4>
            <div className="overflow-x-auto max-h-64 border rounded mb-4">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    {/* Only show preview for date, postingDate, amount, description, toAccountId, category */}
                    {["date", "postingDate", "amount", "description", "toAccountId", "category"].map((field) => (
                      <th key={field} className="px-2 py-1 border-b">
                        {systemFieldMeta[field]?.label || field}
                      </th>
                    ))}

                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((row, i) => {
                    // Normalize the amount for display
                    const rawAmount = typeof row.amount === "number" ? row.amount : parseFloat(row.amount);
                    const normalizedAmount = !isNaN(rawAmount)
                      ? normalizeTransactionAmount(
                          rawAmount,
                          accountType,
                          accountSubtype,
                          true
                        )
                      : rawAmount;

                    return (
                      <tr key={i}>
                        {["date", "postingDate", "amount", "description", "toAccountId", "category"].map(
                          (field) => (
                            <td key={field} className="px-2 py-1 border-b">
                              {previewEditableFields.includes(field) ? (
                                <input
                                  className="w-full border border-gray-200 rounded px-1 py-0.5 text-xs"
                                  value={row[field] ?? ""}
                                  onChange={(event) => {
                                    setImportPreview((prev) =>
                                      updateImportPreviewRow(
                                        prev,
                                        i,
                                        field,
                                        event.target.value
                                      )
                                    );
                                  }}
                                />
                              ) : field === "amount" && !isNaN(rawAmount) ? (
                                formatCurrencyAmount(
                                  normalizedAmount,
                                  currentAccount?.currency || "USD"
                                )
                              ) : (
                                row[field]
                              )}
                            </td>
                          )
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!canProceedFromMap && (
              <div
                className="mb-2 text-sm text-red-600"
                role="alert"
                aria-live="assertive"
              >
                Please map all required fields before proceeding.
              </div>
            )}
            {/* Show instructional message instead of error if no mapping yet */}
            {Object.values(fieldMap).filter(Boolean).length === 0 ? (
              <div className="mb-2 text-sm text-gray-600" role="status" aria-live="polite">
                Map the columns above to see a preview of your transactions.
              </div>
            ) : (
              !canProceedFromPreview && (
                <div
                  className="mb-2 text-sm text-red-600"
                  role="alert"
                  aria-live="assertive"
                >
                  No transactions to preview. Please check your mapping and CSV data.
                </div>
              )
            )}
            {error && (
              <div
                className="mb-2 text-sm text-red-600"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </div>
            )}
            <div className="flex justify-between mt-6">
              <button
                className="px-4 py-2 bg-gray-200 rounded"
                onClick={() => {
                  // Reset all CSV-related state when going back to Upload
                  setCsvRows([]);
                  setCsvHeaders([]);
                  setCsvFileName("");
                  setFieldMap({});
                  setImportPreview([]);
                  setError(null);
                  setSuccess(null);
                  setImportSummary(null);
                  setUsedDefaultAccountDetails([]);
                  setAutoCreatedCategories([]);
                  setStep(0);
                }}
              >
                Back
              </button>
              <button
                className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
                onClick={() => {
                  if (!canProceedFromMap || !canProceedFromPreview) {
                    setError("Please map all required fields and ensure there are transactions to preview.");
                  } else {
                    setError(null);
                    setStep(2);
                  }
                }}
                disabled={!canProceedFromMap || !canProceedFromPreview}
              >
                Next
              </button>
            </div>
          </div>
        );
      case 2:
        return (
          <div>
            <h3 className="text-lg font-semibold mb-2">Confirm Import</h3>
            <div className="mb-4">
              <p>
                <strong>File:</strong> {csvFileName}
              </p>
              <p>
                <strong>Transactions to import:</strong> {importPreview.length}
              </p>
              <p>
                <strong>Mapped fields:</strong>{" "}
                {systemFields.map((f) => `${f} → ${fieldMap[f] || "Not mapped"}`).join(", ")}
              </p>
            </div>
            {isSubmitting && (
              <div className="mb-2 text-sm text-blue-600 flex items-center gap-2" role="status" aria-live="polite">
                <svg
                  className="animate-spin h-5 w-5 text-blue-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                <span>Importing transactions, please wait...</span>
              </div>
            )}
            {error && (
              <div className="mb-2 text-sm text-red-600" role="alert" aria-live="assertive">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-2 text-sm text-green-700" role="status" aria-live="polite">
                {success}
                {importSummary && (
                  <div>
                    <div>
                      <strong>Imported:</strong> {importSummary.imported}
                    </div>
                    <div>
                      <strong>Skipped (duplicates):</strong> {importSummary.skipped}
                    </div>
                  </div>
                )}
                {autoCreatedCategories && autoCreatedCategories.length > 0 && (
                  <div className="mt-4 p-3 border-2 border-green-500 bg-green-50 rounded shadow">
                    <div className="font-bold text-green-900 mb-2 flex items-center gap-2">
                      <span role="img" aria-label="Success">✅</span>
                      New Categories Created
                    </div>
                    <div className="text-green-900 mb-2">
                      The following categories were automatically created during import:
                    </div>
                    <div className="overflow-x-auto max-h-40 border rounded mb-2 bg-white">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr>
                            <th className="px-2 py-1 border-b text-left">Category Name</th>
                            <th className="px-2 py-1 border-b text-left">Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {autoCreatedCategories.map((cat, i) => (
                            <tr key={i}>
                              <td className="px-2 py-1 border-b">{cat.name}</td>
                              <td className="px-2 py-1 border-b">{cat.subtype}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-green-800 text-xs">
                      You can view and manage these categories on the <span className="font-semibold">Categories</span> page.
                    </div>
                  </div>
                )}
                {usedDefaultAccountDetails && usedDefaultAccountDetails.length > 0 && (
                  <div className="mt-4 p-3 border-2 border-yellow-500 bg-yellow-50 rounded shadow">
                    <div className="font-bold text-yellow-900 mb-2 flex items-center gap-2">
                      <span role="img" aria-label="Warning">⚠️</span>
                      Attention: Some transactions were auto-assigned to a default account
                    </div>
                    <div className="text-yellow-900 mb-2">
                      The following transactions did <strong>not specify a destination account</strong> and were automatically assigned to <strong>Uncategorized Income</strong> or <strong>Uncategorized Expense</strong>.<br />
                      <span className="text-yellow-800">Please review and reclassify these for accurate reporting.</span>
                    </div>
                    <div className="overflow-x-auto max-h-40 border rounded mb-2">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr>
                            <th className="px-2 py-1 border-b">Date</th>
                            <th className="px-2 py-1 border-b">Amount</th>
                            <th className="px-2 py-1 border-b">Description</th>
                            <th className="px-2 py-1 border-b">Default Account</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usedDefaultAccountDetails.map((tx, i) => (
                            <tr key={i}>
                              <td className="px-2 py-1 border-b">{tx.date}</td>
                              <td className="px-2 py-1 border-b">{tx.amount}</td>
                              <td className="px-2 py-1 border-b">{tx.description}</td>
                              <td className="px-2 py-1 border-b">{tx.defaultAccountName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-yellow-900 text-xs mb-2">
                      <strong>What to do next:</strong> Click <span className="font-semibold">Done</span> below, then go to the <span className="font-semibold">Accounts</span> or <span className="font-semibold">Transactions</span> page to edit or reclassify these transactions.
                    </div>
                    <div className="text-yellow-800 text-xs">
                      <strong>Why this matters:</strong> Transactions in Uncategorized accounts may be missed in reports or budgets. Assign them to the correct category for best results.
                    </div>
                  </div>
                )}
                {showDuplicateDialog && (
                  <div className="mt-4 p-3 border-2 border-orange-500 bg-orange-50 rounded shadow">
                    <div className="font-bold text-orange-900 mb-2">
                      Potential duplicates detected
                    </div>
                    <div className="text-orange-900 mb-2 text-sm">
                      We detected {duplicateRows.length} potential duplicates. Choose how you want to proceed.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="px-3 py-1 text-sm bg-orange-600 text-white rounded"
                        onClick={() => {
                          const rowsToImport = applyForceDuplicate(duplicatePreview, duplicateRows);
                          setShowDuplicateDialog(false);
                          handleImport(rowsToImport);
                        }}
                      >
                        Import duplicates
                      </button>
                      <button
                        className="px-3 py-1 text-sm bg-white border border-orange-400 text-orange-700 rounded"
                        onClick={() => {
                          const rowsToImport = filterOutDuplicateRows(duplicatePreview, duplicateRows);
                          setShowDuplicateDialog(false);
                          handleImport(rowsToImport);
                        }}
                      >
                        Skip duplicates
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-2">
                  <button
                    className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
                    onClick={async () => {
                      setSuccess(null);
                      setImportSummary(null);
                      setUsedDefaultAccountDetails([]);
                      setAutoCreatedCategories([]);
                      await refreshAccounts();
                      onSuccess();
                      onClose();
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
            {!success && importSummary && importSummary.imported === 0 && (
              <div className="mb-2 text-sm text-yellow-800 bg-yellow-50 border border-yellow-400 rounded p-3" role="alert" aria-live="assertive">
                <strong>No transactions were imported.</strong>
                <div>
                  All transactions were skipped. Please review your CSV data and the skipped details below.
                </div>
              </div>
            )}
            <div className="flex justify-between mt-6">
              <button
                className="px-4 py-2 bg-gray-200 rounded"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                disabled={isSubmitting}
              >
                Back
              </button>
              {!success && (
                <button
                  className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
                  onClick={() => handleImport()}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Importing..." : "Confirm & Import"}
                </button>
              )}
            </div>
          </div>
        );
      default:
        return null;
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
        <h2 className="text-xl font-bold mb-4">Import Transactions from CSV</h2>
        {/* Stepper */}
        <div className="flex items-center justify-between mb-6">
          {["Upload", "Map & Preview", "Confirm"].map((label, idx) => {
            const isActive = step === idx;
            const isCompleted = step > idx;
            return (
              <React.Fragment key={label}>
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-8 h-8 flex items-center justify-center rounded-full border-2 ${
                      isActive
                        ? "border-primary-600 bg-primary-600 text-white"
                        : isCompleted
                        ? "border-primary-400 bg-primary-400 text-white"
                        : "border-gray-300 bg-white text-gray-400"
                    } font-bold transition-colors`}
                  >
                    {idx + 1}
                  </div>
                  <span
                    className={`mt-1 text-xs ${
                      isActive
                        ? "text-primary-700 font-semibold"
                        : isCompleted
                        ? "text-primary-400"
                        : "text-gray-400"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                {idx < 2 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 ${
                      step > idx
                        ? "bg-primary-400"
                        : "bg-gray-200"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
        {renderStep()}
      </div>
    </div>
  );
};