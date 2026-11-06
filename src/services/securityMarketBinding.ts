import { type SecurityMarketBinding, parseSecurityIdentity } from "../shared/securityMarket";
import { databaseService } from "./database";

function hasLotHistory(raw: string | null): boolean {
  if (raw === null) return false;
  try { const value: unknown = JSON.parse(raw); return !Array.isArray(value) || value.length > 0; }
  catch { return true; }
}

/** Explicit assignment only. Never changes journal lines, quantities, lots, or account currency. */
export async function bindSecurityMarket(input: SecurityMarketBinding): Promise<void> {
  if (!input || typeof input.accountId !== "string" || !input.accountId ||
    typeof input.quoteCurrency !== "string" || !/^[A-Z]{3}$/.test(input.quoteCurrency) ||
    !(input.expectedMarket === null || typeof input.expectedMarket === "string")) throw new Error("Invalid market binding or quote currency");
  // Validate market before connecting; the real ticker is taken from the persisted holding.
  const { market } = parseSecurityIdentity({ ticker: "validation", market: input.market });
  await databaseService.prismaClient.$transaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { id: input.accountId }, include: { investmentProperties: true } });
    const holding = account?.investmentProperties;
    if (!account || !holding || !account.groupId) throw new Error("Portfolio security account not found");
    if (holding.market !== input.expectedMarket) throw new Error("Market binding changed; refresh the holding before assigning it");
    if (account.currency !== input.quoteCurrency) throw new Error("Quote currency must match the security account currency; existing amounts cannot be relabeled");
    const key = parseSecurityIdentity({ ticker: holding.tickerSymbol, market });
    if (holding.market !== null && holding.market !== market && (holding.quantity !== 0 || hasLotHistory(holding.lots) || await tx.journalLine.count({ where: { accountId: account.id } }))) {
      throw new Error("An established holding or its history cannot be relabeled to another market");
    }
    const peers = await tx.investmentProperties.findMany({ where: { market,
      accountId: { not: account.id }, account: { groupId: account.groupId } }, select: { tickerSymbol: true } });
    if (peers.some((peer) => peer.tickerSymbol.trim() === key.ticker)) throw new Error("This portfolio already contains that security market identity");
    const metadata = await tx.securityMetadata.findUnique({ where: { ticker_market: key } });
    if (metadata?.quoteCurrency && metadata.quoteCurrency !== input.quoteCurrency) throw new Error("Stored market quote currency conflicts with this account");
    if (!metadata) await tx.securityMetadata.create({ data: { ...key, quoteCurrency: input.quoteCurrency } });
    else if (!metadata.quoteCurrency) await tx.securityMetadata.update({ where: { ticker_market: key }, data: { quoteCurrency: input.quoteCurrency } });
    if (holding.market !== market) await tx.investmentProperties.update({ where: { accountId: account.id }, data: { market } });
  });
}
