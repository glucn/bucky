import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { AccountType } from "../shared/accountTypes";
import { isValidStandardDate } from "../shared/dateUtils";
import { verifyInvestmentSnapshot } from "./investmentActivity";
import { recordCashDividend, recordReinvestment, recordSplit } from "./investmentDistributions";
import { readPostingAmount } from "./journalPrecision";
import { cents, investmentTransaction } from "./investmentPosting";
import { defaultTradeDescription, recordInvestmentTrade } from "./investmentTrades";
import type { TradeInsertion } from "../shared/investmentReplay";

export type TradeCorrection = TradeInsertion | ({ activityId: string } & (
  { operation?: "correct"; date: string; quantity: number; pricePerShare: number; fee?: number } |
  { operation: "void" }
));
const journals = { orderBy: { entryId: "asc" }, include: { entry: { include: { investmentImportOrigin: true,
  lines: { orderBy: { id: "asc" }, include: { account: true } } } } } } as const;
type Event = Prisma.InvestmentActivityGetPayload<{ include: { journalLinks: typeof journals } }>;

function summary(row: Pick<Event, "date" | "quantityAfter" | "basisAfter" | "cashAmount" | "kind" | "basisBefore">) {
  return { date: row.date, quantityAfter: row.quantityAfter, basisAfter: row.basisAfter, cashAmount: row.cashAmount,
    realizedGain: row.kind === "sell" ? (cents(row.cashAmount) + cents(row.basisAfter) - cents(row.basisBefore)) / 100 : null };
}

function readPosting(row: Event) {
  const entries = row.journalLinks.map(({ entry }) => entry);
  const cash = new Set(entries.flatMap(({ lines }) => lines.filter((line) =>
    line.accountId !== row.accountId && line.account.type === AccountType.User).map((line) => line.accountId)));
  if (row.kind !== "split" && cash.size !== 1) throw new Error("Cannot establish original settlement account for replay");
  const reinvested = row.kind === "income_reinvestment" || row.kind === "capital_reinvestment";
  const primary = reinvested ? entries.find(({ type }) => type === "dividend_reinvest") : entries[0];
  if (!primary) throw new Error("Cannot establish original journal for replay");
  const suffix = row.kind === "capital_reinvestment" ? " - Purchase (Cost Basis Reduction)" : " - Purchase";
  const description = primary.description ?? undefined;
  if (reinvested && !description?.endsWith(suffix)) throw new Error("Retained reinvestment journal needs review before replay");
  const receipt = reinvested ? entries.find(({ type }) => type === "dividend_cash") : null;
  const receiptLine = receipt?.lines.find((line) => line.accountId === [...cash][0]);
  const dividendAmount = receiptLine && readPostingAmount(receiptLine);
  if (reinvested && (!dividendAmount || dividendAmount <= 0)) throw new Error("Cannot establish original reinvestment amount");
  return { description: reinvested ? description!.slice(0, -suffix.length) : description, cashId: [...cash][0], dividendAmount };
}

