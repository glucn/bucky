import type { Prisma } from "@prisma/client";
import { AccountType, AccountSubtype } from "../shared/accountTypes";
import { parseToStandardDate } from "../shared/dateUtils";
import type { InvestmentIncomeReport, RealizedGainReportRow, ReportFxSource } from "../shared/investmentReporting";
import { appSettingsService } from "./appSettingsService";
import { databaseService } from "./database";
import { cents, readLots } from "./investmentPosting";
import { createValuationConversionService } from "./valuationConversionService";

export function investmentReportRange(start: string, end: string) {
  const startDate = typeof start === "string" ? parseToStandardDate(start) : null;
  const endDate = typeof end === "string" ? parseToStandardDate(end) : null;
  if (!startDate || !endDate || startDate > endDate) throw new Error("Invalid investment report date range");
  return { startDate, endDate };
}
const include = { lines: { include: { account: { include: { investmentProperties: true } } } }, investmentActivityLink: { include: { activity: true } } } as const;
type Entry = Prisma.JournalEntryGetPayload<{ include: typeof include }>;
const rounded = (value: number) => cents(value) / 100 || 0;
async function context(portfolioId: string | null, start: string, end: string, base?: string) {
  const { startDate, endDate } = investmentReportRange(start, end);
  const baseCurrency = base ?? (await appSettingsService.getBaseCurrency()) ?? "USD";
  if (!/^[A-Z]{3}$/.test(baseCurrency)) throw new Error("Invalid reporting currency");
  const data = await databaseService.prismaClient.$transaction(async (tx) => {
    if (portfolioId !== null) {
      const group = await tx.accountGroup.findUnique({ where: { id: portfolioId } });
      if (!group || group.accountType !== AccountType.User) throw new Error("Investment portfolio not found");
    }
    const entries = await tx.journalEntry.findMany({ where: { date: { gte: startDate, lte: endDate },
      ...(portfolioId === null ? {} : { lines: { some: { account: { groupId: portfolioId } } } }),
    }, include, orderBy: [{ date: "asc" }, { id: "asc" }] });
    const rates = await tx.fxDailyRate.findMany({ orderBy: { marketDate: "asc" } });
    const activityAccounts = [...new Set(entries.flatMap((entry) => entry.investmentActivityLink ? [entry.investmentActivityLink.activity.accountId] : []))];
    const history = await tx.investmentActivity.findMany({ where: { accountId: { in: activityAccounts } }, orderBy: { sequence: "asc" } });
    return { entries, rates, history };
  }, { timeout: 30000 });
  const converter = createValuationConversionService({ findFxRates: async () => data.rates });
  const conversions = new Map<string, Awaited<ReturnType<typeof converter.convertAmount>>>();
  async function convert(amount: number, currency: string, date: string) {
    if (!Number.isFinite(amount)) throw new Error("Invalid investment report amount");
    const key = `${currency}:${date}:${amount === 0 ? "zero" : "rate"}`;
    let result = conversions.get(key);
    if (!result) {
      result = await converter.convertAmount({ amount: amount === 0 ? 0 : 1, sourceCurrency: currency, targetCurrency: baseCurrency, asOfDate: date });
      conversions.set(key, result);
    }
    // A current fallback rate must not masquerade as a historical posting-date rate.
    const available = result.source !== "unavailable" && result.source !== "latest_fallback";
    return { amountBase: available ? rounded(amount === 0 ? 0 : amount * result.rate!) : null,
      fxSource: (available ? result.source : "unavailable") as ReportFxSource, fxRate: available ? result.rate : null };
  }
  return { ...data, baseCurrency, convert };
}

function scopes(entry: Entry, portfolioId: string | null) {
  if (portfolioId === null) return;
  const groups = new Set(entry.lines.filter((line) => line.account.type === AccountType.User && line.account.groupId).map((line) => line.account.groupId));
  if (groups.size > 1) throw new Error("Investment report attribution spans multiple groups; review this journal entry");
}
function structured(entry: Entry) {
  const activity = entry.investmentActivityLink?.activity;
  if (activity && (activity.date !== entry.date || entry.lines.some((line) => line.currency !== activity.currency) ||
    entry.lines.reduce((sum, line) => sum + cents(line.amount), 0) !== 0)) throw new Error("Investment report activity conflicts with its journal");
  return activity;
}

