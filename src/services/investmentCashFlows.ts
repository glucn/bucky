import { AccountType } from "../shared/accountTypes";
import type { InvestmentCashFlows } from "../shared/investmentReporting";
import { databaseService } from "./database";
import { investmentReportRange } from "./investmentIncomeReporting";
import { createValuationConversionService, valuationFxSelect, type ValuationQuote } from "./valuationConversionService";
import { addDecimalRatios, journalAmountFromCents, readPostingAmount, roundRatioToJournalAmount,
  sumJournalCents, toJournalCents, zeroRatio, type DecimalRatio } from "./journalPrecision";

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
    return { entries, rates: await tx.fxDailyRate.findMany({ select: valuationFxSelect }) };
  }, { timeout: 30000 });
  const converter = createValuationConversionService({ findFxRates: async () => rates });
  const rows: InvestmentCashFlows["rows"] = [];
  const totals: Record<"deposits" | "withdrawals", DecimalRatio | null> = { deposits: zeroRatio, withdrawals: zeroRatio };
  const nativeTotals = { deposits: new Map<string, bigint>(), withdrawals: new Map<string, bigint>() };
  const quotes = new Map<string, ValuationQuote>();
  for (const entry of entries) {
    const postings = entry.lines.map((line) => ({ ...line, amount: readPostingAmount(line) }));
    if (postings.every((line) => line.amount === 0)) continue;
    const owned = postings.filter((line) => line.account.type === AccountType.User && line.account.groupId === portfolioId);
    const outside = postings.filter((line) => !owned.includes(line));
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
      postings.some((line) => line.account.type === AccountType.User && line.currency !== line.account.currency)) {
      throw new Error("Portfolio cash-flow amount or currency requires review");
    }
    if (new Set(postings.map((line) => line.currency)).size === 1 && sumJournalCents(postings) !== 0n) {
      throw new Error("Unbalanced portfolio cash-flow journal requires review");
    }
    for (const line of owned) {
      if (line.amount === 0) continue;
      const quoteKey = `${line.currency}:${entry.date}`;
      let result = quotes.get(quoteKey);
      if (!result) {
        result = await converter.getQuote({ sourceCurrency: line.currency, targetCurrency: baseCurrency, asOfDate: entry.date });
        quotes.set(quoteKey, result);
      }
      const available = result.source !== "unavailable" && result.source !== "latest_fallback";
      const amountBase = available ? result.apply(line.amount) : null;
      rows.push({ entryId: entry.id, lineId: line.id, accountId: line.accountId, accountName: line.account.name, date: entry.date, currency: line.currency, amount: line.amount,
        amountBase, fxSource: available ? result.source as "same_currency" | "as_of" | "zero_amount" : "unavailable" });
      const key = line.amount > 0 ? "deposits" : "withdrawals", native = nativeTotals[key];
      const magnitude = Math.abs(line.amount);
      native.set(line.currency, (native.get(line.currency) ?? 0n) + BigInt(toJournalCents(magnitude)));
      const converted = available ? result.applyExact(magnitude) : null;
      const total = totals[key];
      totals[key] = total && converted ? addDecimalRatios(total, converted) : null;
    }
  }
  const nativeAmounts = (native: Map<string, bigint>) =>
    Object.fromEntries(Array.from(native, ([currency, cents]) => [currency, journalAmountFromCents(cents)]));
  return {
    deposits: totals.deposits && roundRatioToJournalAmount(totals.deposits),
    withdrawals: totals.withdrawals && roundRatioToJournalAmount(totals.withdrawals),
    depositsByCurrency: nativeAmounts(nativeTotals.deposits), withdrawalsByCurrency: nativeAmounts(nativeTotals.withdrawals), rows,
  };
}