async function replayTradeCorrection(tx: Prisma.TransactionClient, input: TradeCorrection) {
  const insertion = input.operation === "insert" ? input : null;
  const target = input.operation === "insert" ? null : await tx.investmentActivity.findUnique({ where: { id: input.activityId } });
  if (!insertion && (!target || (target.kind !== "buy" && target.kind !== "sell"))) throw new Error("Select an active holding's recorded buy or sell");
  const accountId = insertion?.accountId ?? target!.accountId;
  const account = await tx.account.findUnique({ where: { id: accountId }, include: { investmentProperties: true } });
  if (!account?.investmentProperties || !account.groupId || account.isArchived) throw new Error("Select an active investment holding");
  const before = await verifyInvestmentSnapshot(tx, accountId, "9999-12-31");
  if (before.status !== "available") throw new Error("Verify the holding history before replaying corrections");
  const correctedDate = input.operation === "void" ? target!.date : input.date;
  const earliest = target && target.date < correctedDate ? target.date : correctedDate;
  const rows = await tx.investmentActivity.findMany({ where: { accountId }, orderBy: { sequence: "asc" }, include: { journalLinks: journals } });
  const baseline = rows.find(({ kind }) => kind === "baseline");
  if (baseline && earliest <= baseline.date) throw new Error("Corrections must be after the reviewed closing baseline");
  const index = rows.findIndex((row) => row.date > earliest || (row.date === earliest && target !== null && (earliest !== target.date || row.sequence >= target.sequence)));
  if (index < 0) throw new Error("Use ordinary trade entry when there is no later activity to replay");
  const previous = rows[index - 1], suffix = rows.slice(index);
  const planned = suffix.map((row) => ({ row, date: row.id === target?.id ? correctedDate : row.date }));
  planned.sort((a, b) => a.date.localeCompare(b.date) || a.row.sequence - b.row.sequence);

  const entryIds = suffix.flatMap((row) => row.journalLinks.map(({ entryId }) => entryId));
  const accountIds = [...new Set(suffix.flatMap((row) => row.journalLinks.flatMap(({ entry }) => entry.lines.map(({ accountId }) => accountId))))];
  if (insertion) accountIds.push(accountId, insertion.tradeCashAccountId);
  const checkpoint = await tx.checkpoint.findFirst({ where: { accountId: { in: accountIds }, date: { gte: earliest } }, select: { id: true } });
  if (checkpoint) throw new Error("Correction crosses a retained checkpoint; reconcile affected account history before replay");
  await tx.investmentActivity.deleteMany({ where: { id: { in: suffix.map(({ id }) => id) } } });
  await tx.journalLine.deleteMany({ where: { entryId: { in: entryIds } } });
  await tx.journalEntry.deleteMany({ where: { id: { in: entryIds } } });
  await tx.investmentProperties.update({ where: { accountId }, data: {
    quantity: previous?.quantityAfter ?? 0,
    lots: previous ? previous.lotsAfter : account.investmentProperties.costBasisMethod === "FIFO" ? "[]" : null,
  } });

  const affected = [], replacement: Array<{ replaces: string | null; event: Event | null }> = [];
  let insertedId: string | null = null;
  if (insertion) {
    await recordInvestmentTrade(insertion.kind, {
      ...insertion, portfolioId: account.groupId, tickerSymbol: account.investmentProperties.tickerSymbol, securityAccountId: accountId,
    }, tx);
    const event = await tx.investmentActivity.findFirstOrThrow({ where: { accountId }, orderBy: { sequence: "desc" }, include: { journalLinks: journals } });
    insertedId = event.id;
    affected.push({ activityId: null, kind: event.kind, before: null, after: summary(event) });
    replacement.push({ replaces: null, event });
  }
  for (const { row, date } of planned) {
    if (row.id === target?.id && input.operation === "void") {
      affected.push({ activityId: row.id, kind: row.kind, before: summary(row), after: null });
      replacement.push({ replaces: row.id, event: null });
      continue;
    }
    const posting = readPosting(row);
    const common = { portfolioId: account.groupId, tickerSymbol: row.ticker, securityAccountId: row.accountId,
      tradeCashAccountId: posting.cashId, description: posting.description, date };
    switch (row.kind) {
      case "buy": case "sell":
        await recordInvestmentTrade(row.kind, { ...common, ...(row.id === target?.id && input.operation !== "void" && input.operation !== "insert"
          ? { quantity: input.quantity, pricePerShare: input.pricePerShare, fee: input.fee ?? row.fee ?? 0,
            description: posting.description === defaultTradeDescription(row.kind, row.ticker, row.units!, row.price!) ? undefined : posting.description }
          : { quantity: row.units!, pricePerShare: row.price!, fee: row.fee ?? 0 }) }, tx);
        break;
      case "split": await recordSplit(row.accountId, row.splitRatio!, date, posting.description, tx); break;
      case "dividend": case "return_of_capital":
        await recordCashDividend({ ...common, amount: row.cashAmount, isReturnOfCapital: row.kind === "return_of_capital" }, tx);
        break;
      case "income_reinvestment": case "capital_reinvestment":
        await recordReinvestment({ ...common, dividendAmount: posting.dividendAmount!, reinvestmentPrice: row.price!, recordAsIncome: row.kind === "income_reinvestment" }, tx);
        break;
      default: throw new Error("Unsupported event in correction replay");
    }
    let next = await tx.investmentActivity.findFirstOrThrow({ where: { accountId: row.accountId }, orderBy: { sequence: "desc" }, include: { journalLinks: journals } });
    for (const { entry: original } of row.journalLinks) {
      const updated = next.journalLinks.find(({ entry }) => entry.type === original.type)?.entry;
      if (!updated) throw new Error("Could not preserve the original journal role during replay");
      if (original.postingDate && original.postingDate < date) throw new Error("Corrected date is after the retained posting date");
      const category = (entry: typeof original) => entry.lines.filter(({ account }) => account.type === AccountType.Category).map(({ accountId }) => accountId).sort();
      const oldCategory = category(original), newCategory = category(updated);
      if (oldCategory.length && newCategory.length && JSON.stringify(oldCategory) !== JSON.stringify(newCategory)) throw new Error("Original journal category changed; review before replay");
      await tx.journalEntry.update({ where: { id: updated.id }, data: {
        postingDate: original.postingDate, entryType: original.entryType, displayOrder: date === original.date ? original.displayOrder : null,
      } });
      if (original.investmentImportOrigin) await tx.investmentImportOrigin.update({
        where: { id: original.investmentImportOrigin.id }, data: { entryId: updated.id },
      });
    }
    next = await tx.investmentActivity.findUniqueOrThrow({ where: { id: next.id }, include: { journalLinks: journals } });
    affected.push({ activityId: row.id, kind: row.kind, before: summary(row), after: summary(next) });
    replacement.push({ replaces: row.id, event: next });
  }
  const after = await verifyInvestmentSnapshot(tx, accountId, "9999-12-31");
  if (after.status !== "available") throw new Error("Replayed history did not verify");
  const outputs = replacement.map(({ replaces, event }) => event === null ? { replaces, event } : ({
    replaces, lots: event.lotsAfter, units: event.units, price: event.price, fee: event.fee,
    journals: event.journalLinks.map(({ entry }) => ({
      type: entry.type, date: entry.date, postingDate: entry.postingDate, description: entry.description,
      lines: entry.lines.map(({ accountId, amount, currency }) => JSON.stringify([accountId, amount, currency])).sort(),
    })).sort((a, b) => String(a.type).localeCompare(String(b.type))),
  }));
  const reviewToken = createHash("sha256").update(JSON.stringify([rows, before, after, affected, outputs])).digest("hex");
  return { report: { before, after, affected, reviewToken }, accountId, revisionActivityId: insertedId ?? target!.id, suffix, replacement };
}

