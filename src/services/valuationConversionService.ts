import { databaseService } from "./database";

type FxRateMap = Map<string, { date: string; rate: number }>;

export type ConversionSource = "same_currency" | "as_of" | "latest_fallback" | "unavailable";

export type ConversionResult = {
  convertedAmount: number | null;
  rate: number | null;
  source: ConversionSource;
  pair: string | null;
};

const toPairKey = (sourceCurrency: string, targetCurrency: string) =>
  `${sourceCurrency}->${targetCurrency}`;

const setLatestRate = (map: FxRateMap, pair: string, date: string, rate: number): void => {
  const existing = map.get(pair);
  if (!existing || date > existing.date) {
    map.set(pair, { date, rate });
  }
};

class ValuationConversionService {
  constructor(
    private readonly deps: {
      findFxEntries: () => Promise<Array<{ date: string; lines: Array<{ currency: string; amount: number }> }>>;
    }
  ) {}

  async convertAmount(input: {
    amount: number;
    sourceCurrency: string;
    targetCurrency: string;
    asOfDate: string;
  }): Promise<ConversionResult> {
    if (input.sourceCurrency === input.targetCurrency) {
      return {
        convertedAmount: input.amount,
        rate: 1,
        source: "same_currency",
        pair: null,
      };
    }

    const fxEntries = await this.deps.findFxEntries();

    const fxRatesAsOf: FxRateMap = new Map();
    const fxRatesLatest: FxRateMap = new Map();

    for (const entry of fxEntries) {
      const linesByCurrency = new Map<string, { amount: number }>();
      for (const line of entry.lines) {
        if (!linesByCurrency.has(line.currency)) {
          linesByCurrency.set(line.currency, { amount: line.amount });
        }
      }

      const currencies = Array.from(linesByCurrency.keys());
      if (currencies.length < 2) {
        continue;
      }

      const fromCurrency = currencies[0];
      const toCurrency = currencies[1];
      const fromAmount = Math.abs(linesByCurrency.get(fromCurrency)!.amount);
      const toAmount = Math.abs(linesByCurrency.get(toCurrency)!.amount);

      if (fromAmount <= 0 || toAmount <= 0) {
        continue;
      }

      const fromToRate = toAmount / fromAmount;
      const toFromRate = fromAmount / toAmount;

      const fromToPair = toPairKey(fromCurrency, toCurrency);
      const toFromPair = toPairKey(toCurrency, fromCurrency);

      setLatestRate(fxRatesLatest, fromToPair, entry.date, fromToRate);
      setLatestRate(fxRatesLatest, toFromPair, entry.date, toFromRate);

      if (entry.date <= input.asOfDate) {
        setLatestRate(fxRatesAsOf, fromToPair, entry.date, fromToRate);
        setLatestRate(fxRatesAsOf, toFromPair, entry.date, toFromRate);
      }
    }

    const pair = toPairKey(input.sourceCurrency, input.targetCurrency);
    const asOfRate = fxRatesAsOf.get(pair);
    if (asOfRate) {
      return {
        convertedAmount: input.amount * asOfRate.rate,
        rate: asOfRate.rate,
        source: "as_of",
        pair,
      };
    }

    const latestRate = fxRatesLatest.get(pair);
    if (latestRate) {
      return {
        convertedAmount: input.amount * latestRate.rate,
        rate: latestRate.rate,
        source: "latest_fallback",
        pair,
      };
    }

    return {
      convertedAmount: null,
      rate: null,
      source: "unavailable",
      pair,
    };
  }
}

export const createValuationConversionService = (
  deps: Partial<ConstructorParameters<typeof ValuationConversionService>[0]> = {}
) =>
  new ValuationConversionService({
    findFxEntries:
      deps.findFxEntries ||
      (async () =>
        databaseService.prismaClient.journalEntry.findMany({
          where: { type: "currency_transfer" },
          include: { lines: true },
          orderBy: { date: "asc" },
        }) as any),
  });

export const valuationConversionService = createValuationConversionService();
