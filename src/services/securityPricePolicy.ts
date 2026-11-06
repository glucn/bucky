import { isValidStandardDate } from "../shared/dateUtils";

export type SecurityPricePolicy = { priceBasis: "raw" | "split_adjusted"; barStatus: "complete"; basisAsOf?: string | null };

export function verifyPricePolicy(value: SecurityPricePolicy) {
  if (!value || !["raw", "split_adjusted"].includes(value.priceBasis) || value.barStatus !== "complete") throw new Error("Explicit price basis and completed-bar policy are required");
  if (value.priceBasis === "split_adjusted" && (!value.basisAsOf || !isValidStandardDate(value.basisAsOf))) throw new Error("Adjusted prices require an adjustment reference date");
  if (value.priceBasis === "raw" && value.basisAsOf != null) throw new Error("Raw prices cannot have an adjustment reference date");
  return { priceBasis: value.priceBasis, barStatus: value.barStatus, basisAsOf: value.basisAsOf ?? null };
}

/** Prior exchange calendar days only. Avoid treating a live daily candle as a final close. */
export function exchangeCalendarDate(timeZone: string, now = new Date()) {
  if (typeof timeZone !== "string" || !timeZone) throw new Error("Provider exchange timezone is required to verify completed daily bars");
  const formatter = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = new Map(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}
