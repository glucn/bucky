export const deriveRequiredFxPairs = (input: {
  sourceCurrencies: string[];
  baseCurrency: string;
}): Array<{ sourceCurrency: string; targetCurrency: string }> => {
  const unique = new Set<string>(input.sourceCurrencies);
  const pairs: Array<{ sourceCurrency: string; targetCurrency: string }> = [];

  for (const sourceCurrency of unique) {
    if (!sourceCurrency || sourceCurrency === input.baseCurrency) {
      continue;
    }

    pairs.push({
      sourceCurrency,
      targetCurrency: input.baseCurrency,
    });
  }

  return pairs;
};

export const resolveFxRateForValuation = (input: {
  sourceCurrency: string;
  baseCurrency: string;
  rate: number | null;
}): number | null => {
  if (input.sourceCurrency === input.baseCurrency) {
    return 1;
  }

  return input.rate;
};
