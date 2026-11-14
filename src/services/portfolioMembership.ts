import type { Prisma } from "@prisma/client";
import { hasPortfolioIdentity } from "../shared/investmentAccounts";
import { hasLotHistory } from "./investmentLotHistory";

export const membershipAccounts = { include: { investmentProperties: true } } as const;
type Member = Prisma.AccountGetPayload<typeof membershipAccounts>;
type Group = Prisma.AccountGroupGetPayload<{ include: { accounts: typeof membershipAccounts } }>;

async function assertUnused(tx: Prisma.TransactionClient, accounts: Member[]) {
  if (!accounts.length) return;
  const ids = accounts.map(({ id }) => id);
  const retained = accounts.some(({ investmentProperties: holding }) => holding && (holding.quantity !== 0 || hasLotHistory(holding.lots)));
  if (retained || await tx.journalLine.findFirst({ where: { accountId: { in: ids } }, select: { id: true } }) ||
    await tx.checkpoint.findFirst({ where: { accountId: { in: ids } }, select: { id: true } }) ||
    await tx.investmentActivity.findFirst({ where: { accountId: { in: ids } }, select: { id: true } })) {
    throw new Error("Cannot change portfolio membership after financial history exists. Keep the historical account and use a new account for future activity.");
  }
}

export async function guardPortfolioMembership(tx: Prisma.TransactionClient, account: Member, target: Group | null) {
  if (account.groupId === (target?.id ?? null)) return;
  const source = account.groupId ? await tx.accountGroup.findUnique({ where: { id: account.groupId }, include: { accounts: membershipAccounts } }) : null;
  const sourceIsPortfolio = !!source && hasPortfolioIdentity(source);
  const targetWasPortfolio = !!target && hasPortfolioIdentity(target);
  const targetIsPortfolio = !!target && hasPortfolioIdentity({ ...target, accounts: [...target.accounts, account] });
  if (sourceIsPortfolio || targetIsPortfolio || account.investmentProperties) await assertUnused(tx, [account]);
  if (sourceIsPortfolio && !hasPortfolioIdentity({ ...source, accounts: source.accounts.filter(({ id }) => id !== account.id) })) await assertUnused(tx, source.accounts);
  if (targetIsPortfolio && !targetWasPortfolio) await assertUnused(tx, target.accounts);
}

export async function guardPortfolioDeletion(tx: Prisma.TransactionClient, id: string) {
  const group = await tx.accountGroup.findUnique({ where: { id }, include: { accounts: membershipAccounts } });
  if (group && hasPortfolioIdentity(group)) await assertUnused(tx, group.accounts);
}
