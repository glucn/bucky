import type { InvestmentCashFlows } from "../shared/investmentReporting";
import { investmentReportRange } from "./investmentIncomeReporting";

export function previousBookDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

/** Daily TWR convention: incoming capital at day start, withdrawals at day end.
 * Intervals without external flows telescope to their endpoint ratio, so only
 * flow days, their preceding closes and the period boundaries need valuation. */
export async function investmentPeriodReturn(start: string, end: string, flows: InvestmentCashFlows,
  valueAtDate: (date: string) => Promise<number | null>) {
  const { startDate, endDate } = investmentReportRange(start, end), openingDate = previousBookDate(startDate);
  const values = new Map<string, Promise<number | null>>();
  const value = (date: string) => {
    if (!values.has(date)) values.set(date, valueAtDate(date).then((amount) => typeof amount === "number" && Number.isFinite(amount) ? amount : null));
    return values.get(date)!;
  };
  const openingValue = await value(openingDate), closingValue = await value(endDate);
  const rounded = (amount: number) => Math.round(amount * 100) / 100 || 0;
  const knownFlows = flows.rows.every((row) => row.amountBase !== null && Number.isFinite(row.amountBase));
  const totalReturn = openingValue === null || closingValue === null || !knownFlows ? null
    : rounded(closingValue - openingValue - flows.rows.reduce((sum, row) => sum + row.amountBase!, 0));
  let returnIssue: string | null = null, growth = 1, hadCapital = false;
  const unavailable = (date: string) => `Historical portfolio value is unavailable at ${date}. Review prices, FX, dated holdings or checkpoint discrepancies.`;
  if (openingValue === null) returnIssue = unavailable(openingDate);
  else if (closingValue === null) returnIssue = unavailable(endDate);
  else if (!knownFlows) returnIssue = "Historical FX is unavailable for one or more external cash flows.";
  const link = (begin: number | null, finish: number | null, incoming: number, outgoing: number, date: string) => {
    if (returnIssue) return;
    if (begin === null || finish === null) { returnIssue = unavailable(date); return; }
    if (begin === 0 && finish === 0 && incoming === 0 && outgoing === 0) return;
    const capital = begin + incoming;
    if (begin < 0 || finish < 0 || capital <= 0) { returnIssue = `Time-weighted return requires positive portfolio capital at ${date}.`; return; }
    hadCapital = true;
    growth *= (finish + outgoing) / capital;
    if (!Number.isFinite(growth)) returnIssue = "Time-weighted return exceeds the supported numeric range.";
  };
  if (!returnIssue) {
    const dailyFlows = new Map<string, { incoming: number; outgoing: number }>();
    for (const row of flows.rows) {
      const day = dailyFlows.get(row.date) ?? { incoming: 0, outgoing: 0 };
      if (row.amountBase! > 0) day.incoming += row.amountBase!;
      else day.outgoing -= row.amountBase!;
      dailyFlows.set(row.date, day);
    }
    let cursor = openingDate, prior = openingValue;
    for (const date of [...dailyFlows.keys()].sort()) {
      const before = previousBookDate(date);
      if (before > cursor) {
        const next = await value(before); link(prior, next, 0, 0, before); prior = next;
      }
      const next = await value(date), day = dailyFlows.get(date)!;
      link(prior, next, day.incoming, day.outgoing, date); prior = next; cursor = date;
      if (returnIssue) break;
    }
    if (!returnIssue && cursor < endDate) link(prior, closingValue, 0, 0, endDate);
  }
  if (!returnIssue && !hadCapital) returnIssue = "No invested capital in this period; a return percentage is unavailable.";
  return { startDate, endDate, openingDate, openingValue, closingValue, totalReturn,
    totalReturnPercent: returnIssue ? null : rounded((growth - 1) * 100), returnMethod: "time_weighted" as const, returnIssue };
}
