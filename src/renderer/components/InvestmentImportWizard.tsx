import React, { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import type { InvestmentImportMapping, InvestmentImportOptions, InvestmentImportRow } from "../../shared/investmentImport";

interface Props { isOpen: boolean; onClose: () => void; portfolioId: string; onImportComplete?: () => void }
type Step = "upload" | "mapping" | "preview" | "importing" | "complete";
type PreviewRow = InvestmentImportRow & { status: "new" | "matching" | "review" | "conflict"; reason?: string; count?: number; currency?: string };
type Validation = { valid: boolean; rowCount: number; errors: Array<{ row: number; field: string; error: string }>; preview?: PreviewRow[] };
type Summary = { imported: number; skipped: number; errors: Array<{ row: number; error: string }> };
const emptyMapping: InvestmentImportMapping = { date: "", type: "", ticker: "", quantity: "", price: "", amount: "", fee: "", description: "", sourceId: "" };
const fields: Array<[keyof InvestmentImportMapping, string]> = [["date", "Date Column"], ["type", "Type Column"], ["ticker", "Ticker Column"], ["amount", "Amount Column"], ["quantity", "Quantity Column"], ["price", "Price Column"], ["fee", "Fee Column"], ["description", "Description Column"], ["sourceId", "Broker transaction ID"]];
const button = "px-4 py-2 rounded-md border border-gray-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed";

export const InvestmentImportWizard: React.FC<Props> = ({ isOpen, onClose, portfolioId, onImportComplete }) => {
  const [step, setStep] = useState<Step>("upload"), [csvData, setCsvData] = useState(""), [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<InvestmentImportMapping>(emptyMapping);
  const [options, setOptions] = useState<InvestmentImportOptions>({ amountBasis: "gross" });
  const [validation, setValidation] = useState<Validation | null>(null), [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [cashAccounts, setCashAccounts] = useState<Array<{ id: string; name: string; currency: string }>>([]);
  const generation = useRef(0), changed = useRef(false);
  const reset = useCallback(() => {
    generation.current++; changed.current = false; setStep("upload"); setCsvData(""); setHeaders([]); setMapping(emptyMapping);
    setOptions({ amountBasis: "gross" }); setValidation(null); setSummary(null); setError(""); setBusy(false); setPreviewPage(0); setCashAccounts([]);
  }, []);
  useEffect(() => {
    reset(); let disposed = false;
    if (isOpen) void window.electron.ipcRenderer.invoke("get-portfolio-accounts", portfolioId).then((result) => {
      if (!disposed && result.success && Array.isArray(result.accounts?.tradeCashAccounts)) setCashAccounts(result.accounts.tradeCashAccounts);
    }).catch(() => { if (!disposed) setError("Unable to load cash accounts. Reopen import to try again."); });
    return () => { disposed = true; generation.current++; };
  }, [isOpen, portfolioId, reset]);
  const close = () => { const imported = changed.current; reset(); onClose(); if (imported) onImportComplete?.(); };
  if (!isOpen) return null;

  const upload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 10_000_000) { setError("Choose a CSV file smaller than 10 MB"); return; }
    const token = ++generation.current; setBusy(true); setError("");
    const reader = new FileReader();
    reader.onerror = () => { if (token === generation.current) { setError("Unable to read this file"); setBusy(false); } };
    reader.onload = () => {
      if (token !== generation.current) return;
      const text = String(reader.result || ""), columns = (Papa.parse<string[]>(text, { preview: 1 }).data[0] || []).map((column) => column.trim());
      const guessed = { ...emptyMapping };
      for (const [field] of fields) guessed[field] = columns.find((column) => column.toLowerCase() === (field === "sourceId" ? "id" : field).toLowerCase()) || "";
      setCsvData(text); setHeaders(columns); setMapping(guessed); setOptions({ amountBasis: "gross", reviewId: crypto.randomUUID(), additionalRows: [] });
      setStep("mapping"); setBusy(false);
    };
    reader.readAsText(file);
  };
  const validate = async () => {
    if (busy) return;
    const token = generation.current; setBusy(true); setError("");
    try {
      const result = await window.electron.ipcRenderer.invoke("validate-import-data", { portfolioId, csvData, mapping, options: { ...options, skipRows: [] } });
      if (token !== generation.current) return;
      if (!result.success) throw new Error(result.error || "Unable to preview this statement");
      setValidation(result.validation); setPreviewPage(0); if (result.validation.valid) setStep("preview"); else setError("Correct the validation errors before importing");
    } catch (failure) { if (token === generation.current) setError(failure instanceof Error ? failure.message : "Unable to preview this statement"); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const importRows = async () => {
    if (busy) return;
    const token = generation.current; setBusy(true); setError(""); setStep("importing");
    try {
      const skipRows = (validation?.preview || []).filter((row) => row.status === "review" && !options.additionalRows?.includes(row.row)).map((row) => row.row);
      const result = await window.electron.ipcRenderer.invoke("import-investment-transactions", { portfolioId, csvData, mapping, options: { ...options, skipRows } });
      if (token !== generation.current) return;
      if (!result.success) throw new Error(result.error || "Unable to import this statement");
      changed.current ||= result.imported > 0; setSummary(result); setStep("complete");
    } catch (failure) { if (token === generation.current) { setError(failure instanceof Error ? failure.message : "Unable to import this statement"); setStep("preview"); } }
    finally { if (token === generation.current) setBusy(false); }
  };
  const rows = validation?.preview || [];
  const selectedCash = cashAccounts.find((account) => account.id === options.tradeCashAccountId) || (cashAccounts.length === 1 ? cashAccounts[0] : null);
  const cashChange = (row: PreviewRow) => Math.round((row.type === "buy" ? -row.amount - row.fee : row.type === "sell" ? row.amount - row.fee : row.type === "fee" ? -row.amount : row.type === "split" || row.type === "dividend_reinvest" ? 0 : row.amount) * 100) / 100;
  return <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
    <div role="dialog" aria-modal="true" aria-labelledby="investment-import-title" data-testid="investment-import-dialog" className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
      <h3 id="investment-import-title" className="text-lg font-medium mb-4">Import Investment Transactions</h3>
      {error ? <p role="alert" className="my-3 text-red-700">{error}</p> : null}
      {step === "upload" ? <div className="space-y-4">
        <p>Choose a CSV statement. Broker transaction IDs distinguish otherwise identical trades.</p>
        <input type="file" accept=".csv" id="investment-csv-upload" onChange={upload} disabled={busy} className="sr-only" />
        <label htmlFor="investment-csv-upload" className={`${button} inline-block cursor-pointer`}>Choose CSV File</label>
        <button className={`${button} ml-3`} onClick={close}>Cancel</button>
      </div> : null}
      {step === "mapping" ? <div className="space-y-4">
        <p>Map the statement columns. Date, type, ticker and amount are required. Buys and sells also need quantity and price.</p>
        <p className="text-sm text-gray-600">Supported types: buy, sell, dividend, dividend_reinvest, interest, fee and split. Use plain numbers without currency symbols or grouping separators. Broker IDs may be blank when unavailable.</p>
        <div className="grid grid-cols-2 gap-4">{fields.map(([field, label]) => <div key={field}>
          <label className="block text-sm mb-1" htmlFor={`investment-map-${field}`}>{label}</label>
          <select id={`investment-map-${field}`} data-testid={`investment-import-mapping-${field}`} value={mapping[field] || ""} disabled={busy} className="w-full border rounded-md p-2"
            onChange={(event) => { setMapping({ ...mapping, [field]: event.target.value }); setOptions({ ...options, additionalRows: [] }); }}>
            <option value="">Select column...</option>{headers.map((header, index) => <option key={index} value={header}>{header}</option>)}
          </select>
        </div>)}</div>
        <label className="block text-sm" htmlFor="investment-amount-basis">Trade amount policy</label>
        <select id="investment-amount-basis" className="border rounded-md p-2" value={options.amountBasis} disabled={busy} onChange={(event) => setOptions({ ...options, amountBasis: event.target.value as "gross" | "net", additionalRows: [] })}>
          <option value="gross">Gross amount, before commissions</option><option value="net">Net amount, including commissions</option>
        </select>
        <p className="text-sm text-gray-600">Map Fee Column when commissions are present. Matching rows are skipped by default; review can add a separate transaction explicitly.</p>
        <label className="block text-sm" htmlFor="investment-import-cash">Trade cash account</label>
        <select id="investment-import-cash" className="w-full border rounded-md p-2" value={options.tradeCashAccountId || ""} disabled={busy}
          onChange={(event) => setOptions({ ...options, tradeCashAccountId: event.target.value || undefined, additionalRows: [] })}>
          <option value="">Automatic: existing holding currency; new holdings need a single cash account</option>
          {cashAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}
        </select>
        {validation?.errors.length ? <ul role="alert" className="text-red-700">{validation.errors.slice(0, 20).map((item, index) => <li key={index}>Row {item.row}: {item.field}: {item.error}</li>)}</ul> : null}
        <div className="flex justify-end gap-3"><button className={button} onClick={close}>Cancel</button><button className={button} disabled={busy} onClick={() => void validate()}>{busy ? "Validating…" : "Validate & Preview"}</button></div>
      </div> : null}
      {step === "preview" ? <div className="space-y-4">
        <p>Review {validation?.rowCount} records. Matching rows will be skipped. Unverified matches are excluded unless you explicitly add a separate transaction.</p>
        <p className="text-sm text-gray-600">Cash context: {selectedCash ? `${selectedCash.name} (${selectedCash.currency})` : "automatic by existing holding currency; select cash for new holdings when multiple currencies exist"}.</p>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{["Row", "Date", "Type", "Ticker", "Units", "Price", "Amount", "Fee", "Cash change", "Currency", "Broker ID", "Review"].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
          <tbody>{rows.slice(previewPage * 200, (previewPage + 1) * 200).map((row) => <tr key={row.row} className="border-t" data-testid={`investment-import-row-${row.row}`}>
            <td className="p-2">{row.row}</td><td className="whitespace-nowrap pr-2">{row.date}</td><td>{row.type}</td><td>{row.ticker}</td><td>{row.quantity ?? "—"}</td><td>{row.price ?? "—"}</td><td>{row.amount}</td><td>{row.fee}</td><td>{cashChange(row)}</td><td>{row.currency || selectedCash?.currency || "—"}</td><td>{row.sourceId || "Not provided"}</td><td className="p-2">
              <p>{options.additionalRows?.includes(row.row) ? "Additional transaction selected" : row.status === "new" ? "New" : row.status === "conflict" ? "Conflicting broker ID" : row.status === "review" ? "Needs review; excluded" : "Matching row; skipped"}{row.count ? ` (${row.count})` : ""}</p>
              {row.reason ? <p className="text-gray-600">{row.reason}</p> : null}
              {row.status === "review" || (row.status === "matching" && !row.sourceId) ? <label className="block mt-1">
                <input type="checkbox" checked={options.additionalRows?.includes(row.row) || false} onChange={(event) => setOptions({ ...options, additionalRows: event.target.checked ? [...(options.additionalRows || []), row.row] : options.additionalRows?.filter((value) => value !== row.row) })} />
                <span className="ml-2">Import row {row.row} as an additional transaction</span>
              </label> : null}
            </td>
          </tr>)}</tbody></table></div>
        {rows.length > 200 ? <div className="flex items-center gap-3"><button className={button} disabled={previewPage === 0} onClick={() => setPreviewPage(previewPage - 1)}>Previous rows</button><span>Page {previewPage + 1} of {Math.ceil(rows.length / 200)}</span><button className={button} disabled={(previewPage + 1) * 200 >= rows.length} onClick={() => setPreviewPage(previewPage + 1)}>Next rows</button></div> : null}
        <div className="flex justify-end gap-3"><button className={button} onClick={() => { setStep("mapping"); setOptions({ ...options, additionalRows: [] }); }}>Back</button><button className={button} onClick={close}>Cancel</button>
          <button className={button} disabled={busy || rows.some((row) => row.status === "conflict")} onClick={() => void importRows()}>Import Transactions</button></div>
      </div> : null}
      {step === "importing" ? <p role="status">Importing transactions…</p> : null}
      {step === "complete" && summary ? <div className="space-y-4">
        <p data-testid="investment-import-summary">{summary.imported} imported. {summary.skipped} skipped. {summary.errors.length ? `${summary.errors.length} need review.` : "No row errors."}</p>
        {summary.errors.length ? <ul role="alert" data-testid="investment-import-errors" className="text-red-700">{summary.errors.map((item, index) => <li key={index}>Row {item.row}: {item.error}</li>)}</ul> : null}
        <div className="flex justify-end gap-3">{summary.errors.length ? <button className={button} disabled={busy} onClick={() => void validate()}>Review again</button> : null}<button className={button} onClick={close}>Close</button></div>
      </div> : null}
    </div>
  </div>;
};
