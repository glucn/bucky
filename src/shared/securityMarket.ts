export type SecurityIdentity = { ticker: string; market: string };
export type SecurityMarketBinding = { accountId: string; market: string; quoteCurrency: string; expectedMarket: string | null };

/** Market names are opaque provider identities: preserve case, never guess an exchange. */
export function parseSecurityIdentity(input: unknown): SecurityIdentity {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 2 ||
    !Object.hasOwn(input, "ticker") || !Object.hasOwn(input, "market")) throw new Error("Ticker and market identity are required");
  const { ticker, market } = input as SecurityIdentity;
  if (typeof ticker !== "string" || !ticker.trim() || ticker.length > 64 || /[\u0000-\u001f\u007f]/.test(ticker)) throw new Error("Invalid security ticker");
  if (typeof market !== "string" || !market.trim() || market.trim().toUpperCase() === "UNKNOWN" || market.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(market)) throw new Error("An explicit resolved market is required");
  return { ticker: ticker.trim(), market: market.trim() };
}
