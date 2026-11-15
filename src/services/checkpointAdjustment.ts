import type { Prisma } from "@prisma/client";
import { AccountType } from "../shared/accountTypes";

type CheckpointIdentity = { id: string; journalEntryId: string | null; accountId: string; date: string; description: string | null };
const postingSelect = {
  amount: true, amountCents: true, currency: true, accountId: true,
  account: { select: { type: true, name: true } },
} as const;
type Posting = Prisma.JournalLineGetPayload<{ select: typeof postingSelect }>;
type AdjustmentMatch = { status: "matched"; journalEntryId: string; posting: Posting } |
  { status: "invalid-link" | "ambiguous" | "missing" };

function findPosting(lines: Posting[], accountId: string, legacy: boolean): Posting | null {
  if (lines.length !== 2) return null;
  const posting = lines.find((line) => line.accountId === accountId);
  const offset = lines.find((line) => line.accountId !== accountId && line.account.type === AccountType.System &&
    (!legacy || line.account.name === "Checkpoint Adjustment"));
  return posting && offset ? posting : null;
}

async function readLinkedCheckpointAdjustment(tx: Prisma.TransactionClient,
  checkpoint: { journalEntryId: string; accountId: string; date: string }) {
  const entry = await tx.journalEntry.findUnique({
    where: { id: checkpoint.journalEntryId },
    select: {
      date: true, type: true, entryType: true,
      lines: { select: postingSelect },
    },
  });
  if (!entry || entry.date !== checkpoint.date || entry.type !== null ||
    entry.entryType !== "checkpoint-adjustment") return null;
  return findPosting(entry.lines, checkpoint.accountId, false);
}

export async function resolveCheckpointAdjustment(tx: Prisma.TransactionClient, checkpoint: CheckpointIdentity): Promise<AdjustmentMatch> {
  const { journalEntryId, accountId, date } = checkpoint;
  if (journalEntryId) {
    const posting = await readLinkedCheckpointAdjustment(tx, { journalEntryId, accountId, date });
    return posting ? { status: "matched", journalEntryId, posting } : { status: "invalid-link" };
  }
  const label = (record: { id: string; description: string | null }) => record.description || `Checkpoint for ${record.id}`;
  const description = label(checkpoint);
  const candidates = await tx.journalEntry.findMany({
    where: {
      date, description, checkpoint: null, type: null, entryType: null,
      lines: { some: { accountId } },
    },
    select: { id: true, lines: { select: postingSelect } },
  });
  const matches = candidates.flatMap((entry) => {
    const posting = findPosting(entry.lines, accountId, true);
    return posting ? [{ journalEntryId: entry.id, posting }] : [];
  });
  if (matches.length === 0) return { status: "missing" };
  if (matches.length > 1) return { status: "ambiguous" };
  const peers = await tx.checkpoint.findMany({
    where: { date, accountId, journalEntryId: null, id: { not: checkpoint.id } },
    select: { id: true, description: true },
  });
  if (peers.some((record) => label(record) === description)) return { status: "ambiguous" };
  return { status: "matched", ...matches[0] };
}
