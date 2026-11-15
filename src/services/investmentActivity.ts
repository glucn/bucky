import type { Prisma } from "@prisma/client";
import { databaseService } from "./database";
import { cents, investmentTransaction, readInvestmentBasisCents, readLots, type Lot } from "./investmentPosting";
import { journalAmountFromCents, sumJournalCents } from "./journalPrecision";
import { AccountSubtype, AccountType } from "../shared/accountTypes";
import { isValidStandardDate, localCalendarDate, parseToStandardDate } from "../shared/dateUtils";
import { securityQuoteCurrency } from "./securityQuoteCurrency";

type Kind = "buy" | "sell" | "split" | "dividend" | "return_of_capital" | "income_reinvestment" | "capital_reinvestment";
type Details = { kind: Kind; units?: number; price?: number; fee?: number; splitRatio?: number; cashAmount: number };
type Activity = Prisma.InvestmentActivityGetPayload<{ include: { journalLinks: { include: { entry: { include: { lines: true } } } } } }>;
export type InvestmentSnapshot = { status: "available"; quantity: number; costBasis: number; lots: string | null } |
  { status: "unavailable"; reason: "legacy_history" | "inconsistent_history" };
const close = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
const linkedJournals = { include: { entry: { include: { lines: true } } } } as const;
export class InvestmentReplayRequiredError extends Error {}

function validLots(method: string, quantity: number, basis: number, lots: string | null, cutoff?: string) {
  if (method === "AVERAGE_COST") return lots === null;
  if (method !== "FIFO" || lots === null) return false;
  const parsed = readLots(lots, quantity);
  return parsed.reduce((sum, lot) => sum + cents(lot.amount), 0) === cents(basis) && (!cutoff || parsed.every((lot, index) =>
    isValidStandardDate(lot.date) && lot.date <= cutoff && (!index || parsed[index - 1].date <= lot.date) &&
    Number.isFinite(lot.pricePerShare) && lot.pricePerShare >= 0));
}

function baselineBasis(activity: Activity, preceding: Activity[]) {
  const postings = [...preceding, activity].flatMap((row) => row.journalLinks.flatMap(({ entry }) => entry.lines));
  return sumJournalCents(postings.filter((line) => line.accountId === activity.accountId));
}

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
  let securityDelta = 0n;
  for (const { entry } of row.journalLinks) {
    if (entry.date !== row.date || entry.lines.some((line) => line.currency !== row.currency)) return false;
    if (sumJournalCents(entry.lines) !== 0n) return false;
    securityDelta += sumJournalCents(entry.lines.filter((line) => line.accountId === row.accountId));
  }
  return securityDelta === BigInt(cents(row.basisAfter)) - BigInt(cents(row.basisBefore));
}

export async function verifyInvestmentSnapshot(tx: Prisma.TransactionClient, accountId: string, date: string): Promise<InvestmentSnapshot> {
  const account = await tx.account.findUnique({ where: { id: accountId }, include: { investmentProperties: true } });
  if (!account?.investmentProperties) throw new Error("Security account not found");
  const props = account.investmentProperties;
  if (!props.hasCompleteActivityHistory) return { status: "unavailable", reason: "legacy_history" };
  const unavailable = { status: "unavailable", reason: "inconsistent_history" } as const;
  try {
    const activities = await tx.investmentActivity.findMany({ where: { accountId }, orderBy: { sequence: "asc" },
      include: { journalLinks: linkedJournals } });
    const baselineIndex = activities.findIndex((row) => row.kind === "baseline");
    let quantity = 0, basis = 0, previousDate = "0000-00-00", lots: string | null = props.costBasisMethod === "FIFO" ? "[]" : null;
    let selected = { status: "available", quantity, costBasis: basis, lots } as InvestmentSnapshot;
    if (baselineIndex >= 0) {
      selected = { status: "unavailable", reason: "legacy_history" };
      if (baselineIndex > 0) { quantity = activities[0].quantityBefore; basis = activities[0].basisBefore; }
    }
    for (let index = 0; index < activities.length; index++) {
      const row = activities[index];
      if (row.sequence !== index + 1 || row.date < previousDate || row.ticker !== props.tickerSymbol || row.currency !== account.currency ||
        (baselineIndex >= 0 && index > baselineIndex && row.date <= activities[baselineIndex].date) ||
        (row.market !== null && row.market !== props.market) ||
        row.costBasisMethod !== props.costBasisMethod) return unavailable;
      if (index === baselineIndex) {
        if (!isValidStandardDate(row.date) || !Number.isFinite(row.quantityAfter) || row.quantityAfter < 0 || cents(row.basisAfter) < 0 ||
          (row.quantityAfter === 0 && cents(row.basisAfter) !== 0) || row.cashAmount !== 0 ||
          !close(row.quantityBefore, row.quantityAfter) || cents(row.basisBefore) !== cents(row.basisAfter) ||
          (index > 0 && (!close(quantity, row.quantityAfter) || cents(basis) !== cents(row.basisAfter))) ||
          !validLots(row.costBasisMethod, row.quantityAfter, row.basisAfter, row.lotsAfter, row.date) ||
          row.journalLinks.some(({ entry }) => !isValidStandardDate(entry.date) || entry.date > row.date ||
            !entry.lines.some((line) => line.accountId === accountId) || entry.lines.some((line) => line.currency !== row.currency) ||
            sumJournalCents(entry.lines) !== 0n) ||
          baselineBasis(row, activities.slice(0, index)) !== BigInt(cents(row.basisAfter))) return unavailable;
      } else if (!close(row.quantityBefore, quantity) || cents(row.basisBefore) !== cents(basis) || !validActivity(row)) return unavailable;
      quantity = row.quantityAfter; basis = row.basisAfter; lots = row.lotsAfter; previousDate = row.date;
      if (index >= baselineIndex && row.date <= date) selected = { status: "available", quantity, costBasis: basis, lots };
    }
    const linkedIds = activities.flatMap((row) => row.journalLinks.map((link) => link.entryId));
    const untracked = await tx.journalLine.count({ where: { accountId, entryId: { notIn: linkedIds } } });
    const actualBasis = await readInvestmentBasisCents(tx, accountId);
    if (untracked || !close(props.quantity, quantity) || actualBasis !== BigInt(cents(basis)) || props.lots !== lots) return unavailable;
    return selected;
  } catch { return unavailable; }
}

