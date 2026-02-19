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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
                timestamp: [1704067200, 1704153600],
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
