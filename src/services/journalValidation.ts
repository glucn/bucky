import { decimalRatio, journalAmountFromCents, readPostingCents, roundDecimalRatio, toJournalCents } from "./journalPrecision";

export interface CurrencyTransferAmounts {
  amountFrom?: number;
  amountTo?: number;
  exchangeRate?: number;
}

type ExchangePosting = { amount: number; amountCents: string | null; currency: string; exchangeRate: number | null };

export function isCurrencyExchange(entry: { type: string | null; lines: ExchangePosting[] }): boolean {
  if (entry.type === "currency_transfer") return true;
  const isFunding = entry.type === "investment_cash_deposit" || entry.type === "investment_cash_withdrawal";
  return isFunding && (new Set(entry.lines.map(({ currency }) => currency)).size > 1 ||
    entry.lines.some(({ exchangeRate }) => exchangeRate !== null));
}

export function hasValidExchangePostings(lines: ExchangePosting[]): boolean {
  if (lines.length !== 2) return false;
  try {
    const from = lines.find((line) => readPostingCents(line) < 0n);
    const to = lines.find((line) => readPostingCents(line) > 0n);
    if (!from || !to || from.exchangeRate === null || to.exchangeRate !== from.exchangeRate) return false;
    resolveCurrencyTransferAmounts({
      amountFrom: journalAmountFromCents(-readPostingCents(from)),
      amountTo: journalAmountFromCents(readPostingCents(to)),
      exchangeRate: from.exchangeRate,
    });
    return true;
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
  if (values.some((value) => value !== undefined && (!Number.isFinite(value) || value <= 0))) {
    throw new Error("Currency-transfer amounts and exchange rate must be finite and positive");
  }
  let fromCents = input.amountFrom === undefined ? undefined : BigInt(toJournalCents(input.amountFrom));
  let toCents = input.amountTo === undefined ? undefined : BigInt(toJournalCents(input.amountTo));
  if (input.exchangeRate !== undefined) {
    const rate = decimalRatio(input.exchangeRate);
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
  const exchangeRate = input.exchangeRate ?? Number(toCents!) / Number(fromCents!);
  if (![amountFrom, amountTo, exchangeRate].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Currency-transfer amounts and exchange rate must be finite and positive");
  }
  return { amountFrom, amountTo, exchangeRate };
}
