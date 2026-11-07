import type { Prisma } from "@prisma/client";
import { databaseService } from "./database";
import { cents, readLots } from "./investmentPosting";
import { isValidStandardDate, parseToStandardDate } from "../shared/dateUtils";
import { securityQuoteCurrency } from "./securityQuoteCurrency";

type Kind = "buy" | "sell" | "split" | "dividend" | "return_of_capital" | "income_reinvestment" | "capital_reinvestment";
type Details = { kind: Kind; units?: number; price?: number; fee?: number; splitRatio?: number; cashAmount: number };
type Activity = Prisma.InvestmentActivityGetPayload<{ include: { journalLinks: { include: { entry: { include: { lines: true } } } } } }>;
export type InvestmentSnapshot = { status: "available"; quantity: number; costBasis: number; lots: string | null } |
  { status: "unavailable"; reason: "legacy_history" | "inconsistent_history" };
const close = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));

function validActivity(row: Activity): boolean {
  if (!isValidStandardDate(row.date) || !Number.isFinite(row.quantityBefore) || !Number.isFinite(row.quantityAfter) ||
    row.quantityBefore < 0 || row.quantityAfter < 0 || cents(row.basisBefore) < 0 || cents(row.basisAfter) < 0) return false;
  const units = row.units ?? NaN, ratio = row.splitRatio ?? NaN;
  const changed = row.quantityAfter - row.quantityBefore;
  switch (row.kind) {
    case "buy": case "income_reinvestment": case "capital_reinvestment": if (!(units > 0) || !close(changed, units)) return false; break;
    case "sell": if (!(units > 0) || !close(changed, -units)) return false; break;
    case "split": if (!(ratio > 0) || !close(row.quantityAfter, row.quantityBefore * ratio) || cents(row.basisAfter) !== cents(row.basisBefore)) return false; break;
    case "dividend": case "return_of_capital": if (!close(changed, 0)) return false; break;
    default: return false;
  }
  if (["dividend", "capital_reinvestment"].includes(row.kind) && cents(row.basisAfter) !== cents(row.basisBefore)) return false;
  if (row.costBasisMethod === "FIFO") {
    const lots = readLots(row.lotsAfter, row.quantityAfter);
    if (lots.reduce((sum, lot) => sum + cents(lot.amount), 0) !== cents(row.basisAfter)) return false;
  } else if (row.costBasisMethod !== "AVERAGE_COST" || row.lotsAfter !== null) return false;
  const expectedEntries = ["income_reinvestment", "capital_reinvestment"].includes(row.kind) ? 2 : 1;
  if (row.journalLinks.length !== expectedEntries) return false;
  let securityDelta = 0;
  for (const { entry } of row.journalLinks) {
    if (entry.date !== row.date || entry.lines.some((line) => line.currency !== row.currency)) return false;
    if (entry.lines.reduce((sum, line) => sum + cents(line.amount), 0) !== 0) return false;
    securityDelta += entry.lines.filter((line) => line.accountId === row.accountId).reduce((sum, line) => sum + cents(line.amount), 0);
  }
  return securityDelta === cents(row.basisAfter) - cents(row.basisBefore);
}

