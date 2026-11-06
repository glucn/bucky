import type { SecuritySearchCandidate } from "./enrichmentProviderRegistry";
import { parseSecurityIdentity } from "../shared/securityMarket";
export type RefreshHolding = { tickerSymbol: string; market: string | null; account: { currency: string } };
export type RefreshTarget = { ticker: string; market: string; quoteCurrency: string; validationError?: string };
export async function securityRefreshTargets(holdings: RefreshHolding[], metadata: Array<{ ticker: string; market: string; quoteCurrency: string | null }>,
  search: (ticker: string) => Promise<SecuritySearchCandidate[]>, canceled: () => boolean): Promise<RefreshTarget[]> {
  const discoveries = new Map<string, Promise<SecuritySearchCandidate[]>>(), targets = new Map<string, RefreshTarget>();
  for (const holding of holdings) {
    if (canceled()) return [];
    const ticker = holding.tickerSymbol.trim(), quoteCurrency = holding.account.currency;
    let target: RefreshTarget = { ticker, market: holding.market?.trim() || "UNKNOWN", quoteCurrency };
    try {
      if (!/^[A-Z]{3}$/.test(quoteCurrency)) throw new Error("Security account quote currency is invalid");
      if (!holding.market || holding.market === "UNKNOWN") {
        if (!discoveries.has(ticker)) discoveries.set(ticker, search(ticker).catch(() => []));
        const matches = (await discoveries.get(ticker)!).filter((candidate) => candidate.symbol.trim() === ticker && candidate.market && candidate.market !== "UNKNOWN");
        if (canceled()) return [];
        const unique = new Map(matches.map((candidate) => [JSON.stringify([candidate.symbol, candidate.market, candidate.quoteCurrency]), candidate]));
        if (unique.size !== 1) throw new Error("Select an explicit market before refreshing this unresolved security");
        const candidate = [...unique.values()][0];
        if (candidate.quoteCurrency && candidate.quoteCurrency !== quoteCurrency) throw new Error("Discovered market quote currency conflicts with the security account");
        target.market = candidate.market.trim();
      }
      const key = parseSecurityIdentity({ ticker, market: target.market });
      const stored = metadata.find((row) => row.ticker === key.ticker && row.market === key.market);
      if (stored?.quoteCurrency && stored.quoteCurrency !== quoteCurrency) throw new Error("Stored market quote currency conflicts with the security account");
      target = { ...key, quoteCurrency };
    } catch (reason) { target.validationError = reason instanceof Error ? reason.message : "Select an explicit security market"; }
    targets.set(JSON.stringify([target.ticker, target.market, target.quoteCurrency]), target);
  }
  return [...targets.values()];
}