/** Category ledger lines are financial facts; immutable activity links supply holding identity.
 * Editable descriptions and current remaining lots are never report sources.
 */
async function incomeFromContext(ctx: Awaited<ReturnType<typeof context>>, kind: "dividend" | "interest" | "fee", portfolioId: string | null): Promise<InvestmentIncomeReport> {
  const report: InvestmentIncomeReport = { baseCurrency: ctx.baseCurrency, total: 0, byCurrency: {}, byTicker: {}, rows: [] };
  const categoryName = kind === "dividend" ? "Dividend Income" : kind === "interest" ? "Interest Income" : "Investment Expenses";
  const entryType = kind === "dividend" ? "dividend_cash" : kind === "interest" ? "interest_income" : "investment_fee";
  for (const entry of ctx.entries) {
    const typedReceipt = ["dividend_cash", "interest_income", "investment_fee"].includes(entry.type ?? "");
    if (typedReceipt && entry.type !== entryType) continue;
    const categories = entry.lines.filter((line) => line.account.type === AccountType.Category);
    let lines = categories.filter((line) => line.account.name === categoryName);
    // Single-category tagged receipts retain their role when renamed. Multi-category
    // legacy receipts need an explicit category, so withholding never silently nets income.
    if (typedReceipt && categories.length <= 1) lines = categories;
    else if (typedReceipt && !lines.length) throw new Error("Multi-category investment receipt requires classification review");
    if (!lines.length) continue;
    scopes(entry, portfolioId);
    const activity = structured(entry);
    for (const line of lines) {
      const amount = rounded(line.amount * (kind === "fee" ? 1 : -1));
      const converted = await ctx.convert(amount, line.currency, entry.date);
      const ticker = activity?.ticker ?? null;
      report.rows.push({ entryId: entry.id, lineId: line.id, date: entry.date, accountId: activity?.accountId ?? null,
        tickerSymbol: ticker, market: activity?.market ?? null, currency: line.currency, amount, ...converted });
      report.byCurrency[line.currency] = rounded((report.byCurrency[line.currency] ?? 0) + amount);
      report.total = report.total === null || converted.amountBase === null ? null : rounded(report.total + converted.amountBase);
      if (ticker) report.byTicker[ticker] = report.byTicker[ticker] === null || converted.amountBase === null ? null : rounded((report.byTicker[ticker] ?? 0) + converted.amountBase);
    }
  }
  return report;
}

