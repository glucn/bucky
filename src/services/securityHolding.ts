import type { Prisma } from "@prisma/client";
import { AccountSubtype, AccountType } from "../shared/accountTypes";
import { parseSecurityIdentity } from "../shared/securityMarket";
import type { NewHoldingInput } from "../shared/securityHolding";
import { investmentTransaction } from "./investmentPosting";
import { bindSecurityMarket } from "./securityMarketBinding";

/** A selected cash account supplies the currency; never infer it from array order. */
export async function selectPortfolioCash(tx: Prisma.TransactionClient, portfolioId: string, cashId?: string) {
  if (typeof portfolioId !== "string" || !portfolioId) throw new Error("Portfolio ID is required");
  const portfolio = await tx.accountGroup.findUnique({ where: { id: portfolioId }, include: { accounts: { include: { investmentProperties: true } } } });
  if (!portfolio) throw new Error("Portfolio not found");
  if (portfolio.accountType !== AccountType.User) throw new Error("Investment portfolio must be a user account group");
  const eligible = portfolio.accounts.filter((a) => !a.isArchived && a.type === AccountType.User && a.subtype === AccountSubtype.Asset && !a.investmentProperties && a.name.includes("Trade Cash"));
  const cash = cashId ? eligible.find((a) => a.id === cashId) : eligible.length === 1 ? eligible[0] : undefined;
  if (!cash) throw new Error("Select an active Trade Cash account in this portfolio");
  return { portfolio, cash };
}

export async function createHolding(input: Omit<NewHoldingInput, "market" | "quoteCurrency" | "tradeCashAccountId"> & {
  market?: string; quoteCurrency?: string; tradeCashAccountId?: string;
}) {
  if (!input || typeof input.tickerSymbol !== "string") throw new Error("Ticker symbol is required");
  // Reuse the identity parser's ticker validation even for legacy unresolved accounts.
  const identity = parseSecurityIdentity({ ticker: input.tickerSymbol, market: input.market === undefined ? "validation" : input.market });
  if (!["FIFO", "AVERAGE_COST"].includes(input.costBasisMethod)) throw new Error("Select a supported cost basis method");
  if (input.securityType !== undefined && (typeof input.securityType !== "string" || !input.securityType.trim() || input.securityType.length > 64)) throw new Error("Invalid security type");
  return investmentTransaction(async (tx) => {
    const { portfolio, cash } = await selectPortfolioCash(tx, input.portfolioId, input.tradeCashAccountId);
    if (input.market !== undefined && (!input.tradeCashAccountId || !input.quoteCurrency)) throw new Error("Select cash account and quote currency explicitly");
    if (input.quoteCurrency !== undefined && (!/^[A-Z]{3}$/.test(input.quoteCurrency) || input.quoteCurrency !== cash.currency)) throw new Error("Quote currency must match the selected cash account currency");
    const peers = portfolio.accounts.filter((a) => a.investmentProperties?.tickerSymbol.trim() === identity.ticker);
    if (peers.some((a) => input.market === undefined || !a.investmentProperties!.market || a.investmentProperties!.market === identity.market)) {
      if (input.market === undefined) throw new Error(`Security account for ${identity.ticker} already exists in this portfolio`);
      throw new Error("Security account already exists; resolve its market before creating another listing");
    }
    const account = await tx.account.create({ data: {
      name: input.market === undefined ? identity.ticker : `${identity.ticker} (${identity.market})`,
      type: AccountType.User, subtype: AccountSubtype.Asset, currency: cash.currency, groupId: portfolio.id,
      investmentProperties: { create: { tickerSymbol: identity.ticker, securityType: input.securityType,
        quantity: 0, hasCompleteActivityHistory: true, costBasisMethod: input.costBasisMethod,
        lots: input.costBasisMethod === "FIFO" ? "[]" : null } },
    } });
    if (input.market !== undefined) await bindSecurityMarket({ accountId: account.id, market: identity.market, quoteCurrency: cash.currency, expectedMarket: null }, tx);
    return tx.account.findUniqueOrThrow({ where: { id: account.id }, include: { investmentProperties: true } });
  });
}
