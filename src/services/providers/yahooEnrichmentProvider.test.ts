import { afterEach, describe, expect, it, vi } from "vitest";
import { yahooEnrichmentProvider } from "./yahooEnrichmentProvider";

const asJsonResponse = (payload: unknown, ok = true): Response =>
  ({
    ok,
    status: ok ? 200 : 429,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response);

describe("yahooEnrichmentProvider", () => {
  it("does not substitute another ticker or market when exact metadata is absent", async () => {
    for (const quote of [{ symbol: "OTHER", exchDisp: "NASDAQ", currency: "USD" }, { symbol: "AAPL", exchDisp: "LSE", currency: "GBP" }]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(asJsonResponse({ quotes: [quote] })));
      expect(await yahooEnrichmentProvider.fetchSecurityMetadata({ symbol: "AAPL", market: "NASDAQ" })).toBeNull();
    }
  });
  it.each([
    { symbol: "OTHER", fullExchangeName: "NASDAQ", currency: "USD", exchangeTimezoneName: "America/New_York", dataGranularity: "1d" },
    { symbol: "AAPL", fullExchangeName: "LSE", currency: "USD", exchangeTimezoneName: "America/New_York", dataGranularity: "1d" },
    { symbol: "AAPL", fullExchangeName: "NASDAQ", currency: "CAD", exchangeTimezoneName: "America/New_York", dataGranularity: "1d" },
  ])("rejects chart data with conflicting instrument context %j", async (meta) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(asJsonResponse({ chart: { result: [{ meta, timestamp: [1704067200], indicators: { quote: [{ close: [12] }] } }] } })));
    await expect(yahooEnrichmentProvider.fetchSecurityDailyPrices({ symbol: "AAPL", market: "NASDAQ", quoteCurrency: "USD", startDate: "2024-01-01", endDate: "2024-01-02" })).rejects.toThrow(/identity|market|currency/i);
  });
  it("uses the exchange's calendar date and includes the requested end day", async () => {
    const fetch = vi.fn().mockResolvedValue(asJsonResponse({ chart: { result: [{
      meta: { symbol: "ABC.AX", fullExchangeName: "ASX", currency: "AUD", exchangeTimezoneName: "Australia/Sydney", dataGranularity: "1d" },
      timestamp: [Date.parse("2024-01-01T23:00:00Z") / 1000], indicators: { quote: [{ close: [12] }] },
    }] } })); vi.stubGlobal("fetch", fetch);
    expect(await yahooEnrichmentProvider.fetchSecurityDailyPrices({ symbol: "ABC.AX", market: "ASX", quoteCurrency: "AUD", startDate: "2024-01-02", endDate: "2024-01-02" }))
      .toEqual([{ marketDate: "2024-01-02", close: 12 }]);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(Number(url.searchParams.get("period2"))).toBeGreaterThan(Date.parse("2024-01-03T00:00:00Z") / 1000);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reports chart-level errors even when the HTTP response is successful", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(asJsonResponse({ chart: { result: null, error: { description: "Unknown chart symbol" } } })));
    await expect(yahooEnrichmentProvider.fetchFxDailyRates({ sourceCurrency: "CAD", targetCurrency: "USD", startDate: "2024-01-01", endDate: "2024-01-02" })).rejects.toThrow("Unknown chart symbol");
  });

  it("searches ticker candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        asJsonResponse({
          quotes: [
            {
              symbol: "AAPL",
              exchDisp: "NASDAQ",
              shortname: "Apple Inc.",
              currency: "USD",
            },
          ],
        })
      )
    );

    const result = await yahooEnrichmentProvider.searchSecuritiesByTicker("AAPL");

    expect(result).toEqual([
      {
        symbol: "AAPL",
        market: "NASDAQ",
        displayName: "Apple Inc.",
        quoteCurrency: "USD",
      },
    ]);
  });

  it("fetches security metadata from search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        asJsonResponse({
          quotes: [
            {
              symbol: "AAPL",
              exchDisp: "NASDAQ",
              shortname: "Apple Inc.",
              quoteType: "EQUITY",
              currency: "USD",
            },
          ],
        })
      )
    );

    const result = await yahooEnrichmentProvider.fetchSecurityMetadata({
      symbol: "AAPL",
      market: "NASDAQ",
    });

    expect(result).toEqual({
      symbol: "AAPL",
      market: "NASDAQ",
      displayName: "Apple Inc.",
      assetType: "EQUITY",
      quoteCurrency: "USD",
    });
  });

  it("fetches security daily prices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        asJsonResponse({
          chart: {
            result: [
              {
                meta: { symbol: "AAPL", fullExchangeName: "NASDAQ", currency: "USD", exchangeTimezoneName: "America/New_York", dataGranularity: "1d" },
                timestamp: [1704119400, 1704205800],
                indicators: {
                  quote: [
                    {
                      close: [187.43, 188.12],
                    },
                  ],
                },
              },
            ],
          },
        })
      )
    );

    const result = await yahooEnrichmentProvider.fetchSecurityDailyPrices({
      symbol: "AAPL",
      market: "NASDAQ",
      quoteCurrency: "USD",
      startDate: "2024-01-01",
      endDate: "2024-01-02",
    });

    expect(result).toEqual([
      { marketDate: "2024-01-01", close: 187.43 },
      { marketDate: "2024-01-02", close: 188.12 },
    ]);
  });

  it("fetches FX daily rates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        asJsonResponse({
          chart: {
            result: [
              {
                timestamp: [1704067200],
                indicators: {
                  quote: [
                    {
                      close: [1.355],
                    },
                  ],
                },
              },
            ],
          },
        })
      )
    );

    const result = await yahooEnrichmentProvider.fetchFxDailyRates({
      sourceCurrency: "CAD",
      targetCurrency: "USD",
      startDate: "2024-01-01",
      endDate: "2024-01-01",
    });

    expect(result).toEqual([{ marketDate: "2024-01-01", rate: 1.355 }]);
  });

  it("preserves provider message with light cleanup for non-200 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(asJsonResponse({ message: "Too Many Requests" }, false))
    );

    await expect(
      yahooEnrichmentProvider.searchSecuritiesByTicker("AAPL")
    ).rejects.toThrow("Too Many Requests");
  });
});
