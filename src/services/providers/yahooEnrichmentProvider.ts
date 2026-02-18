import type {
  EnrichmentProviderAdapter,
  FxDailyRatePoint,
  SecurityDailyPricePoint,
} from "../enrichmentProviderRegistry";

const formatUnixDate = (timestamp: number): string =>
  new Date(timestamp * 1000).toISOString().slice(0, 10);

const parseDateToUnix = (date: string): string => {
  const unixSeconds = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
  return String(unixSeconds);
};

const toUserFriendlyProviderMessage = (value: unknown): string => {
  if (typeof value !== "string") {
    return "Unable to fetch data from provider";
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || "Unable to fetch data from provider";
};

const requestJson = async (url: string): Promise<any> => {
  const response = await fetch(url);
  const payload = await response.json().catch(async () => ({ raw: await response.text() }));

  if (!response.ok) {
    const providerMessage =
      payload?.message ||
      payload?.chart?.error?.description ||
      payload?.raw;
    throw new Error(toUserFriendlyProviderMessage(providerMessage));
  }

  return payload;
};

const mapChartSeries = (payload: any): SecurityDailyPricePoint[] => {
  const result = payload?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close || [];

  const points: SecurityDailyPricePoint[] = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const close = closes[index];
    if (typeof close !== "number") {
      continue;
    }

    points.push({
      marketDate: formatUnixDate(timestamps[index]),
      close,
    });
  }

  return points;
};

export const yahooEnrichmentProvider: EnrichmentProviderAdapter = {
  id: "yahoo",
  capabilities: {
    supportsSecurityMetadata: true,
    supportsSecurityDailyPrices: true,
    supportsFxDailyRates: true,
    supportsBatchRequests: false,
  },

  async searchSecuritiesByTicker(ticker) {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}`;
    const payload = await requestJson(url);

    return (payload?.quotes || []).map((quote: any) => ({
      symbol: quote?.symbol || "",
      market: quote?.exchDisp || quote?.exchange || "UNKNOWN",
      displayName: quote?.shortname || quote?.longname || null,
      quoteCurrency: quote?.currency || null,
    }));
  },

  async fetchSecurityMetadata({ symbol, market }) {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price`;
    const payload = await requestJson(url);
    const price = payload?.quoteSummary?.result?.[0]?.price;

    if (!price) {
      return null;
    }

    return {
      symbol,
      market,
      displayName: price?.shortName || price?.longName || null,
      assetType: price?.quoteType || null,
      quoteCurrency: price?.currency || null,
    };
  },

  async fetchSecurityDailyPrices({ symbol, startDate, endDate }) {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=1d&period1=${parseDateToUnix(startDate)}&period2=${parseDateToUnix(endDate)}`;
    const payload = await requestJson(url);
    return mapChartSeries(payload);
  },

  async fetchFxDailyRates({ sourceCurrency, targetCurrency, startDate, endDate }) {
    const fxSymbol = `${sourceCurrency}${targetCurrency}=X`;
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(fxSymbol)}` +
      `?interval=1d&period1=${parseDateToUnix(startDate)}&period2=${parseDateToUnix(endDate)}`;
    const payload = await requestJson(url);
    const points = mapChartSeries(payload);

    return points.map((point): FxDailyRatePoint => ({
      marketDate: point.marketDate,
      rate: point.close,
    }));
  },
};