async function snapshot(tx: Prisma.TransactionClient, accountId: string, date: string): Promise<InvestmentSnapshot> {
  const account = await tx.account.findUnique({ where: { id: accountId }, include: { investmentProperties: true } });
  if (!account?.investmentProperties) throw new Error("Security account not found");
  const props = account.investmentProperties;
  if (!props.hasCompleteActivityHistory) return { status: "unavailable", reason: "legacy_history" };
  const unavailable = { status: "unavailable", reason: "inconsistent_history" } as const;
  try {
    const activities = await tx.investmentActivity.findMany({ where: { accountId }, orderBy: { sequence: "asc" },
      include: { journalLinks: { include: { entry: { include: { lines: true } } } } } });
    let quantity = 0, basis = 0, previousDate = "0000-00-00", lots: string | null = props.costBasisMethod === "FIFO" ? "[]" : null;
    let selected = { status: "available", quantity, costBasis: basis, lots } as InvestmentSnapshot;
    for (let index = 0; index < activities.length; index++) {
      const row = activities[index];
      if (row.sequence !== index + 1 || row.date < previousDate || row.ticker !== props.tickerSymbol || row.currency !== account.currency ||
        (row.market !== null && row.market !== props.market) ||
        row.costBasisMethod !== props.costBasisMethod || !close(row.quantityBefore, quantity) || cents(row.basisBefore) !== cents(basis) || !validActivity(row)) return unavailable;
      quantity = row.quantityAfter; basis = row.basisAfter; lots = row.lotsAfter; previousDate = row.date;
      if (row.date <= date) selected = { status: "available", quantity, costBasis: basis, lots };
    }
    const linkedIds = activities.flatMap((row) => row.journalLinks.map((link) => link.entryId));
    const untracked = await tx.journalLine.count({ where: { accountId, entryId: { notIn: linkedIds } } });
    const actualBasis = (await tx.journalLine.aggregate({ where: { accountId }, _sum: { amount: true } }))._sum.amount ?? 0;
    if (untracked || !close(props.quantity, quantity) || cents(actualBasis) !== cents(basis) || props.lots !== lots) return unavailable;
    return selected;
  } catch { return unavailable; }
}

/** Dated quantities/basis come exclusively from verified structured activity, never descriptions
 * or the remaining current lots. Legacy books explicitly report unavailable history.
 */
export async function getInvestmentSnapshot(accountId: string, asOfDate: string): Promise<InvestmentSnapshot> {
  const date = typeof asOfDate === "string" ? parseToStandardDate(asOfDate) : null;
  if (!date) throw new Error("Invalid investment history date");
  return databaseService.prismaClient.$transaction((tx) => snapshot(tx, accountId, date), { timeout: 30000 });
}

export async function beginInvestmentActivity(tx: Prisma.TransactionClient, accountId: string, date: string) {
  const account = await tx.account.findUniqueOrThrow({ where: { id: accountId }, include: { investmentProperties: true } });
  const props = account.investmentProperties!;
  if (props.market) {
    const unit = await securityQuoteCurrency(tx, props.tickerSymbol, props.market, account.currency);
    if (unit.quoteCurrencyIssue) throw new Error(unit.quoteCurrencyIssue);
  }
  const last = await tx.investmentActivity.findFirst({ where: { accountId }, orderBy: { sequence: "desc" } });
  if (last && date < last.date) throw new Error("Backdated investment posting requires dated replay of subsequent activity");
  const basis = (await tx.journalLine.aggregate({ where: { accountId }, _sum: { amount: true } }))._sum.amount ?? 0;
  if (props.hasCompleteActivityHistory) {
    const verified = await snapshot(tx, accountId, "9999-12-31");
    if (verified.status !== "available") throw new Error("Investment activity is inconsistent; review the position before posting");
  } else if (last && (!close(last.quantityAfter, props.quantity) || cents(last.basisAfter) !== cents(basis))) {
    throw new Error("Investment activity is inconsistent; review the position before posting");
  }
  return { account, props, date, basis, sequence: (last?.sequence ?? 0) + 1 };
}

export async function finishInvestmentActivity(tx: Prisma.TransactionClient, before: Awaited<ReturnType<typeof beginInvestmentActivity>>,
  details: Details, entryIds: string[]) {
  const props = await tx.investmentProperties.findUniqueOrThrow({ where: { accountId: before.account.id } });
  const basis = (await tx.journalLine.aggregate({ where: { accountId: before.account.id }, _sum: { amount: true } }))._sum.amount ?? 0;
  const activity = await tx.investmentActivity.create({ data: {
    accountId: before.account.id, sequence: before.sequence, date: before.date, ...details,
    ticker: before.props.tickerSymbol, market: before.props.market, currency: before.account.currency, costBasisMethod: before.props.costBasisMethod,
    quantityBefore: before.props.quantity, quantityAfter: props.quantity, basisBefore: cents(before.basis) / 100, basisAfter: cents(basis) / 100,
    lotsAfter: props.lots, journalLinks: { create: entryIds.map((entryId) => ({ entryId })) },
  } });
  if (props.hasCompleteActivityHistory && (await snapshot(tx, before.account.id, "9999-12-31")).status !== "available") {
    throw new Error("Investment activity failed consistency verification");
  }
  return activity;
}
