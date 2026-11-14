import { expect, it, vi } from "vitest";
import { investmentPeriodReturn } from "./investmentPeriodReturn";
import type { InvestmentCashFlows } from "../shared/investmentReporting";

const empty = (): InvestmentCashFlows => ({ deposits: 0, withdrawals: 0, depositsByCurrency: {}, withdrawalsByCurrency: {}, rows: [] });
it.each([
  { begin: 100, end: 0, gain: -100, percent: -100 },
  { begin: 100, end: 90, gain: -10, percent: -10 },
  { begin: -100, end: -50, gain: 50, percent: null },
  { begin: 0, end: 10, gain: 10, percent: null },
])("handles loss and nonpositive capital without fabricating a percentage: %j", async ({ begin, end, gain, percent }) => {
  const result = await investmentPeriodReturn("2026-01-01", "2026-01-03", empty(), async (date) => date === "2025-12-31" ? begin : end);
  expect(result).toMatchObject({ totalReturn: gain, totalReturnPercent: percent });
});

it("distinguishes withdrawing all capital from losing all capital", async () => {
  const flows = empty(); flows.withdrawals = 100;
  flows.rows.push({ entryId: "withdrawal", lineId: "cash", accountId: "cash", accountName: "Cash", date: "2026-01-01", currency: "CAD", amount: -100, amountBase: -100, fxSource: "same_currency" });
  expect(await investmentPeriodReturn("2026-01-01", "2026-01-01", flows, async (date) => date === "2025-12-31" ? 100 : 0)).toMatchObject({ totalReturn: 0, totalReturnPercent: 0 });
});

it("retains fractional-cent flow precision when calculating economic gain and percentage", async () => {
  const flows = empty(); flows.deposits = 0.15;
  flows.rows = Array.from({ length: 10 }, (_, index) => ({ entryId: `${index}`, lineId: `${index}`, accountId: "cash", accountName: "Cash", date: "2026-01-01", currency: "USD", amount: 0.01, amountBase: 0.015, fxSource: "as_of" }));
  expect(await investmentPeriodReturn("2026-01-01", "2026-01-01", flows, async (date) => date === "2025-12-31" ? 0 : 0.15)).toMatchObject({ totalReturn: 0, totalReturnPercent: 0 });
});

it("does not require a valuation on every idle calendar day or request a value outside the period boundaries", async () => {
  const values = { "2023-12-31": 0, "2024-02-28": 0, "2024-02-29": 100, "2026-01-03": 110 };
  const read = vi.fn(async (date: string) => {
    if (!(date in values)) throw new Error(`Unexpected valuation date ${date}`);
    return values[date as keyof typeof values];
  });
  const flows = empty(); flows.deposits = 100;
  flows.rows.push({ entryId: "funding", lineId: "cash", accountId: "cash", accountName: "Cash", date: "2024-02-29", currency: "CAD", amount: 100, amountBase: 100, fxSource: "same_currency" });
  expect(await investmentPeriodReturn("2024-01-01", "2026-01-03", flows, read)).toMatchObject({ totalReturn: 10, totalReturnPercent: 10 });
  expect(read).toHaveBeenCalledTimes(4);
});

it.each([NaN, Infinity, -Infinity])("keeps invalid valuation %s unavailable", async (value) => {
  expect(await investmentPeriodReturn("2026-01-01", "2026-01-03", empty(), async () => value)).toMatchObject({ openingValue: null, closingValue: null, totalReturn: null, totalReturnPercent: null });
});
