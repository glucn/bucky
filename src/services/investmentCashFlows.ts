import { AccountType } from "../shared/accountTypes";
import type { InvestmentCashFlows } from "../shared/investmentReporting";
import { databaseService } from "./database";
import { investmentReportRange } from "./investmentIncomeReporting";
import { createValuationConversionService } from "./valuationConversionService";
import { cents } from "./investmentPosting";

/** External contributions cross portfolio ownership. Editable memos and transaction tags
 * cannot turn an internal transfer, income receipt or security purchase into funding. */
export async function investmentCashFlows(portfolioId: string, start: string, end: string, baseCurrency: string): Promise<InvestmentCashFlows> {
  const { startDate, endDate } = investmentReportRange(start, end);
  const { entries, rates } = await databaseService.prismaClient.$transaction(async (tx) => {
    const group = await tx.accountGroup.findUnique({ where: { id: portfolioId } });
    if (!group || group.accountType !== AccountType.User) throw new Error("Investment portfolio not found");
    const entries = await tx.journalEntry.findMany({ where: { date: { gte: startDate, lte: endDate }, lines: { some: { account: { groupId: portfolioId, type: AccountType.User } } } },
      include: { lines: { include: { account: { select: { name: true, type: true, groupId: true, currency: true, investmentProperties: { select: { id: true } } } } } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
    return { entries, rates: await tx.fxDailyRate.findMany() };
  }, { timeout: 30000 });
  const converter = createValuationConversionService({ findFxRates: async () => rates });
  const report: InvestmentCashFlows = { deposits: 0, withdrawals: 0, depositsByCurrency: {}, withdrawalsByCurrency: {}, rows: [] };
  const round = (amount: number) => cents(amount) / 100 || 0;
  for (const entry of entries) {
    if (entry.lines.every((line) => line.amount === 0)) continue;
    const owned = entry.lines.filter((line) => line.account.type === AccountType.User && line.account.groupId === portfolioId);
    const outside = entry.lines.filter((line) => !owned.includes(line));
    const externalUsers = outside.filter((line) => line.account.type === AccountType.User);
    const opening = entry.entryType === "opening-balance" && outside.length > 0 && outside.every((line) => line.account.type === AccountType.System);
    if (!externalUsers.length && !opening) {
      if (outside.some((line) => line.account.type === AccountType.System)) throw new Error("Portfolio system adjustment requires cash-flow classification review");
      continue;
    }
    if ((!opening && externalUsers.length !== outside.length) || owned.some((line) => line.account.investmentProperties) || externalUsers.some((line) => line.account.investmentProperties)) {
      throw new Error("Mixed or in-kind portfolio funding requires cash-flow review");
    }
    const signs = new Set(owned.filter((line) => line.amount !== 0).map((line) => Math.sign(line.amount)));
    if (signs.size !== 1 || outside.some((line) => line.amount !== 0 && signs.has(Math.sign(line.amount))) ||
      entry.lines.some((line) => !Number.isFinite(line.amount) || (line.account.type === AccountType.User && line.currency !== line.account.currency))) {
      throw new Error("Portfolio cash-flow amount or currency requires review");
    }
    if (new Set(entry.lines.map((line) => line.currency)).size === 1 && entry.lines.reduce((sum, line) => sum + cents(line.amount), 0) !== 0) {
      throw new Error("Unbalanced portfolio cash-flow journal requires review");
    }
    for (const line of owned) {
      if (line.amount === 0) continue;
      const result = await converter.convertAmount({ amount: line.amount, sourceCurrency: line.currency, targetCurrency: baseCurrency, asOfDate: entry.date });
      const available = result.source !== "unavailable" && result.source !== "latest_fallback";
      const amountBase = available ? result.convertedAmount! : null;
      report.rows.push({ entryId: entry.id, lineId: line.id, accountId: line.accountId, accountName: line.account.name, date: entry.date, currency: line.currency, amount: line.amount,
        amountBase, fxSource: available ? result.source as "same_currency" | "as_of" | "zero_amount" : "unavailable" });
      const key = line.amount > 0 ? "deposits" : "withdrawals", native = line.amount > 0 ? report.depositsByCurrency : report.withdrawalsByCurrency;
      native[line.currency] = round((native[line.currency] ?? 0) + Math.abs(line.amount));
      report[key] = report[key] === null || amountBase === null ? null : report[key]! + Math.abs(amountBase);
    }
  }
  return { ...report, deposits: report.deposits === null ? null : round(report.deposits), withdrawals: report.withdrawals === null ? null : round(report.withdrawals) };
}
