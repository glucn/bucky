import { recordInvestmentCash } from "./investmentCash";
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { databaseService } from "./database";
import { AccountType, AccountSubtype } from "../shared/accountTypes";
import { investmentRowIdentity, parseInvestmentImport, type InvestmentImportMapping, type InvestmentImportOptions, type InvestmentImportRow } from "../shared/investmentImport";
import { cents, investmentTransaction } from "./investmentPosting";
import { recordInvestmentTrade } from "./investmentTrades";
import { recordCashDividend, recordReinvestment, recordSplit } from "./investmentDistributions";

type Match = { status: "new" | "matching" | "review" | "conflict"; reason?: string; count?: number };
function context(options: InvestmentImportOptions, rows: InvestmentImportRow[]) {
  if (!options || typeof options !== "object" || (options.sourceNamespace !== undefined && typeof options.sourceNamespace !== "string")) throw new Error("Invalid investment import options");
  const sourceNamespace = options.sourceNamespace?.trim() || "";
  if (sourceNamespace.length > 128 || /[\x00-\x1f]/.test(sourceNamespace)) throw new Error("Use a valid statement source name");
  if (!Array.isArray(options.additionalRows || []) || !Array.isArray(options.skipRows || [])) throw new Error("Invalid row review decisions");
  const additional = new Set(options.additionalRows || []), skip = new Set(options.skipRows || []), rowNumbers = new Set(rows.map((row) => row.row));
  if ([...additional, ...skip].some((row) => !Number.isInteger(row) || !rowNumbers.has(row)) || [...additional].some((row) => skip.has(row))) throw new Error("Review decisions must refer to records in this statement without conflicting choices");
  if (rows.some((row) => additional.has(row.row) && !row.sourceId) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.reviewId || "")) {
    throw new Error("Additional transactions require a stable review identifier");
  }
  return { sourceNamespace, additional, skip };
}
const fingerprint = (row: InvestmentImportRow, currency: string) => createHash("sha256").update(JSON.stringify([currency, investmentRowIdentity(row)])).digest("hex");
const key = (row: InvestmentImportRow, financialFingerprint: string) => row.sourceId ? `id:${row.sourceId}` : `row:${financialFingerprint}`;
async function importCurrency(tx: Prisma.TransactionClient, portfolioId: string, row: InvestmentImportRow, options: InvestmentImportOptions, originalCurrency?: string) {
  if (!options.tradeCashAccountId && originalCurrency) return originalCurrency;
  const accounts = await tx.account.findMany({ where: { groupId: portfolioId }, include: { investmentProperties: true } });
  const cash = accounts.filter((account) => !account.investmentProperties && account.type === AccountType.User && account.subtype === AccountSubtype.Asset && account.name.includes("Trade Cash"));
  const selected = options.tradeCashAccountId ? cash.find((account) => account.id === options.tradeCashAccountId) : undefined;
  if (options.tradeCashAccountId && !selected) throw new Error("Selected trade cash account not found in this portfolio");
  const holdings = row.type === "fee" || row.type === "interest" ? [] : accounts.filter((account) => account.investmentProperties?.tickerSymbol === row.ticker);
  if (holdings.length > 1) throw new Error(`Select one security account for ${row.ticker} before importing`);
  if (holdings.length === 1) {
    if (row.type !== "split" && selected && selected.currency !== holdings[0].currency) throw new Error("Selected cash account has a different currency from the holding");
    return holdings[0].currency;
  }
  if (selected) return selected.currency;
  if (cash.length !== 1) throw new Error("Select a trade cash account to establish this statement's currency");
  return cash[0].currency;
}
const kinds = { buy: "buy", sell: "sell", dividend: "dividend", dividend_reinvest: "income_reinvestment", split: "split" };
async function match(tx: Prisma.TransactionClient, portfolioId: string, sourceNamespace: string, row: InvestmentImportRow, options: InvestmentImportOptions, newOrigins: string[] = []) {
  const identified = row.sourceId ? await tx.investmentImportOrigin.findUnique({ where: { portfolioId_sourceNamespace_sourceKey: { portfolioId, sourceNamespace, sourceKey: `id:${row.sourceId}` } } }) : null;
  const currency = await importCurrency(tx, portfolioId, row, options, identified?.currency);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid statement currency context");
  const financialFingerprint = fingerprint(row, currency), sourceKey = key(row, financialFingerprint);
  const done = (result: Match) => ({ ...result, currency, fingerprint: financialFingerprint, sourceKey });
  const exact = identified || await tx.investmentImportOrigin.findUnique({ where: { portfolioId_sourceNamespace_sourceKey: { portfolioId, sourceNamespace, sourceKey } } });
  if (exact) return done(exact.fingerprint === financialFingerprint ? { status: "matching", count: 1, reason: exact.entryId ? undefined : "Previously removed from the book; its retained origin prevents automatic reimport" } : { status: "conflict", reason: "Existing broker identifier has different financial data or currency; review a correction instead of importing again" });
  const similar = await tx.investmentImportOrigin.findMany({ where: { portfolioId, sourceNamespace, fingerprint: financialFingerprint } });
  if (!row.sourceId && similar.length) return done({ status: "matching", count: similar.length });
  if (row.sourceId && similar.some((origin) => !origin.sourceId)) return done({ status: "review", reason: "A matching row was previously imported without this broker identifier" });
  if (!row.sourceId && await tx.investmentImportOrigin.findFirst({ where: { portfolioId, sourceNamespace, currency, date: row.date, type: row.type, ticker: row.ticker, id: { notIn: newOrigins } } })) {
    return done({ status: "review", reason: "Same-day activity was imported with different financial data; review whether this is a correction or an additional transaction" });
  }
  if (row.type in kinds) {
    const activities = await tx.investmentActivity.findMany({ where: { account: { groupId: portfolioId }, date: row.date, ticker: row.ticker, currency, kind: kinds[row.type as keyof typeof kinds] },
      include: { journalLinks: { include: { entry: { include: { investmentImportOrigin: true } } } } } });
    const possible = activities.filter((activity) => !activity.journalLinks.some((link) => link.entry.investmentImportOrigin) && (
      row.type === "buy" || row.type === "sell" ? activity.units === row.quantity && activity.price === row.price && cents(activity.fee || 0) === cents(row.fee)
        : row.type === "split" ? activity.splitRatio === row.amount
          : row.type === "dividend" ? cents(activity.cashAmount) === cents(row.amount)
            : activity.price === row.price && cents(activity.basisAfter - activity.basisBefore) === cents(row.amount)));
    if (possible.length) return done({ status: "review", count: possible.length, reason: "Matching investment activity exists without an import origin; review whether this is an additional transaction" });
    const legacy = await tx.investmentProperties.findFirst({ where: { account: { groupId: portfolioId, currency }, tickerSymbol: row.ticker, hasCompleteActivityHistory: false } });
    if (legacy) return done({ status: "review", reason: "This holding has unverified legacy history; review the existing records before adding this transaction" });
  } else {
    const entries = await tx.journalEntry.findMany({ where: { type: row.type === "fee" ? "investment_fee" : "interest_income", date: row.date, investmentImportOrigin: null,
      lines: { some: { account: { groupId: portfolioId } } } }, include: { lines: { include: { account: true } } } });
    if (entries.some((entry) => entry.lines.some((line) => line.account.groupId === portfolioId && line.currency === currency && cents(line.amount) === cents(row.type === "fee" ? -row.amount : row.amount)))) {
      return done({ status: "review", reason: "A matching cash transaction has no import origin; review before adding another" });
    }
  }
  return done({ status: "new" });
}

