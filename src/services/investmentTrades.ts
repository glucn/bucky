import { databaseService } from "./database";
import { AccountSubtype, AccountType } from "../shared/accountTypes";
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
type Lot = { date: string; quantity: number; pricePerShare: number; amount: number };

// Existing ledger amounts use cents. Exact decimal storage/quantity arithmetic is BL-031.
function cents(value: number): number {
  const result = Math.round(value * 100);
  if (!Number.isFinite(value) || !Number.isSafeInteger(result)) throw new Error("Trade amount exceeds supported precision");
  return result;
}
function readLots(value: string | null, quantity: number): Lot[] {
  const lots: Lot[] = value ? JSON.parse(value) : [];
  if (!Array.isArray(lots) || lots.some((lot) => !lot || !Number.isFinite(lot.quantity) || lot.quantity <= 0 ||
    !Number.isFinite(lot.amount) || lot.amount < 0 || !parseToStandardDate(lot.date))) throw new Error("Invalid FIFO lot data");
  if (Math.abs(lots.reduce((sum, lot) => sum + lot.quantity, 0) - quantity) > 1e-8 * Math.max(1, quantity)) {
    throw new Error("FIFO lots do not match the position quantity");
  }
  return lots;
}

/** Journal, implicit account creation and position changes share one database transaction.
 * Acquisition fees are capitalized; disposal fees reduce proceeds and realized gains.
 * Neither is posted a second time as a separate expense.
 */
export async function recordInvestmentTrade(kind: "buy" | "sell", input: InvestmentTrade) {
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

  return databaseService.prismaClient.$transaction(async (tx) => {
    const portfolio = await tx.accountGroup.findUnique({ where: { id: input.portfolioId }, include: { accounts: { include: { investmentProperties: true } } } });
    if (!portfolio) throw new Error("Portfolio not found");
    if (portfolio.accountType !== AccountType.User) throw new Error("Investment portfolio must be a user account group");
    const matches = portfolio.accounts.filter((account) => account.investmentProperties?.tickerSymbol.trim() === ticker);
    let security = input.securityAccountId ? matches.find((account) => account.id === input.securityAccountId) : matches.length === 1 ? matches[0] : undefined;
    if (input.securityAccountId && !security) throw new Error("Selected security does not match this portfolio and ticker");
    if (!input.securityAccountId && matches.length > 1) throw new Error("Select an explicit security account for this ticker");
    if (security?.isArchived) throw new Error("Security account is archived");
    if (!security && kind === "sell") throw new Error(`Security account for ${ticker} not found in portfolio`);
    const cashAccounts = portfolio.accounts.filter((account) => !account.isArchived && !account.investmentProperties &&
      account.type === AccountType.User && account.subtype === AccountSubtype.Asset && account.name.includes("Trade Cash"));
    const eligibleCash = cashAccounts.filter((account) => !security || account.currency === security.currency);
    const cash = input.tradeCashAccountId ? eligibleCash.find((account) => account.id === input.tradeCashAccountId) : eligibleCash.length === 1 ? eligibleCash[0] : undefined;
    if (!cash) {
      if (eligibleCash.length > 1) throw new Error("Select an explicit trade cash account");
      throw new Error("Trade Cash account not found in portfolio for the security currency");
    }
    if (!security) {
      security = await tx.account.create({ data: {
        name: ticker, type: AccountType.User, subtype: AccountSubtype.Asset, currency: cash.currency, groupId: portfolio.id,
        investmentProperties: { create: { tickerSymbol: ticker, quantity: 0, costBasisMethod: "FIFO", lots: "[]" } },
      }, include: { investmentProperties: true } });
    }
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
    return entry;
  }, { timeout: 30000 });
}
