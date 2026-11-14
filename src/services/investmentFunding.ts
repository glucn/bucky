import { databaseService } from "./database";
import { cents, investmentTransaction } from "./investmentPosting";
import { hasPortfolioIdentity, isSettlementCash } from "../shared/investmentAccounts";
import { AccountType } from "../shared/accountTypes";
import { parseToStandardDate } from "../shared/dateUtils";
import type { FundingAccount, InvestmentFundingOptions } from "../shared/investmentFunding";

const money = (value: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error("Amount must be a positive number");
  const rounded = cents(value) / 100;
  if (rounded <= 0) throw new Error("Amount must round to at least one cent");
  return rounded;
};

export async function fundingAccounts(portfolioId: string): Promise<FundingAccount[]> {
  const portfolio = await databaseService.prismaClient.accountGroup.findUnique({ where: { id: portfolioId }, include: { accounts: { include: { investmentProperties: true } } } });
  if (!portfolio || !hasPortfolioIdentity(portfolio)) throw new Error("Review and confirm the investment portfolio first");
  const accounts = await databaseService.prismaClient.account.findMany({ where: { type: AccountType.User, isArchived: false, investmentProperties: null,
    OR: [{ groupId: null }, { groupId: { not: portfolioId } }] }, include: { group: { select: { name: true } } }, orderBy: { name: "asc" } });
  return accounts.map((account) => ({ id: account.id, name: account.name, currency: account.currency, subtype: account.subtype, groupId: account.groupId, groupName: account.group?.name ?? null }));
}

export async function recordPortfolioFunding(kind: "deposit" | "withdrawal", portfolioId: string, amount: number,
  counterAccountId: string, dateInput: string, description?: string, options: InvestmentFundingOptions = {}) {
  if (typeof portfolioId !== "string" || !portfolioId) throw new Error("Portfolio ID is required");
  const portfolioAmount = money(amount), side = kind === "deposit" ? "Source" : "Destination";
  if (typeof counterAccountId !== "string" || !counterAccountId.trim()) throw new Error(`${side} account ID is required`);
  if (typeof dateInput !== "string" || !dateInput.trim()) throw new Error("Transaction date is required");
  const date = parseToStandardDate(dateInput);
  if (!date) throw new Error("Invalid transaction date");
  if (description !== undefined && typeof description !== "string") throw new Error("Invalid description");
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new Error("Invalid funding options");
  return investmentTransaction(async (tx) => {
    const portfolio = await tx.accountGroup.findUnique({ where: { id: portfolioId }, include: { accounts: { include: { investmentProperties: true } } } });
    if (!portfolio) throw new Error("Portfolio not found");
    if (!hasPortfolioIdentity(portfolio)) throw new Error("Review and confirm the investment portfolio first");
    const eligible = portfolio.accounts.filter((account) => isSettlementCash(account));
    const cash = options.tradeCashAccountId ? eligible.find((account) => account.id === options.tradeCashAccountId) : eligible.length === 1 ? eligible[0] : undefined;
    if (!cash) {
      if (!options.tradeCashAccountId && !eligible.length) throw new Error("Trade cash account not found in portfolio");
      throw new Error("Select an explicit active trade cash account in this portfolio");
    }
    const other = await tx.account.findUnique({ where: { id: counterAccountId }, include: { investmentProperties: true } });
    if (!other) throw new Error(`${side} account not found`);
    if (other.type !== AccountType.User || other.isArchived || other.investmentProperties || other.groupId === portfolioId) throw new Error("Select an active external user cash account, not a security holding or this portfolio's cash");
    if ((options.expectedCashCurrency !== undefined && options.expectedCashCurrency !== cash.currency) ||
      (options.expectedCounterCurrency !== undefined && options.expectedCounterCurrency !== other.currency)) throw new Error("Account currency changed; reload the funding accounts before saving");
    if (![cash.currency, other.currency].every((currency) => /^[A-Z]{3}$/.test(currency))) throw new Error("Account currency requires review");
    const wrongUnit = await tx.journalLine.findFirst({ where: { OR: [{ accountId: cash.id, currency: { not: cash.currency } }, { accountId: other.id, currency: { not: other.currency } }] } });
    if (wrongUnit) throw new Error("Account journal currency requires review before funding");
    const isFx = cash.currency !== other.currency;
    if (isFx && options.counterAmount === undefined) throw new Error("Supply the actual amount in the other account's currency");
    const counterAmount = options.counterAmount === undefined ? portfolioAmount : money(options.counterAmount);
    if (!isFx && cents(counterAmount) !== cents(portfolioAmount)) throw new Error("Amounts must be equal for the same currency");
    const amountFrom = kind === "deposit" ? counterAmount : portfolioAmount, amountTo = kind === "deposit" ? portfolioAmount : counterAmount;
    const rate = options.exchangeRate ?? amountTo / amountFrom;
    if (!Number.isFinite(rate) || rate <= 0 || cents(amountFrom * rate) !== cents(amountTo) || (!isFx && rate !== 1)) throw new Error("Amounts and exchange rate are inconsistent");
    const otherGroup = kind === "deposit" && other.groupId && isSettlementCash(other) ? await tx.accountGroup.findUnique({ where: { id: other.groupId }, include: { accounts: { include: { investmentProperties: true } } } }) : null;
    const outgoingCash = kind === "withdrawal" ? cash : otherGroup && hasPortfolioIdentity(otherGroup) ? other : null;
    if (outgoingCash) {
      const ledger = await tx.journalLine.aggregate({ where: { accountId: outgoingCash.id, entry: { date: { lte: date } } }, _sum: { amount: true } });
      const balance = await databaseService.getAccountBalanceAtDate(outgoingCash.id, date, tx);
      const journalBalance = cents(ledger._sum.amount ?? 0) / 100;
      if (cents(balance) !== cents(journalBalance)) throw new Error("Cash checkpoint disagrees with the journal; reconcile before withdrawing");
      if (cents(journalBalance) < cents(amountFrom)) throw new Error(`Insufficient trade cash balance: trying to withdraw ${amountFrom} but only ${journalBalance} available in ${outgoingCash.currency} as of ${date}`);
    }
    const result = await databaseService.createJournalEntry({ date, description: description || `Cash ${kind === "deposit" ? "deposit to" : "withdrawal from"} investment portfolio`,
      fromAccountId: kind === "deposit" ? other.id : cash.id, toAccountId: kind === "deposit" ? cash.id : other.id,
      ...(isFx ? { type: "currency_transfer", amountFrom, amountTo, exchangeRate: rate } : { amount: portfolioAmount }), transactionType: "transfer", skipDuplicateCheck: false }, tx);
    if (result.skipped || !result.entry) throw new Error(`Failed to create ${kind} transaction: ${result.reason}`);
    return tx.journalEntry.update({ where: { id: result.entry.id }, data: { type: kind === "deposit" ? "investment_cash_deposit" : "investment_cash_withdrawal" }, include: { lines: true } });
  });
}
