import type { Prisma } from "@prisma/client";
import { AccountType } from "../shared/accountTypes";
import type { BookFinding, BookVerificationReport, JournalVerificationCode } from "../shared/bookVerification";
import { appSettingsService } from "./appSettingsService";
import { databaseService } from "./database";
import { verifyInvestmentSnapshot } from "./investmentActivity";
import { hasValidExchangePostings, isCurrencyExchange } from "./journalValidation";
import { readLinkedCheckpointAdjustment } from "./checkpointAdjustment";
import { journalAmountFromCents, readCheckpointCents, readPostingCents, sumJournalCents } from "./journalPrecision";
import { securityMarketData } from "./securityMarketData";
import { securityQuoteCurrency } from "./securityQuoteCurrency";
import { createValuationConversionService, valuationFxSelect, type ConversionResult } from "./valuationConversionService";
import { resolveValuationDate } from "./valuationDate";

const journalSelect = {
  id: true,
  date: true,
  description: true,
  type: true,
  lines: {
    orderBy: { id: "asc" },
    select: { id: true, amount: true, amountCents: true, currency: true, exchangeRate: true, account: { select: { type: true, currency: true } } },
  },
} satisfies Prisma.JournalEntrySelect;

type Entry = Prisma.JournalEntryGetPayload<{ select: typeof journalSelect }>;

async function verifyCheckpoints(tx: Prisma.TransactionClient, findings: BookFinding[]) {
  const checkpoints = await tx.checkpoint.findMany({
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: { id: true, date: true, accountId: true, balance: true, balanceCents: true, journalEntryId: true,
      account: { select: { currency: true } } },
  });
  for (const checkpoint of checkpoints) {
    const { id, date, accountId, account } = checkpoint;
    if (checkpoint.balanceCents === null) findings.push({
      severity: "warning", code: "checkpoint-legacy-precision", checkpointId: id, accountId, date,
      message: "The original checkpoint balance needs review before it can be stored in exact cents",
    });
    const journalEntryId = checkpoint.journalEntryId;
    const adjustment = journalEntryId ? await readLinkedCheckpointAdjustment(tx, { journalEntryId, accountId, date }) : null;
    if (journalEntryId && (!adjustment || adjustment.currency !== account.currency)) findings.push({
      severity: "error", code: "checkpoint-adjustment-link", checkpointId: id, accountId, date, journalEntryId,
      message: "The linked adjustment does not match this checkpoint",
    });
    // Include the recorded adjustment and other postings through the end of the checkpoint date.
    // The projected account balance takes this checkpoint as an input, so it cannot verify it.
    const lines = await tx.journalLine.findMany({
      where: { accountId, currency: account.currency, entry: { date: { lte: date } } },
      select: { amount: true, amountCents: true },
    });
    try {
      const expected = readCheckpointCents(checkpoint);
      const actual = sumJournalCents(lines);
      if (adjustment?.currency === account.currency && journalEntryId) {
        const difference = readPostingCents(adjustment);
        if (difference !== 0n) findings.push({
          severity: "warning", code: "checkpoint-adjustment", checkpointId: id, accountId, date, journalEntryId,
          currency: account.currency, amount: journalAmountFromCents(difference),
          unadjustedBalance: journalAmountFromCents(actual - difference),
          message: "An adjustment was posted to match the checkpoint balance",
        });
      }
      if (actual !== expected) findings.push({
        severity: "error", code: "checkpoint-balance", checkpointId: id, accountId, date,
        expected: journalAmountFromCents(expected), actual: journalAmountFromCents(actual), currency: account.currency,
        message: "The journal balance through the checkpoint date differs from the recorded balance",
      });
    } catch {
      findings.push({ severity: "error", code: "checkpoint-precision", checkpointId: id, accountId, date,
        message: "The checkpoint assertion or its journal balance falls outside the supported cent range" });
    }
  }
}

function verifyJournal(entry: Entry, findings: BookFinding[]) {
  const report = (code: JournalVerificationCode, message: string, lineId?: string) =>
    findings.push({ severity: "error", code, entryId: entry.id, date: entry.date,
      description: entry.description, message, ...(lineId ? { lineId } : {}) });

  if (entry.type === "stock_split" && entry.lines.length === 0) return;
  if (entry.lines.length < 2) report("journal-postings", "Expected at least two postings in this monetary entry");

  const totals = new Map<string, bigint>();
  let invalidAmount = false;
  for (const line of entry.lines) {
    if (line.amountCents === null) findings.push({
      severity: "warning", code: "journal-legacy-precision", entryId: entry.id, lineId: line.id,
      date: entry.date, description: entry.description,
      message: "The original posting amount needs review before it can be stored in exact cents",
    });
    // Categories and system accounts can carry postings in multiple currencies.
    if (line.account.type === AccountType.User && line.currency !== line.account.currency) {
      report("journal-account-currency", "Posting currency differs from the account currency", line.id);
    }
    try {
      const cents = readPostingCents(line);
      totals.set(line.currency, (totals.get(line.currency) ?? 0n) + cents);
    } catch {
      report("journal-amount", "Posting amount exceeds the current supported cent range", line.id);
      invalidAmount = true;
    }
  }
  if (invalidAmount) return;

  const isExchange = isCurrencyExchange(entry);
  if (isExchange && !hasValidExchangePostings(entry.lines)) {
    report("journal-fx", "Exchange postings disagree with their recorded rate");
    return;
  }
  if (isExchange && totals.size > 1) return;
  if ([...totals.values()].some((total) => total !== 0n)) {
    report("journal-unbalanced", "Postings do not balance in each currency");
  }
}

