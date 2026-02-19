import { describe, expect, it, vi } from "vitest";
import { createEnrichmentRuntimeService } from "./enrichmentRuntimeService";

describe("enrichmentRuntimeService", () => {
  it("starts pipeline and derives FX pairs from all account currencies", async () => {
    const executePipeline = vi.fn().mockResolvedValue({ status: "completed", failedItems: [] });
    const repository = {
      getCategoryFreshness: vi.fn().mockResolvedValue({ metadata: null, prices: null, fx: null }),
      getLatestSecurityPriceDate: vi.fn().mockResolvedValue(null),
      getLatestFxRateDate: vi.fn().mockResolvedValue(null),
      upsertSecurityMetadataFillMissing: vi.fn(),
      insertMissingSecurityDailyPrices: vi.fn(),
      insertMissingFxDailyRates: vi.fn(),
    } as any;

    const runtime = createEnrichmentRuntimeService({
      env: { ENRICHMENT_PROVIDER: "yahoo" },
      getBaseCurrency: async () => "CAD",
      prismaClient: {
        account: {
          findMany: vi.fn().mockResolvedValue([
            { currency: "USD" },
            { currency: "EUR" },
            { currency: "CAD" },
            { currency: "USD" },
          ]),
        },
        investmentProperties: {
          findMany: vi.fn().mockResolvedValue([
            { tickerSymbol: "AAPL" },
            { tickerSymbol: "7203" },
          ]),
        },
        securityMetadata: {
          findMany: vi.fn().mockResolvedValue([
            { ticker: "AAPL", market: "NASDAQ", quoteCurrency: "USD" },
            { ticker: "7203", market: "TSE", quoteCurrency: "JPY" },
          ]),
        },
        journalEntry: {
          aggregate: vi.fn().mockResolvedValue({ _min: { date: "2024-01-01" } }),
        },
      },
      repository,
      executePipeline: executePipeline as any,
      resolveProvider: () => ({
        ok: true,
        provider: {
          id: "yahoo",
          capabilities: {
            supportsSecurityMetadata: true,
            supportsSecurityDailyPrices: true,
            supportsFxDailyRates: true,
            supportsBatchRequests: false,
          },
          searchSecuritiesByTicker: vi.fn().mockResolvedValue([]),
          fetchSecurityMetadata: vi.fn(),
          fetchSecurityDailyPrices: vi.fn(),
          fetchFxDailyRates: vi.fn(),
        },
      }),
    });

    runtime.startRun({ securityMetadata: false, securityPrices: false, fxRates: true });

    await vi.waitFor(() => {
      expect(executePipeline).toHaveBeenCalledTimes(1);
    });

    const payload = executePipeline.mock.calls[0][0];
    expect(payload.fxPairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceCurrency: "USD", targetCurrency: "CAD", startDate: "2024-01-01" }),
        expect.objectContaining({ sourceCurrency: "EUR", targetCurrency: "CAD", startDate: "2024-01-01" }),
        expect.objectContaining({ sourceCurrency: "JPY", targetCurrency: "CAD", startDate: "2024-01-01" }),
      ])
    );
    expect(payload.fxPairs).toHaveLength(3);
  });

  it("builds security targets from investment properties when metadata is missing", async () => {
    const executePipeline = vi.fn().mockResolvedValue({ status: "completed", failedItems: [] });
    const runtime = createEnrichmentRuntimeService({
      env: { ENRICHMENT_PROVIDER: "yahoo" },
      getBaseCurrency: async () => "CAD",
      prismaClient: {
        account: {
          findMany: vi.fn().mockResolvedValue([{ currency: "USD" }]),
        },
        investmentProperties: {
          findMany: vi.fn().mockResolvedValue([{ tickerSymbol: "AMZN" }]),
        },
        securityMetadata: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        journalEntry: {
          aggregate: vi.fn().mockResolvedValue({ _min: { date: "2024-01-01" } }),
        },
      } as any,
      repository: {
        getCategoryFreshness: vi.fn().mockResolvedValue({ metadata: null, prices: null, fx: null }),
        getLatestSecurityPriceDate: vi.fn().mockResolvedValue(null),
        getLatestFxRateDate: vi.fn().mockResolvedValue(null),
        upsertSecurityMetadataFillMissing: vi.fn(),
        insertMissingSecurityDailyPrices: vi.fn(),
        insertMissingFxDailyRates: vi.fn(),
      } as any,
      executePipeline: executePipeline as any,
      resolveProvider: () => ({
        ok: true,
        provider: {
          id: "yahoo",
          capabilities: {
            supportsSecurityMetadata: true,
            supportsSecurityDailyPrices: true,
            supportsFxDailyRates: true,
            supportsBatchRequests: false,
          },
          searchSecuritiesByTicker: vi.fn().mockResolvedValue([
            {
              symbol: "AMZN",
              market: "NASDAQ",
              displayName: "Amazon.com, Inc.",
              quoteCurrency: "USD",
            },
          ]),
          fetchSecurityMetadata: vi.fn(),
          fetchSecurityDailyPrices: vi.fn(),
          fetchFxDailyRates: vi.fn(),
        },
      }),
    });

    runtime.startRun({ securityMetadata: true, securityPrices: true, fxRates: false });

    await vi.waitFor(() => {
      expect(executePipeline).toHaveBeenCalledTimes(1);
    });

    const payload = executePipeline.mock.calls[0][0];
    expect(payload.securities).toEqual([
      expect.objectContaining({ ticker: "AMZN", market: "NASDAQ", startDate: "2024-01-01" }),
    ]);
  });
});