export async function previewInvestmentImport(portfolioId: string, csv: string, mapping: InvestmentImportMapping, options: InvestmentImportOptions = {}) {
  const parsed = parseInvestmentImport(csv, mapping, options), { sourceNamespace } = context(options, parsed.rows);
  if (!parsed.valid) return { valid: false, errors: parsed.errors, rowCount: parsed.rowCount, preview: [] };
  return investmentTransaction(async (tx) => {
    if (!await tx.accountGroup.findUnique({ where: { id: portfolioId } })) throw new Error("Portfolio not found");
    const seen = new Set<string>(), preview: Array<InvestmentImportRow & Match & { currency: string }> = [];
    for (const row of parsed.rows) {
      let result = await match(tx, portfolioId, sourceNamespace, row, options);
      if (seen.has(result.sourceKey) && result.status === "new") result = { ...result, status: "matching", reason: row.sourceId ? "Repeated broker identifier in this statement" : "Identical row in this statement; confirm if it is another transaction" };
      seen.add(result.sourceKey); preview.push({ ...row, status: result.status, reason: result.reason, count: result.count, currency: result.currency });
    }
    return { valid: true, errors: parsed.errors, rowCount: parsed.rowCount, preview };
  });
}

async function post(tx: Prisma.TransactionClient, portfolioId: string, row: InvestmentImportRow, options: InvestmentImportOptions, currency: string) {
  const common = { portfolioId, tickerSymbol: row.ticker, date: row.date, description: row.description, tradeCashAccountId: options.tradeCashAccountId };
  if (row.type === "buy" || row.type === "sell") return recordInvestmentTrade(row.type, { ...common, quantity: row.quantity!, pricePerShare: row.price!, fee: row.fee }, tx);
  if (row.type === "dividend") return recordCashDividend({ ...common, amount: row.amount }, tx);
  if (row.type === "dividend_reinvest") return recordReinvestment({ ...common, dividendAmount: row.amount, reinvestmentPrice: row.price!, recordAsIncome: true }, tx);
  if (row.type === "split") {
    const accounts = await tx.account.findMany({ where: { groupId: portfolioId, isArchived: false, investmentProperties: { tickerSymbol: row.ticker } } });
    if (accounts.length !== 1) throw new Error(`Select one security account for ${row.ticker} before importing its split`);
    return recordSplit(accounts[0].id, row.amount, row.date, row.description, tx);
  }
  const cashAccounts = (await tx.account.findMany({ where: { groupId: portfolioId, currency, isArchived: false, type: AccountType.User, subtype: AccountSubtype.Asset, investmentProperties: null,
    ...(options.tradeCashAccountId ? { id: options.tradeCashAccountId } : {}),
  } })).filter((account) => account.name.includes("Trade Cash"));
  if (cashAccounts.length !== 1) throw new Error("Select one active trade cash account for this statement");
  const cash = cashAccounts[0];
  return recordInvestmentCash({ portfolioId, kind: row.type, amount: row.amount, date: row.date,
    tradeCashAccountId: cash.id, description: row.description || `${row.type === "fee" ? "Investment fee" : "Interest income"} - ${row.ticker}` }, tx);
}

