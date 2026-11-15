import { databaseService } from "./database";
import { resolveValuationDate } from "./valuationDate";
import { isValidStandardDate } from "../shared/dateUtils";
import { decimalRatio, journalAmountFromCents, roundDecimalRatio } from "./journalPrecision";

type Rate = { rate: number; ratio: ReturnType<typeof decimalRatio> };
type FxRateMap = Map<string, Rate & { date: string }>;
type FxRate = { sourceCurrency: string; targetCurrency: string; marketDate: string; rate: number; rateDecimal?: string | null };

export const valuationFxSelect = {
  sourceCurrency: true, targetCurrency: true, marketDate: true, rate: true, rateDecimal: true,
} as const;

function storedRate(entry: FxRate): Rate | null {
  const value = entry.rateDecimal ?? entry.rate;
  if (typeof value === "string" && (value.length > 64 || !/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value))) return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? { rate, ratio: decimalRatio(value) } : null;
}

export type ConversionSource = "same_currency" | "as_of" | "latest_fallback" | "unavailable" | "zero_amount";

export type ConversionResult = {
  convertedAmount: number | null;
  rate: number | null;
  source: ConversionSource;
  pair: string | null;
};

type QuoteRequest = { sourceCurrency: string; targetCurrency: string; asOfDate: string };
export type ValuationQuote = Omit<ConversionResult, "convertedAmount"> & {
  apply: (amount: number, roundToCents?: boolean) => number | null;
};

function quote(rate: Rate | null, source: ConversionSource, pair: string | null): ValuationQuote {
  return {
    rate: rate?.rate ?? null, source, pair,
    apply(amount, roundToCents = false) {
      if (amount === 0) return 0;
      if (!rate) return null;
      if (!roundToCents) return amount * rate.rate;
      const value = decimalRatio(amount);
      return journalAmountFromCents(roundDecimalRatio(
        value.numerator * rate.ratio.numerator * 100n, value.denominator * rate.ratio.denominator
      ));
    },
  };
}

const toPairKey = (sourceCurrency: string, targetCurrency: string) =>
  `${sourceCurrency}->${targetCurrency}`;

const setLatestRate = (map: FxRateMap, pair: string, date: string, rate: Rate): void => {
  const existing = map.get(pair);
  if (!existing || date > existing.date) {
    map.set(pair, { date, ...rate });
  }
};

class ValuationConversionService {
  constructor(
    private readonly deps: {
      findFxRates: () => Promise<FxRate[]>;
    }
  ) {}

  async convertAmount(input: QuoteRequest & { amount: number; roundToCents?: boolean }): Promise<ConversionResult> {
    if (typeof input.amount !== "number" || !Number.isFinite(input.amount)) throw new Error("Invalid valuation amount");
    const { apply, ...result } = await this.getQuote(input, input.amount === 0);
    return { ...result, convertedAmount: apply(input.amount, input.roundToCents) };
  }

  async getQuote(input: QuoteRequest, zeroAmount = false): Promise<ValuationQuote> {
    if (typeof input.sourceCurrency !== "string" || typeof input.targetCurrency !== "string" || !/^[A-Z]{3}$/.test(input.sourceCurrency) || !/^[A-Z]{3}$/.test(input.targetCurrency)) throw new Error("Invalid valuation currency");
    if (typeof input.asOfDate !== "string") throw new Error("Invalid valuation date");
    const asOfDate = resolveValuationDate(input.asOfDate);
    if (input.sourceCurrency === input.targetCurrency) {
      return quote({ rate: 1, ratio: { numerator: 1n, denominator: 1n } }, "same_currency", null);
    }

    if (zeroAmount) return quote(null, "zero_amount", null);

    const fxRates = await this.deps.findFxRates();

    const fxRatesAsOf: FxRateMap = new Map();
    const fxRatesLatest: FxRateMap = new Map();

    for (const entry of fxRates) {
      const fromToRate = storedRate(entry);
      if (!fromToRate || typeof entry.marketDate !== "string" || !isValidStandardDate(entry.marketDate)) {
        continue;
      }

      const toFromRate = { rate: 1 / fromToRate.rate,
        ratio: { numerator: fromToRate.ratio.denominator, denominator: fromToRate.ratio.numerator } };

      const fromToPair = toPairKey(entry.sourceCurrency, entry.targetCurrency);
      const toFromPair = toPairKey(entry.targetCurrency, entry.sourceCurrency);

      setLatestRate(fxRatesLatest, fromToPair, entry.marketDate, fromToRate);
      if (Number.isFinite(toFromRate.rate)) setLatestRate(fxRatesLatest, toFromPair, entry.marketDate, toFromRate);

      if (entry.marketDate <= asOfDate) {
        setLatestRate(fxRatesAsOf, fromToPair, entry.marketDate, fromToRate);
        if (Number.isFinite(toFromRate.rate)) setLatestRate(fxRatesAsOf, toFromPair, entry.marketDate, toFromRate);
      }
    }

    const pair = toPairKey(input.sourceCurrency, input.targetCurrency);
    const asOfRate = fxRatesAsOf.get(pair);
    if (asOfRate) return quote(asOfRate, "as_of", pair);

    const latestRate = fxRatesLatest.get(pair);
    return latestRate ? quote(latestRate, "latest_fallback", pair) : quote(null, "unavailable", pair);
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
          select: valuationFxSelect,
        })),
  });

export const valuationConversionService = createValuationConversionService();