export type InvestmentBaselineReview = { accountId: string; date: string; currency: string; quantity: number; costBasis: number; lots: Lot[] | null };

export async function getInvestmentBaselineReview(accountId: string) {
  return investmentTransaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { id: accountId }, include: { investmentProperties: true } });
    const props = account?.investmentProperties;
    if (!account || !props || props.hasCompleteActivityHistory || account.isArchived) throw new Error("This holding does not need a legacy baseline");
    const lines = await tx.journalLine.findMany({ where: { accountId }, select: { amount: true, amountCents: true, entry: { select: { date: true } } } });
    const recent = await tx.investmentActivity.findFirst({ where: { accountId }, orderBy: { date: "desc" }, select: { date: true } });
    const earliestDate = lines.reduce((max, { entry }) => entry.date > max ? entry.date : max, recent?.date ?? "");
    let lots: Lot[] | null = null;
    if (props.costBasisMethod === "FIFO") {
      try { lots = readLots(props.lots, props.quantity); } catch { /* Require review from statements if retained lots cannot be read. */ }
    }
    return { accountId, ticker: props.tickerSymbol, currency: account.currency, quantity: props.quantity,
      costBasis: journalAmountFromCents(sumJournalCents(lines)), earliestDate, method: props.costBasisMethod, lots };
  });
}

/** Confirm a reviewed cutover; this creates activity and journal links, never new money. */
export async function confirmInvestmentBaseline(input: InvestmentBaselineReview) {
  if (!input || typeof input.accountId !== "string" || !isValidStandardDate(input.date) || input.date > localCalendarDate()) throw new Error("Select a valid cutover date no later than today and an active holding");
  if (typeof input.quantity !== "number" || !Number.isFinite(input.quantity) || input.quantity < 0) throw new Error("Invalid reviewed quantity");
  if (typeof input.costBasis !== "number" || !Number.isFinite(input.costBasis) || input.costBasis < 0 ||
    (input.quantity === 0 && input.costBasis !== 0) || cents(input.costBasis) / 100 !== input.costBasis) throw new Error("Invalid reviewed cost basis");
  return investmentTransaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { id: input.accountId }, include: { investmentProperties: true } });
    const props = account?.investmentProperties;
    if (!account || !props || account.type !== AccountType.User || account.subtype !== AccountSubtype.Asset || account.isArchived) throw new Error("Select an active security holding");
    if (props.hasCompleteActivityHistory) throw new Error("This holding already has verified activity history");
    if (account.currency !== input.currency) throw new Error("Holding currency changed; review again");
    if (props.quantity !== input.quantity) throw new Error("Reviewed quantity differs from the retained position");
    const lines = await tx.journalLine.findMany({ where: { accountId: account.id }, include: { entry: true } });
    if (sumJournalCents(lines) !== BigInt(cents(input.costBasis))) throw new Error("Reviewed cost basis does not match the holding journal");
    if (lines.some((line) => line.currency !== account.currency || !isValidStandardDate(line.entry.date) || line.entry.date > input.date)) throw new Error("Cutover date or journal currency conflicts with retained postings");
    const last = await tx.investmentActivity.findFirst({ where: { accountId: account.id }, orderBy: { sequence: "desc" } });
    if (last && last.date > input.date) throw new Error("Cutover date precedes retained investment activity");
    const lots = Array.isArray(input.lots) ? JSON.stringify(input.lots.map(({ date, quantity, pricePerShare, amount }) => ({ date, quantity, pricePerShare, amount }))) : null;
    if (!validLots(props.costBasisMethod, input.quantity, input.costBasis, lots, input.date)) throw new Error("Reviewed lots must agree with quantity, basis and cutover date");
    const entryIds = [...new Set(lines.map((line) => line.entryId))];
    const linked = await tx.investmentActivityJournal.findMany({ where: { entryId: { in: entryIds } }, include: { activity: true } });
    if (linked.some(({ activity }) => activity.accountId !== account.id)) throw new Error("A retained journal belongs to another holding's activity");
    const linkedIds = new Set(linked.map(({ entryId }) => entryId));
    await tx.investmentActivity.create({ data: {
      accountId: account.id, kind: "baseline", date: input.date, sequence: (last?.sequence ?? 0) + 1,
      ticker: props.tickerSymbol, market: props.market, currency: account.currency, costBasisMethod: props.costBasisMethod,
      quantityBefore: input.quantity, quantityAfter: input.quantity, basisBefore: input.costBasis, basisAfter: input.costBasis, cashAmount: 0,
      lotsAfter: lots, journalLinks: { create: entryIds.filter((id) => !linkedIds.has(id)).map((entryId) => ({ entryId })) },
    } });
    await tx.investmentProperties.update({ where: { accountId: account.id }, data: { hasCompleteActivityHistory: true, lots } });
    const verified = await verifyInvestmentSnapshot(tx, account.id, input.date);
    if (verified.status !== "available") throw new Error("Retained investment history failed cutover verification");
    return verified;
  });
}

