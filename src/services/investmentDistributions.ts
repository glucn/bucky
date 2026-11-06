import type { Prisma } from "@prisma/client";
import { databaseService } from "./database";
import { AccountType } from "../shared/accountTypes";
import { parseToStandardDate } from "../shared/dateUtils";
import { cents, readLots, resolveInvestmentAccounts, type InvestmentSelection, type Lot } from "./investmentPosting";

export type DividendInput = InvestmentSelection & { amount: number; date: string; isReturnOfCapital?: boolean; description?: string };
export type ReinvestmentInput = InvestmentSelection & { dividendAmount: number; reinvestmentPrice: number; date: string; recordAsIncome: boolean; description?: string };
function normalizedDate(value: string): string {
  const date = typeof value === "string" ? parseToStandardDate(value) : null;
  if (!date) throw new Error("Transaction date is required and must be valid");
  return date;
}
function distributionAmount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Dividend amount must be a positive number");
  const amount = cents(value);
  if (amount <= 0) throw new Error("Dividend amount must round to a positive cent amount");
  return amount;
}
function positionLots(props: { quantity: number; costBasisMethod: string; lots: string | null }): Lot[] | null {
  if (!Number.isFinite(props.quantity) || props.quantity < 0 || !["FIFO", "AVERAGE_COST"].includes(props.costBasisMethod)) throw new Error("Invalid stored investment position");
  return props.costBasisMethod === "FIFO" ? readLots(props.lots, props.quantity) : null;
}

// Decimal representations of stored quantities provide integer weights without rounding units
// to a new precision. BL-031 must still replace the underlying Float storage and arithmetic.
function shareWeights(lots: Lot[]): bigint[] {
  const parts = lots.map((lot) => {
    const [mantissa, exponent = "0"] = lot.quantity.toString().split("e");
    const [whole, fraction = ""] = mantissa.split(".");
    return { digits: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
  });
  const minimumExponent = Math.min(...parts.map((part) => part.exponent));
  return parts.map((part) => part.digits * 10n ** BigInt(part.exponent - minimumExponent));
}

// A whole-position distribution applies the same amount per held share. Preserve the exact
// cent total with deterministic remainders, and refuse any lot requiring excess classification.
function reduceLots(lots: Lot[], reduction: number): Lot[] {
  const costs = lots.map((lot) => cents(lot.amount)), total = costs.reduce((sum, cost) => sum + cost, 0);
  if (!Number.isSafeInteger(total) || total < reduction || total <= 0) throw new Error("Return of capital exceeds available lot basis");
  const weights = shareWeights(lots), divisor = weights.reduce((sum, weight) => sum + weight, 0n);
  const portions = weights.map((weight, index) => {
    const product = BigInt(reduction) * weight;
    return { index, reduction: Number(product / divisor), remainder: product % divisor };
  });
  let remainder = reduction - portions.reduce((sum, portion) => sum + portion.reduction, 0);
  const ordered = [...portions].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const portion of ordered) { if (remainder-- <= 0) break; portion.reduction++; }
  if (portions.some((portion) => portion.reduction > costs[portion.index])) throw new Error("Return of capital exceeds a lot's basis; classify excess explicitly");
  return lots.map((lot, index) => ({ ...lot, amount: (costs[index] - portions[index].reduction) / 100 }));
}
async function reducedBasis(tx: Prisma.TransactionClient, accountId: string, lots: Lot[] | null, amount: number) {
  const balance = await tx.journalLine.aggregate({ where: { accountId }, _sum: { amount: true } });
  const basis = cents(balance._sum.amount ?? 0);
  if (basis < amount) throw new Error("Return of capital exceeds available cost basis; classify excess explicitly");
  if (lots && lots.reduce((sum, lot) => sum + cents(lot.amount), 0) !== basis) throw new Error("FIFO lot basis does not match journal basis");
  return lots ? reduceLots(lots, amount) : null;
}
function journal(tx: Prisma.TransactionClient, date: string, description: string, type: string, currency: string,
  postings: Array<{ accountId: string; cents: number }>) {
  return tx.journalEntry.create({ data: { date, description, type, displayOrder: Date.now(), lines: { create:
    postings.map((posting) => ({ accountId: posting.accountId, amount: posting.cents / 100, currency, description })),
  } }, include: { lines: true } });
}
async function incomeAccount(tx: Prisma.TransactionClient) {
  const account = await tx.account.findFirst({ where: { name: "Dividend Income", type: AccountType.Category, isArchived: false } });
  if (!account) throw new Error("Dividend Income category account not found");
  return account;
}

