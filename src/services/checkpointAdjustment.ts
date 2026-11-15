import type { Prisma } from "@prisma/client";
import { AccountType } from "../shared/accountTypes";

export async function readLinkedCheckpointAdjustment(tx: Prisma.TransactionClient,
  checkpoint: { journalEntryId: string; accountId: string; date: string }) {
  const entry = await tx.journalEntry.findUnique({
    where: { id: checkpoint.journalEntryId },
    select: {
      date: true, type: true, entryType: true,
      lines: { select: { amount: true, amountCents: true, currency: true, accountId: true,
        account: { select: { type: true } } } },
    },
  });
  if (!entry || entry.date !== checkpoint.date || entry.type !== null ||
    entry.entryType !== "checkpoint-adjustment" || entry.lines.length !== 2) return null;
  const posting = entry.lines.find((line) => line.accountId === checkpoint.accountId);
  const offset = entry.lines.find((line) => line.accountId !== checkpoint.accountId && line.account.type === AccountType.System);
  return posting && offset ? posting : null;
}