export async function importInvestments(portfolioId: string, csv: string, mapping: InvestmentImportMapping, options: InvestmentImportOptions = {}) {
  if (!await databaseService.prismaClient.accountGroup.findUnique({ where: { id: portfolioId } })) throw new Error("Portfolio not found");
  const parsed = parseInvestmentImport(csv, mapping, options), { sourceNamespace, additional, skip } = context(options, parsed.rows);
  if (!parsed.valid) return { imported: 0, skipped: parsed.rowCount, errors: parsed.errors.map(({ row, field, error }) => ({ row, error: `${field}: ${error}` })) };
  let imported = 0, skipped = 0;
  const errors: Array<{ row: number; error: string }> = [];
  const newOrigins: string[] = [];
  for (const row of [...parsed.rows].sort((a, b) => a.date.localeCompare(b.date))) {
    if (skip.has(row.row)) { skipped++; continue; }
    try {
      const status = await investmentTransaction(async (tx) => {
        const found = await match(tx, portfolioId, sourceNamespace, row, options, newOrigins);
        const sourceKey = additional.has(row.row) && !row.sourceId ? `additional:${options.reviewId}:${row.row}` : found.sourceKey;
        const reviewed = await tx.investmentImportOrigin.findUnique({ where: { portfolioId_sourceNamespace_sourceKey: { portfolioId, sourceNamespace, sourceKey } } });
        if (reviewed) {
          if (reviewed.fingerprint !== found.fingerprint) throw new Error("Existing import identifier has different financial data; review the conflict");
          return "skipped";
        }
        if (found.status === "conflict") throw new Error(found.reason);
        if (found.status === "matching" && !additional.has(row.row)) return "skipped";
        if (found.status === "review" && !additional.has(row.row)) throw new Error(found.reason);
        const entry = await post(tx, portfolioId, row, options, found.currency);
        const origin = await tx.investmentImportOrigin.create({ data: { portfolioId, sourceNamespace, sourceKey, sourceId: row.sourceId, fingerprint: found.fingerprint, currency: found.currency, date: row.date, type: row.type, ticker: row.ticker, payload: JSON.stringify(row), entryId: entry.id } });
        return origin.id;
      });
      if (status !== "skipped") { imported++; newOrigins.push(status); } else skipped++;
    } catch (error) { skipped++; errors.push({ row: row.row, error: error instanceof Error ? error.message : "Unable to import this record" }); }
  }
  return { imported, skipped, errors };
}
