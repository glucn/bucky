import type { Prisma } from "@prisma/client";
import { AccountSubtype, AccountType } from "../shared/accountTypes";
import { parseToStandardDate } from "../shared/dateUtils";
import { databaseService } from "./database";
import { addDecimalRatios, decimalRatio, roundDecimalRatio, sumJournalCents, toJournalCents, type DecimalRatio } from "./journalPrecision";
import { hasPortfolioIdentity, isSettlementCash } from "../shared/investmentAccounts";

export function investmentTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, tx?: Prisma.TransactionClient): Promise<T> {
  return tx ? operation(tx) : databaseService.prismaClient.$transaction(operation, { timeout: 30000 });
}

export type InvestmentSelection = { portfolioId: string; tickerSymbol: string; securityAccountId?: string; tradeCashAccountId?: string };

export type Lot = { date: string; quantity: number; pricePerShare: number; amount: number };

export function cents(value: number): number {
  return toJournalCents(value);
}

export function tradeGrossCents(units: number, price: number | string): number {
  const quantity = decimalRatio(units), unitPrice = decimalRatio(price);
  const gross = Number(roundDecimalRatio(quantity.numerator * unitPrice.numerator * 100n, quantity.denominator * unitPrice.denominator));
  if (!Number.isSafeInteger(gross)) throw new Error("Trade amount exceeds supported precision");
  return gross;
}

export function proportionalBasisCents(basis: number, unitsSold: number, unitsHeld: number): number {
  const sold = decimalRatio(unitsSold), held = decimalRatio(unitsHeld);
  return Number(roundDecimalRatio(BigInt(basis) * sold.numerator * held.denominator, sold.denominator * held.numerator));
}

function quantityFromDecimal(value: DecimalRatio): number {
  // Quantity arithmetic keeps power-of-ten denominators. Parse the exact decimal once
  // at the current numeric boundary instead of rounding numerator and quotient separately.
  return Number(`${value.numerator}e-${value.denominator.toString().length - 1}`);
}

export function addInvestmentUnits(quantity: number, change: number): number {
  return quantityFromDecimal(addDecimalRatios(decimalRatio(quantity), decimalRatio(change)));
}

export function scaleInvestmentUnits(quantity: number, factor: number): number {
  const units = decimalRatio(quantity), scale = decimalRatio(factor);
  return quantityFromDecimal({ numerator: units.numerator * scale.numerator, denominator: units.denominator * scale.denominator });
}

export async function readInvestmentBasisCents(tx: Prisma.TransactionClient, accountId: string): Promise<bigint> {
  const postings = await tx.journalLine.findMany({ where: { accountId }, select: { amount: true, amountCents: true } });
  return sumJournalCents(postings);
}
export function readLots(value: string | null, quantity: number): Lot[] {
  const lots: Lot[] = value ? JSON.parse(value) : [];
  if (!Array.isArray(lots) || lots.some((lot) => !lot || !Number.isFinite(lot.quantity) || lot.quantity <= 0 ||
    !Number.isFinite(lot.amount) || lot.amount < 0 || !parseToStandardDate(lot.date))) throw new Error("Invalid FIFO lot data");
  if (Math.abs(lots.reduce((sum, lot) => sum + lot.quantity, 0) - quantity) > 1e-8 * Math.max(1, quantity)) {
    throw new Error("FIFO lots do not match the position quantity");
  }
  return lots;
}

export async function resolveInvestmentAccounts(tx: Prisma.TransactionClient, input: InvestmentSelection,
  options: { createSecurity: boolean; requireSecurity: boolean }) {
    if (!input.portfolioId) throw new Error("Portfolio ID is required");
    if (typeof input.tickerSymbol !== "string" || !input.tickerSymbol.trim()) throw new Error("Ticker symbol is required");
    const ticker = input.tickerSymbol.trim();
    const portfolio = await tx.accountGroup.findUnique({ where: { id: input.portfolioId }, include: { accounts: { include: { investmentProperties: true } } } });
    if (!portfolio) throw new Error("Portfolio not found");
    if (portfolio.accountType !== AccountType.User) throw new Error("Investment portfolio must be a user account group");
    if (!hasPortfolioIdentity(portfolio)) throw new Error("Review and confirm this account group as an investment portfolio before posting");
    const matches = portfolio.accounts.filter((account) => account.investmentProperties?.tickerSymbol.trim() === ticker);
    let security = input.securityAccountId ? matches.find((account) => account.id === input.securityAccountId) : matches.length === 1 ? matches[0] : undefined;
    if (input.securityAccountId && !security) throw new Error("Selected security does not match this portfolio and ticker");
    if (!input.securityAccountId && matches.length > 1) throw new Error("Select an explicit security account for this ticker");
    if (security?.isArchived) throw new Error("Security account is archived");
    if (!security && options.requireSecurity && !options.createSecurity) throw new Error(`Security account for ${ticker} not found in portfolio`);
    const cashAccounts = portfolio.accounts.filter((account) => isSettlementCash(account));
    const eligibleCash = cashAccounts.filter((account) => !security || account.currency === security.currency);
    const cash = input.tradeCashAccountId ? eligibleCash.find((account) => account.id === input.tradeCashAccountId) : eligibleCash.length === 1 ? eligibleCash[0] : undefined;
    if (!cash) {
      if (eligibleCash.length > 1) throw new Error("Select an explicit trade cash account");
      throw new Error("Trade Cash account not found in portfolio for the security currency");
    }
    if (!security && options.createSecurity) {
      security = await tx.account.create({ data: {
        name: ticker, type: AccountType.User, subtype: AccountSubtype.Asset, currency: cash.currency, groupId: portfolio.id,
        investmentProperties: { create: { tickerSymbol: ticker, quantity: 0, hasCompleteActivityHistory: true, costBasisMethod: "FIFO", lots: "[]" } },
      }, include: { investmentProperties: true } });
    }
    return { security, cash };
}
