import Papa from "papaparse";
import { parseToStandardDate } from "./dateUtils";

export type PricePoint = { date: string; price: number };
export type PriceRequest = { accountId: string; expectedMarket: string; source: "manual" | "import" | "legacy"; mode: "fill" | "correct"; confirmRawClose: boolean; points?: PricePoint[]; legacyIds?: string[] };
export type PricePreviewRow = PricePoint & { token: string | null; action: "insert" | "retain" | "correct"; existing: { price: number; source: string; priceBasis: string; barStatus: string } | null };
export function parseSecurityPriceCsv(csv: string): PricePoint[] {
  if (typeof csv !== "string" || !csv.trim() || csv.length > 10_000_000) throw new Error("Choose a nonempty price CSV smaller than 10 MB");
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  if (parsed.errors.length) throw new Error(`Invalid CSV: ${parsed.errors[0].message}`);
  const [header, ...records] = parsed.data, names = header?.map((value) => value.trim().toLowerCase());
  if (!names || names.length !== 2 || !names.includes("date") || !names.includes("price") || !records.length || records.length > 10000) throw new Error("Use Date and Price columns with 1 to 10000 records");
  const seen = new Set<string>();
  return records.map((values, index) => {
    const date = values.length === 2 ? parseToStandardDate(values[names.indexOf("date")].trim()) : null;
    const raw = values[names.indexOf("price")]?.trim(), price = raw && /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw) ? Number(raw) : NaN;
    if (!date || !Number.isFinite(price) || price < 0 || seen.has(date)) throw new Error(`Price record ${index + 1}: invalid date, price or duplicate date`);
    seen.add(date); return { date, price };
  });
}
