import { databaseService } from "./database";
import { cents, readInvestmentQuantity } from "./investmentPosting";
import type { RevisionDetail, RevisionEvent, RevisionSummary } from "../shared/investmentRevision";

const pageSize = 20;
const invalid = () => new Error("The retained revision is inconsistent and cannot be displayed");
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
};
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw invalid();
  return value;
};
const string = (value: unknown) => { if (typeof value !== "string") throw invalid(); return value; };
const amount = (value: unknown) => { if (typeof value !== "number" || !Number.isFinite(value)) throw invalid(); return value; };

function event(raw: unknown, accountId: string): RevisionEvent {
  const row = record(raw);
  if (row.accountId !== accountId) throw invalid();
  const kind = string(row.kind), basisAfter = amount(row.basisAfter), cashAmount = amount(row.cashAmount);
  const quantity = readInvestmentQuantity(amount(row.quantityAfter), row.quantityAfterDecimal == null ? null : string(row.quantityAfterDecimal));
  return { id: string(row.id), date: string(row.date), kind, currency: string(row.currency), quantityAfter: quantity,
    basisAfter, cashAmount, realizedGain: kind === "sell" ? (cents(cashAmount) + cents(basisAfter) - cents(amount(row.basisBefore))) / 100 : null,
    journals: list(row.journalLinks).map((rawLink) => {
      const entry = record(record(rawLink).entry);
      return { id: string(entry.id), description: entry.description === null ? null : string(entry.description),
        lines: list(entry.lines).map((rawLine) => {
          const line = record(rawLine), account = record(line.account);
          return { id: string(line.id), account: string(account.name), amount: amount(line.amount), currency: string(line.currency) };
        }) };
    }) };
}

export async function listInvestmentRevisions(accountId: string, page = 0): Promise<{ revisions: RevisionSummary[]; hasMore: boolean }> {
  if (typeof accountId !== "string" || !accountId || !Number.isSafeInteger(page) || page < 0 || page > 1_000_000) throw new Error("Select a holding and valid history page");
  const rows = await databaseService.prismaClient.investmentCorrection.findMany({
    where: { accountId }, skip: page * pageSize, take: pageSize + 1,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true, reason: true },
  });
  return { revisions: rows.slice(0, pageSize).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), hasMore: rows.length > pageSize };
}

export async function readInvestmentRevision(accountId: string, revisionId: string): Promise<RevisionDetail> {
  if (typeof accountId !== "string" || typeof revisionId !== "string" || !accountId || !revisionId) throw new Error("Select a retained revision");
  const row = await databaseService.prismaClient.investmentCorrection.findFirst({ where: { accountId, id: revisionId } });
  if (!row) throw new Error("Revision not found on this holding");
  try {
    const originals = list(JSON.parse(row.beforeJson)).map((raw) => event(raw, accountId));
    const remaining = new Map(originals.map((original) => [original.id, original]));
    if (remaining.size !== originals.length) throw invalid();
    let action: RevisionDetail["action"] | undefined;
    const changes = list(JSON.parse(row.afterJson)).map((raw) => {
      const replacement = record(raw), replaces = replacement.replaces === null ? null : string(replacement.replaces);
      const before = replaces === null ? null : remaining.get(replaces);
      const after = replacement.event === null ? null : event(replacement.event, accountId);
      if (before === undefined || (!before && !after)) throw invalid();
      if (replaces !== null) remaining.delete(replaces);
      if (replaces === row.activityId || (!before && after?.id === row.activityId)) {
        if (action) throw invalid();
        action = !after ? "Void" : before ? "Correction" : "Insertion";
      } else if (!before || !after) throw invalid();
      return { before, after };
    });
    if (!action || remaining.size) throw invalid();
    return { id: row.id, reason: row.reason, createdAt: row.createdAt.toISOString(), action, changes };
  } catch { throw invalid(); }
}
