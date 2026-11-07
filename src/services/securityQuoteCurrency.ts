import type { Prisma } from "@prisma/client";
import { parseSecurityIdentity } from "../shared/securityMarket";

/** A listing's prices cannot be interpreted in an account unit without confirmation. */
export async function securityQuoteCurrency(tx: Prisma.TransactionClient, ticker: string, market: string | null, currency: string) {
  const metadata = market ? await tx.securityMetadata.findUnique({ where: { ticker_market: parseSecurityIdentity({ ticker, market }) }, select: { quoteCurrency: true } }) : null;
  const quoteCurrency = metadata?.quoteCurrency || null;
  const quoteCurrencyIssue = !market ? "Assign this holding's market before using prices." : !quoteCurrency
    ? "Quote currency is unconfirmed. Confirm the market and currency before using prices or posting activity."
    : quoteCurrency !== currency
      ? `Market quote currency ${quoteCurrency} conflicts with holding currency ${currency}. Review the holding identity; amounts have not been converted.`
      : null;
  return { quoteCurrency, quoteCurrencyIssue };
}
