import type { Prisma } from "@prisma/client";
import { beginInvestmentActivity, finishInvestmentActivity } from "./investmentActivity";
import { AccountType } from "../shared/accountTypes";
import { cents, readLots, resolveInvestmentAccounts, investmentTransaction } from "./investmentPosting";
import { parseToStandardDate } from "../shared/dateUtils";

export type InvestmentTrade = {
  portfolioId: string;
  tickerSymbol: string;
  quantity: number;
  pricePerShare: number;
  date: string;
  fee?: number;
  description?: string;
  securityAccountId?: string;
  tradeCashAccountId?: string;
};
/** Journal, implicit account creation and position changes share one database transaction.
 * Acquisition fees are capitalized; disposal fees reduce proceeds and realized gains.
 * Neither is posted a second time as a separate expense.
 */
export async function recordInvestmentTrade(kind: "buy" | "sell", input: InvestmentTrade, transaction?: Prisma.TransactionClient) {
  if (!input.portfolioId) throw new Error("Portfolio ID is required");
  if (typeof input.tickerSymbol !== "string" || !input.tickerSymbol.trim()) throw new Error("Ticker symbol is required");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Quantity must be a positive number");
  if (!Number.isFinite(input.pricePerShare) || input.pricePerShare < 0) throw new Error("Price per share must be a positive number");
  if (input.fee !== undefined && (!Number.isFinite(input.fee) || input.fee < 0)) throw new Error("Fee must be a non-negative number");
  const date = typeof input.date === "string" ? parseToStandardDate(input.date) : null;
  if (!date) throw new Error("Transaction date is required and must be valid");
  const ticker = input.tickerSymbol.trim();
  const gross = cents(input.quantity * input.pricePerShare), fee = cents(input.fee ?? 0);
  const consideration = kind === "buy" ? gross + fee : gross - fee;
  if (!Number.isSafeInteger(consideration)) throw new Error("Trade amount exceeds supported precision");

  return investmentTransaction(async (tx) => {
    const { security, cash } = await resolveInvestmentAccounts(tx, input, { createSecurity: kind === "buy", requireSecurity: true });
    if (!security) throw new Error("Security account not found");
    const history = await beginInvestmentActivity(tx, security.id, date);
    const props = security.investmentProperties!;
    if (!Number.isFinite(props.quantity) || props.quantity < 0) throw new Error("Invalid stored position quantity");
    if (!["FIFO", "AVERAGE_COST"].includes(props.costBasisMethod)) throw new Error("Invalid cost basis method");
    let lots = props.costBasisMethod === "FIFO" ? readLots(props.lots, props.quantity) : null;
    let basis = consideration;
    let newQuantity = props.quantity + input.quantity;
    if (!Number.isFinite(newQuantity)) throw new Error("Position quantity exceeds supported precision");
    if (kind === "buy") {
      lots?.push({ date, quantity: input.quantity, pricePerShare: input.pricePerShare, amount: consideration / 100 });
    } else {
      if (input.quantity > props.quantity) throw new Error(`Insufficient shares: trying to sell ${input.quantity} but only ${props.quantity} available`);
      newQuantity = props.quantity - input.quantity;
      if (lots) {
        let remaining = input.quantity;
        basis = 0;
        lots = lots.flatMap((lot) => {
          if (remaining <= 0) return [lot];
          const taken = Math.min(remaining, lot.quantity), oldCost = cents(lot.amount);
          const releasedCost = taken === lot.quantity ? oldCost : Math.round(oldCost * (taken / lot.quantity));
          basis += releasedCost;
          remaining -= taken;
          return taken === lot.quantity ? [] : [{ ...lot, quantity: lot.quantity - taken, amount: (oldCost - releasedCost) / 100 }];
        });
      } else {
        const balance = await tx.journalLine.aggregate({ where: { accountId: security.id }, _sum: { amount: true } });
        const oldCost = cents(balance._sum.amount ?? 0);
        if (oldCost < 0) throw new Error("Account has negative cost basis");
        basis = input.quantity === props.quantity ? oldCost : Math.round(oldCost * (input.quantity / props.quantity));
      }
    }
    if (!Number.isSafeInteger(basis)) throw new Error("Cost basis exceeds supported precision");
    const description = input.description || `${kind === "buy" ? "Buy" : "Sell"} ${input.quantity} shares of ${ticker} @ ${input.pricePerShare}`;
    const line = (accountId: string, amount: number) => ({ accountId, amount: amount / 100, currency: cash.currency, description });
    const lines = [line(security.id, kind === "buy" ? consideration : -basis), line(cash.id, kind === "buy" ? -consideration : consideration)];
    if (kind === "sell" && consideration !== basis) {
      const gain = await tx.account.findFirst({ where: { name: "Realized Gains/Losses", type: AccountType.Category, isArchived: false } });
      if (!gain) throw new Error("Realized Gains/Losses category account not found");
      lines.push({ ...line(gain.id, basis - consideration), description: `${consideration >= basis ? "Gain" : "Loss"} on ${description}` });
    }
    const entry = await tx.journalEntry.create({ data: {
      date, description, type: kind === "buy" ? "investment_buy" : "investment_sell", displayOrder: Date.now(), lines: { create: lines },
    }, include: { lines: true } });
    await tx.investmentProperties.update({ where: { id: props.id }, data: { quantity: newQuantity, lots: lots ? JSON.stringify(lots) : null } });
    await finishInvestmentActivity(tx, history, { kind, units: input.quantity, price: input.pricePerShare, fee: fee / 100, cashAmount: (kind === "buy" ? -consideration : consideration) / 100 }, [entry.id]);
    return entry;
  }, transaction);
}
