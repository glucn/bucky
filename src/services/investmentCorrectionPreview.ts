import type { Prisma } from "@prisma/client";
import { AccountType } from "../shared/accountTypes";
import { isValidStandardDate } from "../shared/dateUtils";
import { verifyInvestmentSnapshot } from "./investmentActivity";
import { recordCashDividend, recordReinvestment, recordSplit } from "./investmentDistributions";
import { cents, investmentTransaction } from "./investmentPosting";
import { recordInvestmentTrade } from "./investmentTrades";

export type TradeCorrection = { activityId: string; date: string; quantity: number; pricePerShare: number; fee?: number };
const journals = { include: { entry: { include: { lines: { include: { account: true } } } } } } as const;
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
  const dividendAmount = receipt?.lines.find((line) => line.accountId === [...cash][0])?.amount;
  if (reinvested && (!dividendAmount || dividendAmount <= 0)) throw new Error("Cannot establish original reinvestment amount");
  return { description: reinvested ? description!.slice(0, -suffix.length) : description, cashId: [...cash][0], dividendAmount };
}

async function replayTradeCorrection(tx: Prisma.TransactionClient, input: TradeCorrection) {
  const target = await tx.investmentActivity.findUnique({ where: { id: input.activityId },
    include: { account: { include: { investmentProperties: true } } } });
  if (!target || (target.kind !== "buy" && target.kind !== "sell") || !target.account.groupId || target.account.isArchived) throw new Error("Select an active holding's recorded buy or sell");
  const before = await verifyInvestmentSnapshot(tx, target.accountId, "9999-12-31");
  if (before.status !== "available") throw new Error("Verify the holding history before replaying corrections");
  const earliest = input.date < target.date ? input.date : target.date;
  const rows = await tx.investmentActivity.findMany({ where: { accountId: target.accountId }, orderBy: { sequence: "asc" }, include: { journalLinks: journals } });
  const baseline = rows.find(({ kind }) => kind === "baseline");
  if (baseline && earliest <= baseline.date) throw new Error("Corrections must be after the reviewed closing baseline");
  const index = rows.findIndex((row) => row.date > earliest || (row.date === earliest && (earliest !== target.date || row.sequence >= target.sequence)));
  const previous = rows[index - 1], suffix = rows.slice(index);
  const planned = suffix.map((row) => ({ row, posting: readPosting(row), date: row.id === target.id ? input.date : row.date }));
  planned.sort((a, b) => a.date.localeCompare(b.date) || a.row.sequence - b.row.sequence);

  const entryIds = suffix.flatMap((row) => row.journalLinks.map(({ entryId }) => entryId));
  await tx.investmentActivity.deleteMany({ where: { id: { in: suffix.map(({ id }) => id) } } });
  await tx.journalLine.deleteMany({ where: { entryId: { in: entryIds } } });
  await tx.journalEntry.deleteMany({ where: { id: { in: entryIds } } });
  await tx.investmentProperties.update({ where: { accountId: target.accountId }, data: {
    quantity: previous?.quantityAfter ?? 0,
    lots: previous ? previous.lotsAfter : target.costBasisMethod === "FIFO" ? "[]" : null,
  } });

  const affected = [];
  for (const { row, posting, date } of planned) {
    const common = { portfolioId: target.account.groupId, tickerSymbol: row.ticker, securityAccountId: row.accountId,
      tradeCashAccountId: posting.cashId, description: posting.description, date };
    switch (row.kind) {
      case "buy": case "sell":
        await recordInvestmentTrade(row.kind, { ...common, ...(row.id === target.id
          ? { quantity: input.quantity, pricePerShare: input.pricePerShare, fee: input.fee ?? row.fee ?? 0 }
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
    const next = await tx.investmentActivity.findFirstOrThrow({ where: { accountId: row.accountId }, orderBy: { sequence: "desc" } });
    affected.push({ activityId: row.id, kind: row.kind, before: summary(row), after: summary(next) });
  }
  const after = await verifyInvestmentSnapshot(tx, target.accountId, "9999-12-31");
  if (after.status !== "available") throw new Error("Replayed history did not verify");
  return { before, after, affected };
}

/** Preview uses the exact posting service, then forces rollback before returning output. */
export async function previewInvestmentTradeCorrection(input: TradeCorrection) {
  if (!input || typeof input.activityId !== "string" || typeof input.date !== "string" || !isValidStandardDate(input.date)) throw new Error("Select a trade and valid correction date");
  const rollback = new Error("Rollback investment correction preview");
  let preview: Awaited<ReturnType<typeof replayTradeCorrection>> | undefined;
  try {
    await investmentTransaction(async (tx) => { preview = await replayTradeCorrection(tx, input); throw rollback; });
  } catch (error) {
    if (error === rollback && preview) return preview;
    throw error;
  }
  throw new Error("Correction preview did not roll back");
}
