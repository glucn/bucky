import { decimalRatio, journalAmountFromCents, readPostingCents, readUnsignedDecimal, roundDecimalRatio, toJournalCents } from "./journalPrecision";
import { AccountType } from "../shared/accountTypes";
import { normalizeUnsignedDecimal } from "../shared/decimalInput";

export function isOpeningBalanceEntry(entry: {
  entryType: string | null; description: string | null;
  lines: Array<{ account: { type: string; name: string } }>;
}): boolean {
  return entry.entryType === "opening-balance" ||
    (entry.entryType === null && entry.description === "Opening Balance" && entry.lines.some(({ account }) =>
      account.type === AccountType.System && (account.name === "Opening Balances" || account.name === "Opening Balance Equity")));
}

export interface CurrencyTransferAmounts {
  amountFrom?: number;
  amountTo?: number;
  exchangeRate?: number | string;
}

type StoredExchangeRate = { exchangeRate: number | null; exchangeRateDecimal: string | null };
type ExchangePosting = StoredExchangeRate & { amount: number; amountCents: string | null; currency: string };

export function exchangeRateFields(rate: number | string | null) {
  return { exchangeRate: rate === null ? null : Number(rate), exchangeRateDecimal: rate?.toString() ?? null };
}

export function readPostingExchangeRate(posting: StoredExchangeRate): number | null {
  const value = posting.exchangeRateDecimal ?? posting.exchangeRate;
  if (value === null) return null;
  const rate = readUnsignedDecimal(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function isCurrencyExchange(entry: { type: string | null; lines: ExchangePosting[] }): boolean {
  if (entry.type === "currency_transfer") return true;
  const isFunding = entry.type === "investment_cash_deposit" || entry.type === "investment_cash_withdrawal";
  return isFunding && (new Set(entry.lines.map(({ currency }) => currency)).size > 1 ||
    entry.lines.some(({ exchangeRate, exchangeRateDecimal }) => exchangeRate !== null || exchangeRateDecimal !== null));
}

export function hasValidExchangePostings(lines: ExchangePosting[]): boolean {
  if (lines.length !== 2) return false;
  try {
    const from = lines.find((line) => readPostingCents(line) < 0n);
    const to = lines.find((line) => readPostingCents(line) > 0n);
    if (!from || !to || readPostingExchangeRate(from) === null || readPostingExchangeRate(to) === null) return false;
    const rate = decimalRatio(from.exchangeRateDecimal ?? from.exchangeRate!);
    const other = decimalRatio(to.exchangeRateDecimal ?? to.exchangeRate!);
    if (rate.numerator * other.denominator !== other.numerator * rate.denominator) return false;
    const difference = readPostingCents(to) * rate.denominator + readPostingCents(from) * rate.numerator;
    return difference >= -rate.denominator && difference <= rate.denominator;
  } catch {
    return false;
  }
}

/** Rates are destination units per source unit. Rounding follows the current money policy. */
export function resolveCurrencyTransferAmounts(input: CurrencyTransferAmounts) {
  const values = [input.amountFrom, input.amountTo, input.exchangeRate];
  if (values.filter((value) => value !== undefined).length < 2) {
    throw new Error("At least two of amountFrom, amountTo, exchangeRate are required for currency-transfer");
  }
  const enteredRate = normalizeUnsignedDecimal(input.exchangeRate);
  if ([input.amountFrom, input.amountTo].some((value) => value !== undefined && (!Number.isFinite(value) || value <= 0)) ||
    (input.exchangeRate !== undefined && (enteredRate === null || enteredRate === "0"))) {
    throw new Error("Currency-transfer amounts and exchange rate must be finite and positive");
  }
  let fromCents = input.amountFrom === undefined ? undefined : BigInt(toJournalCents(input.amountFrom));
  let toCents = input.amountTo === undefined ? undefined : BigInt(toJournalCents(input.amountTo));
  if (enteredRate) {
    const rate = decimalRatio(enteredRate);
    if (fromCents === undefined) {
      const destination = decimalRatio(input.amountTo!);
      fromCents = roundDecimalRatio(destination.numerator * rate.denominator * 100n, destination.denominator * rate.numerator);
    }
    toCents ??= roundDecimalRatio(fromCents * rate.numerator, rate.denominator);
    const difference = toCents * rate.denominator - fromCents * rate.numerator;
    if (difference < -rate.denominator || difference > rate.denominator) {
      throw new Error("Amounts and exchange rate are inconsistent");
    }
  }
  const amountFrom = journalAmountFromCents(fromCents!);
  const amountTo = journalAmountFromCents(toCents!);
  const exchangeRate = typeof input.exchangeRate === "string" ? enteredRate! :
    input.exchangeRate ?? Number(toCents!) / Number(fromCents!);
  if (![amountFrom, amountTo, Number(exchangeRate)].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Currency-transfer amounts and exchange rate must be finite and positive");
  }
  return { amountFrom, amountTo, exchangeRate };
}
