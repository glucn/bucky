import { describe, expect, it, vi } from "vitest";
import { createEnrichmentRuntimeService } from "./enrichmentRuntimeService";

describe("enrichmentRuntimeService", () => {
  it("refreshes both persisted markets for the same ticker with each account's quote currency", async () => {
    const executePipeline = vi.fn().mockResolvedValue({ status: "completed", failedItems: [] });
    const holdings = vi.fn().mockResolvedValue([
      { tickerSymbol: "ABC", market: "NASDAQ", account: { currency: "USD" } },
      { tickerSymbol: "ABC", market: "LSE", account: { currency: "GBP" } },
    ]);
    const runtime = createEnrichmentRuntimeService({ getBaseCurrency: async () => "USD", env: { ENRICHMENT_PROVIDER: "yahoo" },
      prismaClient: { account: { findMany: vi.fn().mockResolvedValue([]) }, investmentProperties: { findMany: holdings },
        securityMetadata: { findMany: vi.fn().mockResolvedValue([{ ticker: "ABC", market: "LSE", quoteCurrency: "GBP" }]) },
        journalEntry: { aggregate: vi.fn().mockResolvedValue({ _min: { date: "2026-01-01" } }) } } as any,
      repository: { getLatestSecurityPriceDate: vi.fn().mockResolvedValue(null), getLatestFxRateDate: vi.fn().mockResolvedValue(null) } as any,
      executePipeline: executePipeline as any,
      resolveProvider: () => ({ ok: true, provider: { id: "yahoo", searchSecuritiesByTicker: vi.fn() } as any }),
    });
    runtime.startRun({ securityMetadata: true, securityPrices: true, fxRates: false });
    await vi.waitFor(() => expect(executePipeline).toHaveBeenCalledOnce());
    expect(executePipeline.mock.calls[0][0].securities).toEqual([
      expect.objectContaining({ ticker: "ABC", market: "NASDAQ", quoteCurrency: "USD" }),
      expect.objectContaining({ ticker: "ABC", market: "LSE", quoteCurrency: "GBP" }),
    ]);
    expect(holdings).toHaveBeenCalledWith({ select: { tickerSymbol: true, market: true, account: { select: { currency: true } } } });
  });
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
            { tickerSymbol: "AAPL", market: "NASDAQ", account: { currency: "USD" } },
            { tickerSymbol: "7203", market: "TSE", account: { currency: "JPY" } },
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
          findMany: vi.fn().mockResolvedValue([{ tickerSymbol: "AMZN", market: null, account: { currency: "USD" } }]),
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

  it("resolves reconciliation when FX runs and has zero FX failures", async () => {
    const setReconciliationState = vi.fn().mockResolvedValue(undefined);
    const runtime = createEnrichmentRuntimeService({
      env: { ENRICHMENT_PROVIDER: "yahoo" },
      getBaseCurrency: async () => "CAD",
      getBaseCurrencyReconciliationState: vi.fn().mockResolvedValue({
        targetBaseCurrency: "CAD",
        status: "pending",
        changedAt: "2026-02-20T10:00:00.000Z",
      }),
      setBaseCurrencyReconciliationState: setReconciliationState,
      prismaClient: {
        account: { findMany: vi.fn().mockResolvedValue([{ currency: "USD" }]) },
        investmentProperties: { findMany: vi.fn().mockResolvedValue([]) },
        securityMetadata: { findMany: vi.fn().mockResolvedValue([]) },
        journalEntry: { aggregate: vi.fn().mockResolvedValue({ _min: { date: "2024-01-01" } }) },
      } as any,
      repository: {
        getCategoryFreshness: vi.fn().mockResolvedValue({ metadata: null, prices: null, fx: null }),
        getLatestSecurityPriceDate: vi.fn().mockResolvedValue(null),
        getLatestFxRateDate: vi.fn().mockResolvedValue(null),
        upsertSecurityMetadataFillMissing: vi.fn(),
        insertMissingSecurityDailyPrices: vi.fn(),
        insertMissingFxDailyRates: vi.fn(),
      } as any,
      executePipeline: vi.fn().mockResolvedValue({
        status: "completed_with_issues",
        failedItems: [
          { category: "securityMetadata", identifier: "AAPL/NASDAQ", reason: "Unable to fetch" },
        ],
      }) as any,
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

    runtime.startRun({ securityMetadata: true, securityPrices: false, fxRates: true });

    await vi.waitFor(() => {
      expect(setReconciliationState).toHaveBeenCalledTimes(1);
    });

    expect(setReconciliationState.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        targetBaseCurrency: "CAD",
        status: "resolved",
      })
    );
  });

  it("keeps reconciliation pending for non-FX runs and FX failures", async () => {
    const setReconciliationState = vi.fn().mockResolvedValue(undefined);
    const getReconciliationState = vi.fn().mockResolvedValue({
      targetBaseCurrency: "CAD",
      status: "pending",
      changedAt: "2026-02-20T10:00:00.000Z",
    });
    const nonFxPipeline = vi.fn().mockResolvedValue({ status: "completed", failedItems: [] });
    const fxWithFailuresPipeline = vi.fn().mockResolvedValue({
      status: "completed_with_issues",
      failedItems: [{ category: "fxRates", identifier: "USD/CAD", reason: "timeout" }],
    });

    const createRuntime = (executePipeline: any) =>
      createEnrichmentRuntimeService({
      env: { ENRICHMENT_PROVIDER: "yahoo" },
      getBaseCurrency: async () => "CAD",
      getBaseCurrencyReconciliationState: getReconciliationState,
      setBaseCurrencyReconciliationState: setReconciliationState,
      prismaClient: {
        account: { findMany: vi.fn().mockResolvedValue([{ currency: "USD" }]) },
        investmentProperties: { findMany: vi.fn().mockResolvedValue([]) },
        securityMetadata: { findMany: vi.fn().mockResolvedValue([]) },
        journalEntry: { aggregate: vi.fn().mockResolvedValue({ _min: { date: "2024-01-01" } }) },
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
          searchSecuritiesByTicker: vi.fn().mockResolvedValue([]),
          fetchSecurityMetadata: vi.fn(),
          fetchSecurityDailyPrices: vi.fn(),
          fetchFxDailyRates: vi.fn(),
        },
      }),
    });

    const nonFxRuntime = createRuntime(nonFxPipeline);
    nonFxRuntime.startRun({ securityMetadata: true, securityPrices: false, fxRates: false });
    await vi.waitFor(() => expect(nonFxPipeline).toHaveBeenCalledTimes(1));

    const fxFailureRuntime = createRuntime(fxWithFailuresPipeline);
    fxFailureRuntime.startRun({ securityMetadata: false, securityPrices: false, fxRates: true });
    await vi.waitFor(() => expect(fxWithFailuresPipeline).toHaveBeenCalledTimes(1));

    expect(setReconciliationState).not.toHaveBeenCalled();
  });

  it("no-ops reconciliation update when state is missing or already resolved", async () => {
    const setReconciliationState = vi.fn().mockResolvedValue(undefined);
    const getReconciliationState = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        targetBaseCurrency: "CAD",
        status: "resolved",
        changedAt: "2026-02-20T10:00:00.000Z",
        resolvedAt: "2026-02-20T10:01:00.000Z",
      });

    const executePipeline = vi.fn().mockResolvedValue({ status: "completed", failedItems: [] });

    const createRuntime = () =>
      createEnrichmentRuntimeService({
      env: { ENRICHMENT_PROVIDER: "yahoo" },
      getBaseCurrency: async () => "CAD",
      getBaseCurrencyReconciliationState: getReconciliationState,
      setBaseCurrencyReconciliationState: setReconciliationState,
      prismaClient: {
        account: { findMany: vi.fn().mockResolvedValue([{ currency: "USD" }]) },
        investmentProperties: { findMany: vi.fn().mockResolvedValue([]) },
        securityMetadata: { findMany: vi.fn().mockResolvedValue([]) },
        journalEntry: { aggregate: vi.fn().mockResolvedValue({ _min: { date: "2024-01-01" } }) },
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
          searchSecuritiesByTicker: vi.fn().mockResolvedValue([]),
          fetchSecurityMetadata: vi.fn(),
          fetchSecurityDailyPrices: vi.fn(),
          fetchFxDailyRates: vi.fn(),
        },
      }),
    });

    const runtimeWithMissing = createRuntime();
    runtimeWithMissing.startRun({ securityMetadata: false, securityPrices: false, fxRates: true });
    await vi.waitFor(() => expect(executePipeline).toHaveBeenCalledTimes(1));

    const runtimeWithResolved = createRuntime();
    runtimeWithResolved.startRun({ securityMetadata: false, securityPrices: false, fxRates: true });
    await vi.waitFor(() => expect(executePipeline).toHaveBeenCalledTimes(2));

    expect(setReconciliationState).not.toHaveBeenCalled();
  });
});
