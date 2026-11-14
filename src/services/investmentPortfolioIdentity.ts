import { databaseService } from "./database";
import { AccountType } from "../shared/accountTypes";
import { hasPortfolioIdentity, isSettlementCash } from "../shared/investmentAccounts";
import { investmentTransaction } from "./investmentPosting";

const accounts = { include: { investmentProperties: true } } as const;
const validCurrency = (currency: string) => {
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) throw new Error("Use a valid three-letter currency code");
};

export async function createPortfolio(name: string, currency: string) {
  if (typeof name !== "string" || !name.trim()) throw new Error("Portfolio name is required");
  validCurrency(currency);
  return investmentTransaction(async (tx) => {
    const created = await databaseService.createAccountGroup({ name: name.trim(), accountType: AccountType.User }, tx);
    const group = await tx.accountGroup.update({ where: { id: created.id }, data: { isInvestmentPortfolio: true } });
    const cash = await databaseService.createAccount({ name: `Trade Cash - ${group.name} (${currency})`, type: AccountType.User, currency }, tx);
    await databaseService.addAccountToGroup(cash.id, group.id, tx);
    return { group, tradeCashAccount: cash };
  });
}

export async function listPortfolios() {
  const groups = await databaseService.prismaClient.accountGroup.findMany({ where: { accountType: AccountType.User }, orderBy: { displayOrder: "asc" }, include: { accounts } });
  return groups.filter(hasPortfolioIdentity);
}

export async function readPortfolioAccounts(portfolioId: string) {
  const portfolio = await databaseService.prismaClient.accountGroup.findUnique({ where: { id: portfolioId }, include: { accounts } });
  if (!portfolio || portfolio.accountType !== AccountType.User) throw new Error("Portfolio not found");
  if (!hasPortfolioIdentity(portfolio)) throw new Error("Review and confirm this account group as an investment portfolio");
  const tradeCashAccounts = portfolio.accounts.filter((account) => isSettlementCash(account, true));
  const securities = portfolio.accounts.flatMap((account) => account.type === AccountType.User && account.investmentProperties ? [{ ...account, investmentProperties: account.investmentProperties }] : []);
  return { tradeCash: tradeCashAccounts[0] ?? null, tradeCashAccounts, securities };
}

export async function lookupPortfolioCash(portfolioId: string, currency: string) {
  const matching = (await readPortfolioAccounts(portfolioId)).tradeCashAccounts.filter((account) => !account.isArchived && account.currency === currency);
  if (matching.length > 1) throw new Error("Multiple settlement accounts use this currency; select an explicit trade cash account");
  return matching[0] ?? null;
}

export async function addPortfolioCash(portfolioId: string, currency: string) {
  validCurrency(currency);
  return investmentTransaction(async (tx) => {
    const portfolio = await tx.accountGroup.findUnique({ where: { id: portfolioId }, include: { accounts } });
    if (!portfolio || portfolio.accountType !== AccountType.User) throw new Error("Portfolio not found");
    if (!hasPortfolioIdentity(portfolio)) throw new Error("Review and confirm this account group as an investment portfolio");
    if (portfolio.accounts.some((account) => isSettlementCash(account, true) && account.currency === currency)) throw new Error(`Trade cash account for ${currency} already exists in this portfolio`);
    const cash = await databaseService.createAccount({ name: `Trade Cash - ${portfolio.name} (${currency})`, type: AccountType.User, currency }, tx);
    await databaseService.addAccountToGroup(cash.id, portfolioId, tx);
    await tx.accountGroup.update({ where: { id: portfolioId }, data: { isInvestmentPortfolio: true } });
    return cash;
  });
}

export async function reviewPortfolioCandidates() {
  const groups = await databaseService.prismaClient.accountGroup.findMany({ where: { accountType: AccountType.User }, orderBy: { displayOrder: "asc" }, include: { accounts } });
  return groups.filter((group) => !hasPortfolioIdentity(group) && group.accounts.length > 0 && group.accounts.every((account) => isSettlementCash(account, true)));
}

export async function confirmPortfolio(groupId: string, expectedAccountIds: string[]) {
  if (!Array.isArray(expectedAccountIds) || expectedAccountIds.some((id) => typeof id !== "string") || new Set(expectedAccountIds).size !== expectedAccountIds.length) throw new Error("Review the account membership before confirming");
  return investmentTransaction(async (tx) => {
    const group = await tx.accountGroup.findUnique({ where: { id: groupId }, include: { accounts } });
    if (!group || group.accountType !== AccountType.User || !group.accounts.length || !group.accounts.every((account) => isSettlementCash(account, true))) throw new Error("Review an existing user cash group before confirming it as a portfolio");
    if (JSON.stringify(group.accounts.map((account) => account.id).sort()) !== JSON.stringify([...expectedAccountIds].sort())) throw new Error("Account membership changed; reload the portfolio review");
    return tx.accountGroup.update({ where: { id: groupId }, data: { isInvestmentPortfolio: true } });
  });
}
