import { beforeEach, expect, it } from "vitest";
import { databaseService } from "./database";
import { investmentService } from "./investmentService";
import { resetTestDatabase } from "./database.test.utils";
import { AccountType } from "../shared/accountTypes";

beforeEach(resetTestDatabase);
const newGroup = (name: string) => databaseService.createAccountGroup({ name, accountType: AccountType.User });
const newCash = (name: string) => databaseService.createAccount({ name, type: AccountType.User, currency: "CAD" });

it("preserves external funding when regrouping or deleting a portfolio with posted cash", async () => {
  const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Broker", "CAD");
  const bank = await newCash("Bank"), ordinary = await newGroup("Ordinary");
  await investmentService.depositCash(group.id, 100, bank.id, "2026-01-02");
  const report = () => investmentService.getPortfolioPerformance(group.id, "2026-01-01", "2026-01-03");
  expect((await report()).cashFlows.depositsByCurrency).toEqual({ CAD: 100 });
  for (const change of [
    () => databaseService.addAccountToGroup(bank.id, group.id),
    () => databaseService.addAccountToGroup(tradeCashAccount.id, ordinary.id),
    () => databaseService.removeAccountFromGroup(tradeCashAccount.id),
    () => databaseService.deleteAccountGroup(group.id),
  ]) await expect(change()).rejects.toThrow(/portfolio.*history/i);
  expect((await report()).cashFlows.depositsByCurrency).toEqual({ CAD: 100 });
  expect(await databaseService.getAccountBalance(tradeCashAccount.id)).toBe(100);
});

it("protects checkpoint-only cash and dividend-only holdings", async () => {
  const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Broker", "CAD");
  await databaseService.prismaClient.checkpoint.create({ data: { accountId: tradeCashAccount.id, date: "2026-01-01", balance: 0 } });
  const holding = await investmentService.createSecurityAccount(group.id, "ABC");
  await investmentService.recordDividend({ portfolioId: group.id, tickerSymbol: "ABC", amount: 10, date: "2026-01-02" });
  expect(await databaseService.prismaClient.journalLine.count({ where: { accountId: holding.id } })).toBe(0);
  await expect(databaseService.removeAccountFromGroup(holding.id)).rejects.toThrow(/portfolio.*history/i);
  await expect(databaseService.removeAccountFromGroup(tradeCashAccount.id)).rejects.toThrow(/portfolio.*history/i);
});

it("allows ordinary regrouping, empty settlement changes and idempotent assignment", async () => {
  const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Broker", "CAD");
  const bank = await newCash("Bank"), ordinary = await newGroup("Ordinary");
  await databaseService.setOpeningBalance({ accountId: bank.id, displayAmount: 20, asOfDate: "2026-01-01" });
  await databaseService.addAccountToGroup(bank.id, ordinary.id);
  await databaseService.removeAccountFromGroup(bank.id);
  await databaseService.removeAccountFromGroup(tradeCashAccount.id);
  await databaseService.addAccountToGroup(tradeCashAccount.id, group.id);
  await investmentService.depositCash(group.id, 10, bank.id, "2026-01-02");
  expect((await databaseService.addAccountToGroup(tradeCashAccount.id, group.id)).groupId).toBe(group.id);
});

it("does not let moving an unused holding silently change the scope of other accounts' history", async () => {
  const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Broker", "CAD");
  const holding = await investmentService.createSecurityAccount(group.id, "ABC");
  const ordinary = await newGroup("Ordinary"), bank = await newCash("Bank");
  await databaseService.addAccountToGroup(bank.id, ordinary.id);
  for (const accountId of [bank.id, tradeCashAccount.id]) await databaseService.setOpeningBalance({ accountId, displayAmount: 20, asOfDate: "2026-01-01" });
  await expect(databaseService.addAccountToGroup(holding.id, ordinary.id)).rejects.toThrow(/portfolio.*history/i);
  await databaseService.prismaClient.accountGroup.update({ where: { id: group.id }, data: { isInvestmentPortfolio: false } });
  await expect(databaseService.removeAccountFromGroup(holding.id)).rejects.toThrow(/portfolio.*history/i);
});
