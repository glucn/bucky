import Papa from "papaparse";
import { parseToStandardDate } from "./dateUtils";
import { normalizeUnsignedDecimal } from "./decimalInput";

export type PricePoint = { date: string; price: number | string };
export type PriceRequest = { accountId: string; expectedMarket: string; source: "manual" | "import" | "legacy"; mode: "fill" | "correct"; confirmRawClose: boolean; points?: PricePoint[]; legacyIds?: string[] };
type ReviewedPrice = { price: number; priceDecimal: string };
export type PricePreviewRow = ReviewedPrice & { date: string; token: string | null; action: "insert" | "retain" | "correct"; existing: (ReviewedPrice & { source: string; priceBasis: string; barStatus: string }) | null };

export function parseSecurityPrice(value: unknown): ReviewedPrice | null {
  const priceDecimal = normalizeUnsignedDecimal(value);
  return priceDecimal === null ? null : { price: Number(priceDecimal), priceDecimal };
}

export function parseSecurityPriceCsv(csv: string): PricePoint[] {
  if (typeof csv !== "string" || !csv.trim() || csv.length > 10_000_000) throw new Error("Choose a nonempty price CSV smaller than 10 MB");
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  if (parsed.errors.length) throw new Error(`Invalid CSV: ${parsed.errors[0].message}`);
  const [header, ...records] = parsed.data, names = header?.map((value) => value.trim().toLowerCase());
  if (!names || names.length !== 2 || !names.includes("date") || !names.includes("price") || !records.length || records.length > 10000) throw new Error("Use Date and Price columns with 1 to 10000 records");
  const seen = new Set<string>();
  return records.map((values, index) => {
    const date = values.length === 2 ? parseToStandardDate(values[names.indexOf("date")].trim()) : null;
    const value = parseSecurityPrice(values[names.indexOf("price")]);
    if (!date || !value || seen.has(date)) throw new Error(`Price record ${index + 1}: invalid date, price or duplicate date`);
    seen.add(date); return { date, price: value.priceDecimal };
  });
}
