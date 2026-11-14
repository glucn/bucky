import { AccountSubtype, AccountType } from "./accountTypes";

export function hasPortfolioIdentity(group: {
  accountType: string; isInvestmentPortfolio: boolean;
  accounts: Array<{ type: string; subtype: string; investmentProperties: unknown }>;
}): boolean {
  return group.accountType === AccountType.User && (group.isInvestmentPortfolio || group.accounts.some((account) =>
    account.type === AccountType.User && account.subtype === AccountSubtype.Asset && !!account.investmentProperties));
}

/** Apply only within the selected portfolio's owned accounts. Names are display data.
 * Include archived cash for history, never for new posting or holding setup. */
export function isSettlementCash(account: {
  type: string; subtype: string; isArchived: boolean; investmentProperties: unknown;
}, includeArchived = false): boolean {
  return account.type === AccountType.User && account.subtype === AccountSubtype.Asset &&
    !account.investmentProperties && (includeArchived || !account.isArchived);
}
