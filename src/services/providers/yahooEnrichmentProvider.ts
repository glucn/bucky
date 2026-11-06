import type {
  EnrichmentProviderAdapter,
  FxDailyRatePoint,
  SecurityDailyPricePoint,
} from "../enrichmentProviderRegistry";
import { parseSecurityIdentity } from "../../shared/securityMarket";

const formatUnixDate = (timestamp: number): string =>
  new Date(timestamp * 1000).toISOString().slice(0, 10);

const parseDateToUnix = (date: string, offsetDays = 0): string => {
  const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + offsetDays);
  const unixSeconds = Math.floor(value.getTime() / 1000);
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
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const payload = await response.json().catch(async () => ({ raw: await response.text() }));

  if (!response.ok || payload?.chart?.error) {
    const providerMessage =
      payload?.message ||
      payload?.chart?.error?.description ||
      payload?.raw;
    throw new Error(toUserFriendlyProviderMessage(providerMessage));
  }

  return payload;
};

const mapChartSeries = (payload: any, dateForTimestamp = formatUnixDate): SecurityDailyPricePoint[] => {
  const result = payload?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close || [];

  const points: SecurityDailyPricePoint[] = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const close = closes[index];
    if (close === null || close === undefined) continue;
    if (typeof close !== "number" || !Number.isFinite(close) || close < 0 || !Number.isFinite(timestamps[index])) throw new Error("Invalid provider price or timestamp");

    points.push({
      marketDate: dateForTimestamp(timestamps[index]),
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
    const key = parseSecurityIdentity({ ticker: symbol, market });
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}`;
    const payload = await requestJson(url);
    const quotes = payload?.quotes || [];
    const matches = quotes.filter((quote: any) => String(quote?.symbol || "").trim() === key.ticker &&
      String(quote?.exchDisp || quote?.exchange || "").trim() === key.market);
    if (new Set(matches.map((quote: any) => quote.currency ?? null)).size > 1) throw new Error("Conflicting provider quote currencies for this market");
    const bestMatch = matches[0];

    if (!bestMatch) {
      return null;
    }

    return {
      symbol: key.ticker,
      market: key.market,
      displayName: bestMatch?.shortname || bestMatch?.longname || null,
      assetType: bestMatch?.quoteType || null,
      quoteCurrency: bestMatch?.currency || null,
    };
  },

  async fetchSecurityDailyPrices({ symbol, market, quoteCurrency, startDate, endDate }) {
    const key = parseSecurityIdentity({ ticker: symbol, market });
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=1d&period1=${parseDateToUnix(startDate, -1)}&period2=${parseDateToUnix(endDate, 2)}`;
    const payload = await requestJson(url);
    const meta = payload?.chart?.result?.[0]?.meta;
    if (!meta || meta.symbol !== key.ticker || ![meta.fullExchangeName, meta.exchangeName].includes(key.market) ||
      !/^[A-Z]{3}$/.test(quoteCurrency) || meta.currency !== quoteCurrency || meta.dataGranularity !== "1d" ||
      typeof meta.exchangeTimezoneName !== "string") throw new Error("Provider chart identity, market, currency or daily interval could not be verified");
    const formatter = new Intl.DateTimeFormat("en", { timeZone: meta.exchangeTimezoneName, year: "numeric", month: "2-digit", day: "2-digit" });
    return mapChartSeries(payload, (timestamp) => {
      const parts = new Map(formatter.formatToParts(new Date(timestamp * 1000)).map((part) => [part.type, part.value]));
      return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
    }).filter((point) => point.marketDate >= startDate && point.marketDate <= endDate).sort((a, b) => a.marketDate.localeCompare(b.marketDate));
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
