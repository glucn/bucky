import { expect, it, vi } from "vitest";
import { securityRefreshTargets } from "./securityRefreshTargets";

const holding = (market: string | null, currency = "USD") => ({ tickerSymbol: "ABC", market, account: { currency } });
const candidate = (market: string, symbol = "ABC", quoteCurrency = "USD") => ({ symbol, market, quoteCurrency, displayName: null });
it("preserves distinct bound markets for one ticker and never chooses first metadata or searches", async () => {
  const search = vi.fn();
  const targets = await securityRefreshTargets([holding("NASDAQ"), holding("LSE", "GBP"), holding("NASDAQ")],
    [{ ticker: "ABC", market: "LSE", quoteCurrency: "GBP" }, { ticker: "ABC", market: "NASDAQ", quoteCurrency: "USD" }], search, () => false);
  expect(targets).toEqual([{ ticker: "ABC", market: "NASDAQ", quoteCurrency: "USD" }, { ticker: "ABC", market: "LSE", quoteCurrency: "GBP" }]);
  expect(search).not.toHaveBeenCalled();
});
it("leaves ambiguous or unrelated ticker discoveries unresolved rather than taking the first result", async () => {
  for (const candidates of [[candidate("NASDAQ"), candidate("NYSE")], [candidate("NASDAQ", "DIFFERENT")], []]) {
    const targets = await securityRefreshTargets([holding(null)], [{ ticker: "ABC", market: "NASDAQ", quoteCurrency: "USD" }], async () => candidates, () => false);
    expect(targets).toEqual([expect.objectContaining({ ticker: "ABC", market: "UNKNOWN", validationError: expect.stringMatching(/select.*market/i) })]);
  }
});
it("allows a single exact discovery without changing the saved holding and refuses quote-currency conflicts", async () => {
  const saved = [holding(null)];
  expect(await securityRefreshTargets(saved, [], async () => [candidate("NASDAQ")], () => false)).toEqual([{ ticker: "ABC", market: "NASDAQ", quoteCurrency: "USD" }]);
  expect(saved[0].market).toBeNull();
  const mismatch = await securityRefreshTargets([holding("NASDAQ")], [{ ticker: "ABC", market: "NASDAQ", quoteCurrency: "CAD" }], vi.fn(), () => false);
  expect(mismatch[0].validationError).toMatch(/currency/i);
});
it("does not initiate discovery after cancellation", async () => {
  const search = vi.fn(); expect(await securityRefreshTargets([holding(null)], [], search, () => true)).toEqual([]); expect(search).not.toHaveBeenCalled();
});
