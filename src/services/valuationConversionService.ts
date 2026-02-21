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
      findFxRates: () => Promise<
        Array<{ sourceCurrency: string; targetCurrency: string; marketDate: string; rate: number }>
      >;
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

    const fxRates = await this.deps.findFxRates();

    const fxRatesAsOf: FxRateMap = new Map();
    const fxRatesLatest: FxRateMap = new Map();

    for (const entry of fxRates) {
      if (entry.rate <= 0) {
        continue;
      }

      const fromToRate = entry.rate;
      const toFromRate = 1 / entry.rate;

      const fromToPair = toPairKey(entry.sourceCurrency, entry.targetCurrency);
      const toFromPair = toPairKey(entry.targetCurrency, entry.sourceCurrency);

      setLatestRate(fxRatesLatest, fromToPair, entry.marketDate, fromToRate);
      setLatestRate(fxRatesLatest, toFromPair, entry.marketDate, toFromRate);

      if (entry.marketDate <= input.asOfDate) {
        setLatestRate(fxRatesAsOf, fromToPair, entry.marketDate, fromToRate);
        setLatestRate(fxRatesAsOf, toFromPair, entry.marketDate, toFromRate);
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
    findFxRates:
      deps.findFxRates ||
      (async () =>
        databaseService.prismaClient.fxDailyRate.findMany({
          orderBy: { marketDate: "asc" },
          select: {
            sourceCurrency: true,
            targetCurrency: true,
            marketDate: true,
            rate: true,
          },
        })),
  });

export const valuationConversionService = createValuationConversionService();
