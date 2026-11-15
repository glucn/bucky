import type { Prisma } from "@prisma/client";
import { AccountType } from "../shared/accountTypes";
import { databaseService } from "./database";
import { resolveCurrencyTransferAmounts } from "./journalValidation";

const journalSelect = {
  id: true,
  type: true,
  lines: {
    orderBy: { id: "asc" },
    select: { id: true, amount: true, currency: true, exchangeRate: true, account: { select: { type: true, currency: true } } },
  },
} satisfies Prisma.JournalEntrySelect;

type Entry = Prisma.JournalEntryGetPayload<{ select: typeof journalSelect }>;
type Code = "journal-unbalanced" | "journal-account-currency" | "journal-fx" | "journal-postings" | "journal-amount";
type Finding = { code: Code; entryId: string; message: string; lineId?: string } |
  { code: "checkpoint-balance"; checkpointId: string; accountId: string; date: string;
    expected: number; actual: number; currency: string; message: string };

function validExchange(entry: Entry): boolean {
  if (entry.lines.length !== 2) return false;
  const from = entry.lines.find((line) => line.amount < 0);
  const to = entry.lines.find((line) => line.amount > 0);
  if (!from || !to || from.exchangeRate === null || to.exchangeRate !== from.exchangeRate) return false;
  try {
    resolveCurrencyTransferAmounts({ amountFrom: -from.amount, amountTo: to.amount, exchangeRate: from.exchangeRate });
    return true;
  } catch {
    return false;
  }
}

async function verifyCheckpoints(tx: Prisma.TransactionClient, findings: Finding[]) {
  const checkpoints = await tx.checkpoint.findMany({
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: { id: true, date: true, accountId: true, balance: true, account: { select: { currency: true } } },
  });
  for (const { id, date, accountId, balance, account } of checkpoints) {
    // Include the recorded adjustment and other postings through the end of the checkpoint date.
    // The projected account balance takes this checkpoint as an input, so it cannot verify it.
    const { _sum } = await tx.journalLine.aggregate({
      where: { accountId, currency: account.currency, entry: { date: { lte: date } } },
      _sum: { amount: true },
    });
    const actual = Math.round((_sum.amount ?? 0) * 100) / 100;
    if (actual !== balance) findings.push({
      code: "checkpoint-balance", checkpointId: id, accountId, date,
      expected: balance, actual, currency: account.currency,
      message: "The journal balance through the checkpoint date differs from the recorded balance",
    });
  }
}

function verifyJournal(entry: Entry, findings: Finding[]) {
  const report = (code: Code, message: string, lineId?: string) =>
    findings.push({ code, entryId: entry.id, message, ...(lineId ? { lineId } : {}) });

  if (entry.type === "stock_split" && entry.lines.length === 0) return;
  if (entry.lines.length < 2) report("journal-postings", "Expected at least two postings in this monetary entry");

  const totals = new Map<string, bigint>();
  let invalidAmount = false;
  for (const line of entry.lines) {
    // Categories and system accounts can carry postings in multiple currencies.
    if (line.account.type === AccountType.User && line.currency !== line.account.currency) {
      report("journal-account-currency", "Posting currency differs from the account currency", line.id);
    }
    const cents = Math.round(line.amount * 100);
    if (!Number.isSafeInteger(cents)) {
      report("journal-amount", "Posting amount exceeds the current supported cent range", line.id);
      invalidAmount = true;
      continue;
    }
    totals.set(line.currency, (totals.get(line.currency) ?? 0n) + BigInt(cents));
  }
  if (invalidAmount) return;

  const isFunding = entry.type === "investment_cash_deposit" || entry.type === "investment_cash_withdrawal";
  const isExchange = entry.type === "currency_transfer" ||
    (isFunding && (totals.size > 1 || entry.lines.some((line) => line.exchangeRate !== null)));
  if (isExchange && !validExchange(entry)) {
    report("journal-fx", "Exchange postings disagree with their recorded rate");
    return;
  }
  if (isExchange && totals.size > 1) return;
  if ([...totals.values()].some((total) => total !== 0n)) {
    report("journal-unbalanced", "Postings do not balance in each currency");
  }
}

/** Verify the persisted journal in a consistent read transaction using today's cent policy. */
export async function verifyBook(): Promise<{ findings: Finding[] }> {
  return databaseService.prismaClient.$transaction(async (tx) => {
    const findings: Finding[] = [];
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
    return { findings };
  }, { timeout: 30000 });
}
