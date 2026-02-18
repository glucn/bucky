import type {
  EnrichmentProviderAdapter,
  FxDailyRatePoint,
  SecurityDailyPricePoint,
} from "../enrichmentProviderRegistry";

const toUserFriendlyProviderMessage = (value: unknown): string => {
  if (typeof value !== "string") {
    return "Unable to fetch data from provider";
  }

  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || "Unable to fetch data from provider";
};

const mapSeriesValues = (values: any[]): SecurityDailyPricePoint[] =>
  (values || [])
    .map((value) => ({
      marketDate: value?.datetime,
      close: Number.parseFloat(value?.close),
    }))
    .filter((value) => value.marketDate && Number.isFinite(value.close))
    .sort((left, right) => left.marketDate.localeCompare(right.marketDate));

export const createTwelveDataEnrichmentProvider = (
  apiKey: string
): EnrichmentProviderAdapter => {
  if (!apiKey) {
    throw new Error("Unable to fetch data from provider");
  }

  const requestJson = async (url: string): Promise<any> => {
    const response = await fetch(url);
    const payload = await response.json().catch(async () => ({ raw: await response.text() }));

    if (!response.ok || payload?.status === "error") {
      throw new Error(
        toUserFriendlyProviderMessage(payload?.message || payload?.raw)
      );
    }

    return payload;
  };

  return {
    id: "twelvedata",
    capabilities: {
      supportsSecurityMetadata: true,
      supportsSecurityDailyPrices: true,
      supportsFxDailyRates: true,
      supportsBatchRequests: false,
    },

    async searchSecuritiesByTicker(ticker) {
      const url =
        `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(ticker)}` +
        `&apikey=${encodeURIComponent(apiKey)}`;
      const payload = await requestJson(url);

      return (payload?.data || []).map((item: any) => ({
        symbol: item?.symbol || "",
        market: item?.exchange || "UNKNOWN",
        displayName: item?.instrument_name || item?.symbol || null,
        quoteCurrency: item?.currency || null,
      }));
    },

    async fetchSecurityMetadata({ symbol, market }) {
      const url =
        `https://api.twelvedata.com/profile?symbol=${encodeURIComponent(symbol)}` +
        `&apikey=${encodeURIComponent(apiKey)}`;
      const payload = await requestJson(url);

      if (!payload || payload?.code) {
        return null;
      }

      return {
        symbol,
        market,
        displayName: payload?.name || null,
        assetType: payload?.type || null,
        quoteCurrency: payload?.currency || null,
      };
    },

    async fetchSecurityDailyPrices({ symbol, startDate, endDate }) {
      const url =
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
        `&interval=1day&start_date=${encodeURIComponent(startDate)}` +
        `&end_date=${encodeURIComponent(endDate)}&apikey=${encodeURIComponent(apiKey)}`;
      const payload = await requestJson(url);
      return mapSeriesValues(payload?.values || []);
    },

    async fetchFxDailyRates({ sourceCurrency, targetCurrency, startDate, endDate }) {
      const pair = `${sourceCurrency}/${targetCurrency}`;
      const url =
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(pair)}` +
        `&interval=1day&start_date=${encodeURIComponent(startDate)}` +
        `&end_date=${encodeURIComponent(endDate)}&apikey=${encodeURIComponent(apiKey)}`;
      const payload = await requestJson(url);
      const series = mapSeriesValues(payload?.values || []);

      return series.map(
        (point): FxDailyRatePoint => ({
          marketDate: point.marketDate,
          rate: point.close,
        })
      );
    },
  };
};
