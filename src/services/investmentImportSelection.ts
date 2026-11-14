import type { InvestmentImportOrigin, Prisma } from "@prisma/client";
import { AccountSubtype, AccountType } from "../shared/accountTypes";
import type { InvestmentImportOptions, InvestmentImportRow } from "../shared/investmentImport";

export class ImportHoldingSelectionError extends Error {}
export const securityImportRow = (row: InvestmentImportRow) => row.type !== "fee" && row.type !== "interest";

/** New origins retain the actual account, including after journal removal. Older origins
 * can establish it from linked structured activity; ticker/currency alone never prove identity. */
export async function originHolding(tx: Prisma.TransactionClient, origin: InvestmentImportOrigin): Promise<string | null> {
  try {
    const id = JSON.parse(origin.payload).selection?.securityAccountId;
    if (typeof id === "string" && id) return id;
  } catch { /* Unreadable legacy metadata cannot establish a target. */ }
  if (!origin.entryId) return null;
  const activities = await tx.investmentActivity.findMany({ where: { journalLinks: { some: { entryId: origin.entryId } } }, select: { accountId: true } });
  const ids = [...new Set(activities.map((activity) => activity.accountId))];
  return ids.length === 1 ? ids[0] : null;
}

export async function resolveImportSelection(tx: Prisma.TransactionClient, portfolioId: string, row: InvestmentImportRow,
  options: InvestmentImportOptions, original?: InvestmentImportOrigin | null) {
  const chosen = options.securityAccountsByRow?.[row.row];
  if (!chosen && !options.tradeCashAccountId && original) {
    return { currency: original.currency, securityAccountId: securityImportRow(row) ? await originHolding(tx, original) : null };
  }
  const accounts = await tx.account.findMany({ where: { groupId: portfolioId }, include: { investmentProperties: true } });
  const cash = accounts.filter((account) => !account.isArchived && !account.investmentProperties && account.type === AccountType.User && account.subtype === AccountSubtype.Asset && account.name.includes("Trade Cash"));
  const selected = options.tradeCashAccountId ? cash.find((account) => account.id === options.tradeCashAccountId) : undefined;
  if (options.tradeCashAccountId && !selected) throw new Error("Selected trade cash account not found in this portfolio");
  const holdings = securityImportRow(row) ? accounts.filter((account) => account.investmentProperties?.tickerSymbol === row.ticker) : [];
  const holding = chosen ? holdings.find((account) => account.id === chosen) : holdings.length === 1 ? holdings[0] : undefined;
  if (chosen && !holding) throw new ImportHoldingSelectionError("Selected holding does not match this portfolio and ticker");
  if (!chosen && holdings.length > 1) throw new ImportHoldingSelectionError(`Select one security account for ${row.ticker} before importing`);
  if (holding) {
    if (row.type !== "split" && selected && selected.currency !== holding.currency) throw new Error("Selected cash account has a different currency from the holding");
    return { currency: holding.currency, securityAccountId: holding.id };
  }
  if (selected) return { currency: selected.currency, securityAccountId: null };
  if (cash.length !== 1) throw new Error("Select a trade cash account to establish this statement's currency");
  return { currency: cash[0].currency, securityAccountId: null };
}