function validateCorrection(input: TradeCorrection) {
  if (input?.operation === "insert") {
    if (!["buy", "sell"].includes(input.kind) || typeof input.accountId !== "string" || !input.accountId ||
      typeof input.tradeCashAccountId !== "string" || !input.tradeCashAccountId || typeof input.date !== "string" || !isValidStandardDate(input.date) ||
      (input.description !== undefined && typeof input.description !== "string")) throw new Error("Select a holding, settlement account and valid trade date");
    return;
  }
  if (!input || typeof input.activityId !== "string" || !input.activityId) throw new Error("Select a recorded trade");
  if (input.operation === "void") return;
  if ((input.operation !== undefined && input.operation !== "correct") || typeof input.date !== "string" || !isValidStandardDate(input.date)) throw new Error("Select a trade and valid correction date");
}

export async function getInvestmentTradeCorrection(accountId: string, entryId: string) {
  if (typeof accountId !== "string" || typeof entryId !== "string") throw new Error("Select a recorded trade");
  return investmentTransaction(async (tx) => {
    const link = await tx.investmentActivityJournal.findUnique({ where: { entryId }, include: { activity: { include: { account: { include: { investmentProperties: true } } } } } });
    const row = link?.activity;
    if (!row || row.accountId !== accountId || (row.kind !== "buy" && row.kind !== "sell") || row.units === null || row.price === null || row.account.isArchived) {
      throw new Error("Only a tracked buy or sale on this active holding can be corrected");
    }
    const baseline = await tx.investmentActivity.findFirst({ where: { accountId, kind: "baseline" }, select: { date: true } });
    if (!row.account.investmentProperties?.hasCompleteActivityHistory || (baseline && row.date <= baseline.date)) throw new Error("This trade is outside the holding's verified history");
    return { activityId: row.id, kind: row.kind, ticker: row.ticker, currency: row.currency, date: row.date, quantity: row.units, pricePerShare: row.price, fee: row.fee ?? 0 };
  });
}

/** Preview uses the exact posting service, then forces rollback before returning output. */
export async function previewInvestmentTradeCorrection(input: TradeCorrection) {
  validateCorrection(input);
  const rollback = new Error("Rollback investment correction preview");
  let preview: Awaited<ReturnType<typeof replayTradeCorrection>> | undefined;
  try {
    await investmentTransaction(async (tx) => { preview = await replayTradeCorrection(tx, input); throw rollback; });
  } catch (error) {
    if (error === rollback && preview) return preview.report;
    throw error;
  }
  throw new Error("Correction preview did not roll back");
}

export async function saveInvestmentTradeCorrection(input: TradeCorrection, reviewToken: string, reason: string) {
  validateCorrection(input);
  if (typeof reason !== "string" || !reason.trim() || reason.length > 2000) throw new Error("Enter a correction reason (up to 2000 characters)");
  if (typeof reviewToken !== "string" || !/^[a-f0-9]{64}$/.test(reviewToken)) throw new Error("Review the correction preview before saving");
  return investmentTransaction(async (tx) => {
    const replay = await replayTradeCorrection(tx, input);
    if (reviewToken !== replay.report.reviewToken) throw new Error("The holding or correction changed; preview again before saving");
    const revision = await tx.investmentCorrection.create({ data: {
      accountId: replay.accountId, activityId: replay.revisionActivityId, reason: reason.trim(),
      beforeJson: JSON.stringify(replay.suffix), afterJson: JSON.stringify(replay.replacement),
    } });
    return { ...replay.report, revisionId: revision.id };
  });
}
