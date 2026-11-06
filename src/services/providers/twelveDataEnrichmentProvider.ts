import type {
  EnrichmentProviderAdapter,
  FxDailyRatePoint,
  SecurityDailyPricePoint,
} from "../enrichmentProviderRegistry";
import { parseSecurityIdentity } from "../../shared/securityMarket";

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
      close: (() => {
        const text = typeof value?.close === "string" ? value.close.trim() : String(value?.close);
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) < 0) throw new Error("Invalid provider price number");
        return Number(text);
      })(),
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
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
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
      const key = parseSecurityIdentity({ ticker: symbol, market });
      const url =
        `https://api.twelvedata.com/profile?symbol=${encodeURIComponent(symbol)}` +
        `&exchange=${encodeURIComponent(key.market)}&apikey=${encodeURIComponent(apiKey)}`;
      const payload = await requestJson(url);

      if (!payload || payload?.code) {
        return null;
      }
      if (payload.symbol !== key.ticker || payload.exchange !== key.market) throw new Error("Provider metadata market identity did not match the request");

      return {
        symbol: key.ticker,
        market: key.market,
        displayName: payload?.name || null,
        assetType: payload?.type || null,
        quoteCurrency: payload?.currency || null,
      };
    },

    async fetchSecurityDailyPrices({ symbol, market, quoteCurrency, startDate, endDate }) {
      const key = parseSecurityIdentity({ ticker: symbol, market });
      const url =
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}` +
        `&exchange=${encodeURIComponent(key.market)}&interval=1day&start_date=${encodeURIComponent(startDate)}` +
        `&end_date=${encodeURIComponent(endDate)}&apikey=${encodeURIComponent(apiKey)}`;
      const payload = await requestJson(url);
      if (payload?.meta?.symbol !== key.ticker || payload.meta.exchange !== key.market || payload.meta.currency !== quoteCurrency ||
        !/^[A-Z]{3}$/.test(quoteCurrency) || payload.meta.interval !== "1day") throw new Error("Provider price market identity, currency or daily interval did not match the request");
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