/** Dated quantities/basis come exclusively from verified structured activity, never descriptions
 * or the remaining current lots. Legacy books explicitly report unavailable history.
 */
export async function getInvestmentSnapshot(accountId: string, asOfDate: string): Promise<InvestmentSnapshot> {
  const date = typeof asOfDate === "string" ? parseToStandardDate(asOfDate) : null;
  if (!date) throw new Error("Invalid investment history date");
  return databaseService.prismaClient.$transaction((tx) => verifyInvestmentSnapshot(tx, accountId, date), { timeout: 30000 });
}

export async function beginInvestmentActivity(tx: Prisma.TransactionClient, accountId: string, date: string) {
  const account = await tx.account.findUniqueOrThrow({ where: { id: accountId }, include: { investmentProperties: true } });
  const props = account.investmentProperties!;
  if (props.market) {
    const unit = await securityQuoteCurrency(tx, props.tickerSymbol, props.market, account.currency);
    if (unit.quoteCurrencyIssue) throw new Error(unit.quoteCurrencyIssue);
  }
  const last = await tx.investmentActivity.findFirst({ where: { accountId }, orderBy: { sequence: "desc" } });
  if (last?.kind === "baseline" && date === last.date) throw new Error("Post new activity after the reviewed closing date; activity on the cutover date requires review");
  if (last && date < last.date) throw new InvestmentReplayRequiredError("Backdated investment posting requires dated replay of subsequent activity");
  const basisCents = await readInvestmentBasisCents(tx, accountId);
  if (props.hasCompleteActivityHistory) {
    const verified = await verifyInvestmentSnapshot(tx, accountId, "9999-12-31");
    if (verified.status !== "available") throw new Error("Investment activity is inconsistent; review the position before posting");
  } else if (last && (!close(last.quantityAfter, props.quantity) || BigInt(cents(last.basisAfter)) !== basisCents)) {
    throw new Error("Investment activity is inconsistent; review the position before posting");
  }
  return { account, props, date, basisCents, sequence: (last?.sequence ?? 0) + 1 };
}

export async function finishInvestmentActivity(tx: Prisma.TransactionClient, before: Awaited<ReturnType<typeof beginInvestmentActivity>>,
  details: Details, entryIds: string[]) {
  const props = await tx.investmentProperties.findUniqueOrThrow({ where: { accountId: before.account.id } });
  const basis = await readInvestmentBasisCents(tx, before.account.id);
  const activity = await tx.investmentActivity.create({ data: {
    accountId: before.account.id, sequence: before.sequence, date: before.date, ...details,
    ticker: before.props.tickerSymbol, market: before.props.market, currency: before.account.currency, costBasisMethod: before.props.costBasisMethod,
    quantityBefore: before.props.quantity, quantityAfter: props.quantity, basisBefore: journalAmountFromCents(before.basisCents), basisAfter: journalAmountFromCents(basis),
    lotsAfter: props.lots, journalLinks: { create: entryIds.map((entryId) => ({ entryId })) },
  } });
  if (props.hasCompleteActivityHistory && (await verifyInvestmentSnapshot(tx, before.account.id, "9999-12-31")).status !== "available") {
    throw new Error("Investment activity failed consistency verification");
  }
  return activity;
}