async function verifyHoldings(tx: Prisma.TransactionClient, findings: BookFinding[], date: string) {
  const holdings = await tx.investmentProperties.findMany({
    select: { accountId: true, tickerSymbol: true, market: true, account: { select: { currency: true } } },
    orderBy: { accountId: "asc" },
  });
  const valued: Array<{ accountId: string; currency: string }> = [];
  for (const { accountId, tickerSymbol, market, account: { currency } } of holdings) {
    const snapshot = await verifyInvestmentSnapshot(tx, accountId, date);
    if (snapshot.status === "available") {
      if (snapshot.quantity === 0) continue;
      const { quoteCurrencyIssue } = await securityQuoteCurrency(tx, tickerSymbol, market, currency);
      const quote = market && !quoteCurrencyIssue ? await securityMarketData.latest({ ticker: tickerSymbol, market }, date, tx) : null;
      if (!quote) findings.push({
        severity: "warning", code: "valuation-price", accountId, date,
        message: `${tickerSymbol}${market ? ` (${market})` : ""} · ${quoteCurrencyIssue ?? "No completed raw price on or before the valuation date"}`,
      });
      else if (quote.price !== 0) valued.push({ accountId, currency });
      continue;
    }
    if (snapshot.reason === "legacy_history") findings.push({
      severity: "warning", code: "investment-legacy", accountId,
      message: "A reviewed investment baseline is needed to verify this holding's history",
    });
    else findings.push({
      severity: "error", code: "investment-inconsistent", accountId,
      message: "Investment activity, lots, position or linked journal postings disagree",
    });
  }
  return valued;
}

async function verifyValuationFx(tx: Prisma.TransactionClient, findings: BookFinding[], date: string,
  valued: Array<{ accountId: string; currency: string }>) {
  const base = await appSettingsService.getBaseCurrency(tx);
  if (!base) return;
  const accounts = await tx.account.findMany({
    where: { type: AccountType.User, currency: { not: base }, investmentProperties: null },
    select: { id: true, currency: true }, orderBy: { id: "asc" },
  });
  const balances = await tx.journalLine.groupBy({
    by: ["accountId"], _sum: { amount: true },
    where: { account: { type: AccountType.User, currency: { not: base }, investmentProperties: null }, entry: { date: { lte: date } } },
  });
  const nonzero = new Set(balances.filter(({ _sum }) => Math.round((_sum.amount ?? 0) * 100) !== 0).map(({ accountId }) => accountId));
  const exposures = [...valued, ...accounts.filter(({ id }) => nonzero.has(id)).map(({ id, currency }) => ({ accountId: id, currency }))];
  const rates = () => tx.fxDailyRate.findMany({ orderBy: { marketDate: "asc" },
    select: valuationFxSelect });
  let readRates: ReturnType<typeof rates> | undefined;
  const conversion = createValuationConversionService({ findFxRates: () => readRates ??= rates() });
  const checked = new Map<string, ConversionResult["source"]>();
  for (const { accountId, currency } of exposures) {
    if (currency === base) continue;
    let source = checked.get(currency);
    if (!source) {
      source = /^[A-Z]{3}$/.test(currency)
        ? (await conversion.convertAmount({ amount: 1, sourceCurrency: currency, targetCurrency: base, asOfDate: date })).source
        : "unavailable";
      checked.set(currency, source);
    }
    if (source !== "as_of") findings.push({
      severity: "warning", code: "valuation-fx", accountId, date,
      message: `${currency} → ${base} · ${source === "latest_fallback" ? "Only a later FX rate is available" : "No valuation FX rate is available"}`,
    });
  }
}

/** Verify persisted accounting records in a consistent read transaction using today's cent policy. */
export async function verifyBook(asOfDate?: string): Promise<BookVerificationReport> {
  const date = resolveValuationDate(asOfDate);
  return databaseService.prismaClient.$transaction(async (tx) => {
    const findings: BookFinding[] = [];
    const pageSize = 500;
    let after: string | undefined;
    while (true) {
      const entries: Entry[] = await tx.journalEntry.findMany({
        where: after === undefined ? undefined : { id: { gt: after } },
        orderBy: { id: "asc" },
        take: pageSize,
        select: journalSelect,
      });
      for (const entry of entries) verifyJournal(entry, findings);
      if (entries.length < pageSize) break;
      after = entries[entries.length - 1].id;
    }
    await verifyCheckpoints(tx, findings);
    const valued = await verifyHoldings(tx, findings, date);
    await verifyValuationFx(tx, findings, date, valued);
    return { findings };
  }, { timeout: 30000 });
}