export async function recordCashDividend(input: DividendInput) {
  const date = normalizedDate(input.date), amount = distributionAmount(input.amount);
  if (input.isReturnOfCapital !== undefined && typeof input.isReturnOfCapital !== "boolean") throw new Error("Select dividend classification explicitly");
  return databaseService.prismaClient.$transaction(async (tx) => {
    const { security, cash } = await resolveInvestmentAccounts(tx, input, { createSecurity: false, requireSecurity: Boolean(input.isReturnOfCapital) });
    const description = input.description || `Dividend from ${input.tickerSymbol.trim()}${input.isReturnOfCapital ? " (Return of Capital)" : ""}`;
    let creditAccountId: string;
    if (input.isReturnOfCapital) {
      const props = security!.investmentProperties!, lots = await reducedBasis(tx, security!.id, positionLots(props), amount);
      await tx.investmentProperties.update({ where: { id: props.id }, data: { lots: lots ? JSON.stringify(lots) : null } });
      creditAccountId = security!.id;
    } else creditAccountId = (await incomeAccount(tx)).id;
    return journal(tx, date, description, "dividend_cash", cash.currency, [{ accountId: cash.id, cents: amount }, { accountId: creditAccountId, cents: -amount }]);
  }, { timeout: 30000 });
}

export async function recordReinvestment(input: ReinvestmentInput) {
  const date = normalizedDate(input.date), amount = distributionAmount(input.dividendAmount);
  if (!Number.isFinite(input.reinvestmentPrice) || input.reinvestmentPrice <= 0) throw new Error("Reinvestment price must be a positive number");
  if (typeof input.recordAsIncome !== "boolean") throw new Error("Select reinvestment classification explicitly");
  const quantity = Math.round((amount / 100 / input.reinvestmentPrice) * 1e6) / 1e6;
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Reinvestment quantity exceeds supported precision");
  return databaseService.prismaClient.$transaction(async (tx) => {
    const { security, cash } = await resolveInvestmentAccounts(tx, input, { createSecurity: input.recordAsIncome, requireSecurity: true });
    const props = security!.investmentProperties!;
    let lots = positionLots(props);
    const description = input.description || `Reinvested dividend from ${input.tickerSymbol.trim()}`;
    let sourceAccountId: string;
    if (input.recordAsIncome) sourceAccountId = (await incomeAccount(tx)).id;
    else { lots = await reducedBasis(tx, security!.id, lots, amount); sourceAccountId = security!.id; }
    await journal(tx, date, `${description} - ${input.recordAsIncome ? "Income" : "Return of Capital"}`, "dividend_cash", cash.currency,
      [{ accountId: cash.id, cents: amount }, { accountId: sourceAccountId, cents: -amount }]);
    const entry = await journal(tx, date, `${description} - Purchase${input.recordAsIncome ? "" : " (Cost Basis Reduction)"}`, "dividend_reinvest", cash.currency,
      [{ accountId: security!.id, cents: amount }, { accountId: cash.id, cents: -amount }]);
    const newQuantity = props.quantity + quantity;
    if (!Number.isFinite(newQuantity)) throw new Error("Reinvestment quantity exceeds supported precision");
    lots?.push({ date, quantity, pricePerShare: input.reinvestmentPrice, amount: amount / 100 });
    await tx.investmentProperties.update({ where: { id: props.id }, data: { quantity: newQuantity, lots: lots ? JSON.stringify(lots) : null } });
    return entry;
  }, { timeout: 30000 });
}

export async function recordSplit(accountId: string, splitRatio: number, inputDate: string, description?: string) {
  if (typeof accountId !== "string" || !accountId.trim()) throw new Error("Account ID is required");
  if (!Number.isFinite(splitRatio) || splitRatio <= 0) throw new Error("Split ratio must be a positive number");
  const date = normalizedDate(inputDate);
  return databaseService.prismaClient.$transaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { id: accountId }, include: { investmentProperties: true } });
    if (!account?.investmentProperties || account.isArchived) throw new Error("Security account not found or archived");
    const props = account.investmentProperties, lots = positionLots(props);
    const quantity = props.quantity * splitRatio;
    const updatedLots = lots?.map((lot) => ({ ...lot, quantity: lot.quantity * splitRatio, pricePerShare: lot.pricePerShare / splitRatio }));
    if (!Number.isFinite(quantity) || (props.quantity > 0 && quantity <= 0) || updatedLots?.some((lot) => !Number.isFinite(lot.quantity) || lot.quantity <= 0 || !Number.isFinite(lot.pricePerShare))) {
      throw new Error("Split result exceeds supported precision");
    }
    await tx.investmentProperties.update({ where: { id: props.id }, data: { quantity, lots: updatedLots ? JSON.stringify(updatedLots) : null } });
    return tx.journalEntry.create({ data: { date, description: description || `Stock split ${splitRatio}:1 for ${props.tickerSymbol}`, type: "stock_split", displayOrder: Date.now() }, include: { lines: true } });
  }, { timeout: 30000 });
}
