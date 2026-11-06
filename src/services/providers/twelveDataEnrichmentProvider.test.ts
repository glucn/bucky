import { afterEach, describe, expect, it, vi } from "vitest";
import { createTwelveDataEnrichmentProvider } from "./twelveDataEnrichmentProvider";

const asJsonResponse = (payload: unknown, ok = true): Response =>
  ({
    ok,
    status: ok ? 200 : 429,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response);

describe("createTwelveDataEnrichmentProvider", () => {
  it("qualifies security requests by exchange and rejects a response from another listing", async () => {
    const fetch = vi.fn().mockResolvedValue(asJsonResponse({ meta: { symbol: "ABC", exchange: "LSE", currency: "GBP", interval: "1day" }, values: [{ datetime: "2024-01-02", close: "12" }] }));
    vi.stubGlobal("fetch", fetch); const provider = createTwelveDataEnrichmentProvider("test-key");
    await expect(provider.fetchSecurityDailyPrices({ symbol: "ABC", market: "NASDAQ", quoteCurrency: "USD", startDate: "2024-01-01", endDate: "2024-01-02" })).rejects.toThrow(/market|identity|currency/i);
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get("exchange")).toBe("NASDAQ");
  });
  it("rejects partially numeric prices rather than truncating provider strings", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(asJsonResponse({ meta: { symbol: "ABC", exchange: "NASDAQ", currency: "USD", interval: "1day" }, values: [{ datetime: "2024-01-02", close: "12garbage" }] })));
    await expect(createTwelveDataEnrichmentProvider("test-key").fetchSecurityDailyPrices({ symbol: "ABC", market: "NASDAQ", quoteCurrency: "USD", startDate: "2024-01-01", endDate: "2024-01-02" })).rejects.toThrow(/price|number/i);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("throws when api key is missing", () => {
    expect(() => createTwelveDataEnrichmentProvider("")).toThrow(
      "Unable to fetch data from provider"
    );
  });

  it("maps ticker search candidates", async () => {
    const provider = createTwelveDataEnrichmentProvider("test-key");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        asJsonResponse({
          data: [
            {
              symbol: "AAPL",
              exchange: "NASDAQ",
              instrument_name: "Apple Inc",
              currency: "USD",
            },
          ],
        })
      )
    );

    const result = await provider.searchSecuritiesByTicker("AAPL");
    expect(result).toEqual([
      {
        symbol: "AAPL",
        market: "NASDAQ",
        displayName: "Apple Inc",
        quoteCurrency: "USD",
      },
    ]);
  });

  it("maps metadata from profile endpoint", async () => {
    const provider = createTwelveDataEnrichmentProvider("test-key");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        asJsonResponse({
          symbol: "AAPL",
          exchange: "NASDAQ",
          name: "Apple Inc",
          type: "Common Stock",
          currency: "USD",
        })
      )
    );

    const result = await provider.fetchSecurityMetadata({
      symbol: "AAPL",
      market: "NASDAQ",
    });

    expect(result).toEqual({
      symbol: "AAPL",
      market: "NASDAQ",
      displayName: "Apple Inc",
      assetType: "Common Stock",
      quoteCurrency: "USD",
    });
  });

  it("maps security daily prices from time_series", async () => {
    const provider = createTwelveDataEnrichmentProvider("test-key");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        asJsonResponse({
          meta: { symbol: "AAPL", exchange: "NASDAQ", currency: "USD", interval: "1day" },
          values: [
            { datetime: "2024-01-02", close: "188.12" },
            { datetime: "2024-01-01", close: "187.43" },
          ],
        })
      )
    );

    const result = await provider.fetchSecurityDailyPrices({
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

  it("maps fx daily rates from time_series", async () => {
    const provider = createTwelveDataEnrichmentProvider("test-key");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        asJsonResponse({
          values: [{ datetime: "2024-01-01", close: "1.355" }],
        })
      )
    );

    const result = await provider.fetchFxDailyRates({
      sourceCurrency: "CAD",
      targetCurrency: "USD",
      startDate: "2024-01-01",
      endDate: "2024-01-01",
    });

    expect(result).toEqual([{ marketDate: "2024-01-01", rate: 1.355 }]);
  });
});