function holdingAge(activity: NonNullable<Entry["investmentActivityLink"]>["activity"], history: Awaited<ReturnType<typeof context>>["history"]): RealizedGainReportRow["holdingPeriod"] {
  if (activity.costBasisMethod !== "FIFO" || !(activity.units! > 0)) return "unknown";
  const previous = history.find((row) => row.accountId === activity.accountId && row.sequence === activity.sequence - 1);
  if (!previous || previous.quantityAfter !== activity.quantityBefore || cents(previous.basisAfter) !== cents(activity.basisBefore)) return "unknown";
  try {
    const lots = readLots(previous.lotsAfter, activity.quantityBefore), ages = new Set<string>();
    if (lots.reduce((sum, lot) => sum + cents(lot.amount), 0) !== cents(activity.basisBefore)) return "unknown";
    let remaining = activity.units!;
    for (const lot of lots) {
      if (remaining <= 0) break;
      const date = parseToStandardDate(lot.date);
      if (!date || date > activity.date) return "unknown";
      const days = (Date.parse(`${activity.date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000;
      ages.add(days >= 365 ? "long" : "short"); remaining -= Math.min(remaining, lot.quantity);
    }
    return remaining > 1e-8 ? "unknown" : ages.size > 1 ? "mixed" : ages.has("long") ? "long" : "short";
  } catch { return "unknown"; }
}

async function gainsFromContext(ctx: Awaited<ReturnType<typeof context>>, portfolioId: string): Promise<RealizedGainReportRow[]> {
  const rows: RealizedGainReportRow[] = [];
  for (const entry of ctx.entries) {
    if (entry.type !== "investment_sell") continue;
    scopes(entry, portfolioId);
    const activity = structured(entry);
    const securities = entry.lines.filter((line) => line.account.investmentProperties && line.account.groupId === portfolioId);
    if (securities.length !== 1) throw new Error("Sale report requires one explicit security account");
    const security = securities[0], currency = security.currency;
    const cash = entry.lines.filter((line) => !line.account.investmentProperties && line.account.type === AccountType.User && line.account.subtype === AccountSubtype.Asset && line.account.groupId === portfolioId);
    const categories = entry.lines.filter((line) => line.account.type === AccountType.Category);
    if (!cash.length || entry.lines.some((line) => line.currency !== currency) || entry.lines.reduce((sum, line) => sum + cents(line.amount), 0) !== 0) throw new Error("Sale journal currency or balance requires review");
    const costBasis = rounded(-security.amount), saleProceeds = rounded(cash.reduce((sum, line) => sum + line.amount, 0));
    let gainCategories = categories.filter((line) => line.account.name === "Realized Gains/Losses");
    if (!gainCategories.length && activity && categories.length <= 1) gainCategories = categories;
    if (!gainCategories.length && categories.length) throw new Error("Legacy sale gain classification requires review");
    const gainLineIds = new Set(gainCategories.map((line) => line.id));
    const otherCategoryAmount = rounded(categories.filter((line) => !gainLineIds.has(line.id)).reduce((sum, line) => sum + line.amount, 0));
    const realizedGain = rounded(-gainCategories.reduce((sum, line) => sum + line.amount, 0));
    if (costBasis < 0 || rounded(saleProceeds - costBasis + otherCategoryAmount) !== realizedGain) throw new Error("Sale journal gain requires review");
    if (activity && (activity.kind !== "sell" || activity.accountId !== security.accountId || !(activity.units! > 0) ||
      !Number.isFinite(activity.units) || !Number.isFinite(activity.price) || activity.price! < 0 || !Number.isFinite(activity.fee ?? 0) || (activity.fee ?? 0) < 0 ||
      Math.abs(activity.quantityBefore - activity.quantityAfter - activity.units!) > 1e-8 * Math.max(1, activity.units!) ||
      activity.ticker !== security.account.investmentProperties!.tickerSymbol ||
      cents(activity.units! * activity.price!) - cents(activity.fee ?? 0) !== cents(saleProceeds) ||
      otherCategoryAmount !== 0 || cents(activity.basisBefore - activity.basisAfter) !== cents(costBasis) || cents(activity.cashAmount) !== cents(saleProceeds))) throw new Error("Sale activity conflicts with its journal");
    const conversion = await ctx.convert(realizedGain, currency, entry.date);
    rows.push({ entryId: entry.id, date: entry.date, accountId: security.accountId,
      tickerSymbol: activity?.ticker ?? security.account.investmentProperties!.tickerSymbol,
      market: activity ? activity.market : security.account.investmentProperties!.market,
      currency, baseCurrency: ctx.baseCurrency, quantity: activity?.units ?? null, costBasis, saleProceeds, otherCategoryAmount, realizedGain,
      realizedGainBase: conversion.amountBase, fxSource: conversion.fxSource, fxRate: conversion.fxRate,
      holdingPeriod: activity ? holdingAge(activity, ctx.history) : "unknown" });
  }
  return rows;
}

export async function investmentIncomeReport(kind: "dividend" | "interest" | "fee", portfolioId: string | null, start: string, end: string, base?: string) {
  return incomeFromContext(await context(portfolioId, start, end, base), kind, portfolioId);
}
export async function realizedGainReport(portfolioId: string, start: string, end: string, base?: string) {
  return gainsFromContext(await context(portfolioId, start, end, base), portfolioId);
}
/** Summary components share one journal/FX snapshot and reporting currency. */
export async function investmentReportingBundle(portfolioId: string, start: string, end: string, base?: string) {
  const ctx = await context(portfolioId, start, end, base);
  const [dividends, interest, fees, gains] = await Promise.all([
    incomeFromContext(ctx, "dividend", portfolioId), incomeFromContext(ctx, "interest", portfolioId),
    incomeFromContext(ctx, "fee", portfolioId), gainsFromContext(ctx, portfolioId),
  ]);
  return { baseCurrency: ctx.baseCurrency, dividends, interest, fees, gains };
}
