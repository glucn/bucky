export interface CurrencyTransferAmounts {
  amountFrom?: number;
  amountTo?: number;
  exchangeRate?: number;
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
  const round = (value: number) => Math.round(value * 100) / 100;
  const amountFrom = round(input.amountFrom ?? input.amountTo! / input.exchangeRate!);
  const amountTo = round(input.amountTo ?? amountFrom * input.exchangeRate!);
  const exchangeRate = input.exchangeRate ?? amountTo / amountFrom;
  if (![amountFrom, amountTo, exchangeRate].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Currency-transfer amounts and exchange rate must be finite and positive");
  }
  if (Math.abs(amountTo - amountFrom * exchangeRate) > 0.01 + Number.EPSILON * amountTo) {
    throw new Error("Amounts and exchange rate are inconsistent");
  }
  return { amountFrom, amountTo, exchangeRate };
}
