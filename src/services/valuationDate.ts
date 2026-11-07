import { localCalendarDate, parseToStandardDate } from "../shared/dateUtils";

/** Book valuations follow the same local calendar as current ledger balances. Capture once
 * at the request boundary and pass the result through holdings, cash, prices and FX. */
export function resolveValuationDate(asOfDate?: string, now = new Date()): string {
  if (asOfDate === undefined) return localCalendarDate(now);
  const date = typeof asOfDate === "string" && asOfDate.length <= 64 ? parseToStandardDate(asOfDate) : null;
  if (!date) throw new Error("Invalid valuation date");
  return date;
}
