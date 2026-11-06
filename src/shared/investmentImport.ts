import Papa from "papaparse";
import { parseToStandardDate } from "./dateUtils";

export type InvestmentImportMapping = { date: string; type: string; ticker: string; amount: string; quantity?: string; price?: string; fee?: string; description?: string; sourceId?: string };
export type InvestmentImportOptions = { amountBasis?: "gross" | "net"; sourceNamespace?: string; additionalRows?: number[]; skipRows?: number[]; reviewId?: string; tradeCashAccountId?: string };
export type InvestmentImportRow = { row: number; date: string; type: "buy" | "sell" | "dividend" | "dividend_reinvest" | "interest" | "fee" | "split"; ticker: string; amount: number; quantity?: number; price?: number; fee: number; description?: string; sourceId?: string };
export type InvestmentImportError = { row: number; field: string; error: string };
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const cents = (value: number) => Math.round(value * 100);
export function investmentRowIdentity(row: InvestmentImportRow): string {
  return JSON.stringify([1, row.date, row.type, row.ticker, row.quantity ?? null, row.price ?? null, row.amount, row.fee]);
}
export function parseInvestmentImport(csv: string, mapping: InvestmentImportMapping, options: InvestmentImportOptions = {}) {
  const rows: InvestmentImportRow[] = [], errors: InvestmentImportError[] = [];
  const fail = (row: number, field: string, error: string) => errors.push({ row, field, error });
  if (typeof csv !== "string" || !csv.trim() || csv.length > 10_000_000) {
    fail(0, "csv", "CSV is empty or exceeds the 10 MB limit"); return { rows, errors, headers: [] as string[], rowCount: 0, valid: false };
  }
  if (!mapping || typeof mapping !== "object" || !options || typeof options !== "object" || !["gross", "net"].includes(options.amountBasis || "gross")) {
    fail(0, "mapping", "Select a valid mapping and gross or net amount policy"); return { rows, errors, headers: [] as string[], rowCount: 0, valid: false };
  }
  const source = csv.replace(/^\uFEFF/, ""), parsed: Array<{ values: string[]; row: number }> = [];
  let cursor = 0, physicalRow = 1;
  Papa.parse<string[]>(source, { delimiter: ",", skipEmptyLines: false, step: (result, parser) => {
    if (parsed.length > 10000) { fail(physicalRow, "csv", "Import at most 10000 records at a time"); parser.abort(); return; }
    parsed.push({ values: result.data, row: physicalRow });
    for (const error of result.errors) fail(physicalRow, "csv", error.message);
    physicalRow += (source.slice(cursor, result.meta.cursor).match(/\r\n|\r|\n/g) || []).length;
    cursor = result.meta.cursor;
  } });
  const headers = (parsed[0]?.values || []).map((value) => value.trim());
  const records = parsed.slice(1).filter(({ values }) => values.some((value) => value.trim()));
  if (records.length > 10000) fail(0, "csv", "Import at most 10000 records at a time");
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) fail(0, "csv", "CSV headers must be unique and non-empty");
  const indexes: Record<string, number> = {};
  for (const field of ["date", "type", "ticker", "amount", "quantity", "price", "fee", "description", "sourceId"] as const) {
    const column = mapping[field];
    if (["date", "type", "ticker", "amount"].includes(field) && !column) fail(0, field, "Required column not found in mapping");
    if (column) { const index = headers.indexOf(column); if (index < 0) fail(0, field, `Column '${column}' not found in CSV headers`); else indexes[field] = index; }
  }
  if (errors.length) return { rows, errors, headers, rowCount: records.length, valid: false };
  for (const record of records) {
    const { row, values } = record, before = errors.length;
    if (values.length !== headers.length) { fail(row, "csv", "Record has a different number of columns than the header"); continue; }
    const text = (field: string) => indexes[field] === undefined ? "" : values[indexes[field]].trim();
    const number = (field: string, required: boolean, zero = false, signed = false) => {
      const raw = text(field); if (!raw && !required) return undefined;
      const value = numeric.test(raw) ? Number(raw) : NaN;
      if (!Number.isFinite(value) || (!signed && (zero ? value < 0 : value <= 0))) { fail(row, field, `Invalid ${field}; supply a finite ${zero ? "non-negative" : "positive"} number`); return undefined; }
      return value;
    };
    const date = parseToStandardDate(text("date")), type = text("type").toLowerCase() as InvestmentImportRow["type"], ticker = text("ticker");
    if (!date) fail(row, "date", "Invalid calendar date");
    if (!["buy", "sell", "dividend", "dividend_reinvest", "interest", "fee", "split"].includes(type)) fail(row, "type", "Invalid transaction type");
    if (!ticker || ticker.length > 64 || /[\x00-\x1f]/.test(ticker)) fail(row, "ticker", "Ticker is required and must be valid");
    const trading = type === "buy" || type === "sell";
    const quantity = trading ? number("quantity", true) : undefined, price = trading || type === "dividend_reinvest" ? number("price", true, trading) : undefined, fee = number("fee", false, true) ?? 0;
    let amount = number("amount", true, trading, type === "sell" && options.amountBasis === "net");
    if (fee && !trading) fail(row, "fee", "Map commissions only on buys and sells; import other fees as fee records");
    if (amount !== undefined && type !== "split" && (!Number.isSafeInteger(cents(amount)) || (!trading && cents(amount) <= 0))) fail(row, "amount", "Amount exceeds supported cent precision");
    if (trading && quantity !== undefined && price !== undefined && amount !== undefined) {
      const gross = cents(quantity * price), commission = cents(fee), expected = options.amountBasis === "net" ? gross + (type === "buy" ? commission : -commission) : gross;
      if (!Number.isSafeInteger(gross) || !Number.isSafeInteger(commission) || cents(amount) !== expected) fail(row, "amount", `Amount does not match quantity, price and the selected ${options.amountBasis || "gross"} policy`);
      amount = gross / 100;
    } else if (amount !== undefined && type !== "split") amount = cents(amount) / 100;
    const sourceId = text("sourceId");
    if (sourceId && (sourceId.length > 256 || /[\x00-\x1f]/.test(sourceId))) fail(row, "sourceId", "Use a valid broker transaction identifier; leave it blank when unavailable");
    if (errors.length === before) rows.push({ row, date: date!, type, ticker, amount: amount!, quantity, price, fee: cents(fee) / 100, description: text("description") || undefined, sourceId: sourceId || undefined });
  }
  const ids = new Map<string, string>();
  for (const row of rows) if (row.sourceId) {
    const identity = investmentRowIdentity(row), previous = ids.get(row.sourceId);
    if (previous && previous !== identity) fail(row.row, "sourceId", "Broker identifier has different financial data in this statement");
    ids.set(row.sourceId, identity);
  }
  return { rows, errors, headers, rowCount: records.length, valid: errors.length === 0 };
}
