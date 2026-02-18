import { describe, expect, it, vi } from "vitest";
import { createEnrichmentRunCoordinator } from "./enrichmentRunCoordinator";
import { executeEnrichmentPipeline } from "./enrichmentPipelineExecutor";
import type { EnrichmentProviderAdapter } from "./enrichmentProviderRegistry";

const provider = (): EnrichmentProviderAdapter => ({
  id: "yahoo",
  capabilities: {
    supportsSecurityMetadata: true,
    supportsSecurityDailyPrices: true,
    supportsFxDailyRates: true,
    supportsBatchRequests: false,
  },
  searchSecuritiesByTicker: vi.fn(),
  fetchSecurityMetadata: vi.fn(async ({ symbol, market }) => ({
    symbol,
    market,
    displayName: `${symbol} Inc`,
    assetType: "EQUITY",
    quoteCurrency: "USD",
  })),
  fetchSecurityDailyPrices: vi.fn(async () => [{ marketDate: "2024-01-01", close: 100 }]),
  fetchFxDailyRates: vi.fn(async () => [{ marketDate: "2024-01-01", rate: 1.3 }]),
});

describe("executeEnrichmentPipeline", () => {
  it("runs selected categories in fixed order and updates progress", async () => {
    const calls: string[] = [];
    const p = provider();
    p.fetchSecurityMetadata = vi.fn(async (input) => {
      calls.push("metadata");
      return provider().fetchSecurityMetadata(input);
    });
    p.fetchSecurityDailyPrices = vi.fn(async (input) => {
      calls.push("prices");
      return provider().fetchSecurityDailyPrices(input);
    });
    p.fetchFxDailyRates = vi.fn(async (input) => {
      calls.push("fx");
      return provider().fetchFxDailyRates(input);
    });

    const repo = {
      upsertSecurityMetadataFillMissing: vi.fn(),
      insertMissingSecurityDailyPrices: vi.fn(),
      insertMissingFxDailyRates: vi.fn(),
    };

    const coordinator = createEnrichmentRunCoordinator();
    const { run } = coordinator.startOrGetExistingRun({
      securityMetadata: true,
      securityPrices: true,
      fxRates: true,
    });

    const result = await executeEnrichmentPipeline({
      runId: run.id,
      provider: p,
      repository: repo,
      coordinator,
      scope: run.scope,
      securities: [{ ticker: "AAPL", market: "NASDAQ", startDate: "2024-01-01", endDate: "2024-01-01" }],
      fxPairs: [{ sourceCurrency: "CAD", targetCurrency: "USD", startDate: "2024-01-01", endDate: "2024-01-01" }],
    });

    expect(calls).toEqual(["metadata", "prices", "fx"]);
    expect(result.status).toBe("completed");
    expect(result.failedItems).toHaveLength(0);
  });

  it("marks run completed with issues when one category item fails", async () => {
    const p = provider();
    p.fetchSecurityDailyPrices = vi.fn(async () => {
      throw new Error("Provider timeout");
    });

    const repo = {
      upsertSecurityMetadataFillMissing: vi.fn(),
      insertMissingSecurityDailyPrices: vi.fn(),
      insertMissingFxDailyRates: vi.fn(),
    };

    const coordinator = createEnrichmentRunCoordinator();
    const { run } = coordinator.startOrGetExistingRun({
      securityMetadata: false,
      securityPrices: true,
      fxRates: false,
    });

    const result = await executeEnrichmentPipeline({
      runId: run.id,
      provider: p,
      repository: repo,
      coordinator,
      scope: run.scope,
      securities: [{ ticker: "AAPL", market: "NASDAQ", startDate: "2024-01-01", endDate: "2024-01-01" }],
      fxPairs: [],
    });

    expect(result.status).toBe("completed_with_issues");
    expect(result.failedItems).toEqual([
      {
        category: "securityPrices",
        identifier: "AAPL/NASDAQ",
        reason: "Provider timeout",
      },
    ]);
  });

  it("ends as canceled when cancellation is requested", async () => {
    const p = provider();
    p.fetchSecurityMetadata = vi.fn(async () => {
      throw new Error("Should not be reached");
    });

    const repo = {
      upsertSecurityMetadataFillMissing: vi.fn(),
      insertMissingSecurityDailyPrices: vi.fn(),
      insertMissingFxDailyRates: vi.fn(),
    };

    const coordinator = createEnrichmentRunCoordinator();
    const { run } = coordinator.startOrGetExistingRun({
      securityMetadata: true,
      securityPrices: false,
      fxRates: false,
    });

    const result = await executeEnrichmentPipeline({
      runId: run.id,
      provider: p,
      repository: repo,
      coordinator,
      scope: run.scope,
      securities: [{ ticker: "AAPL", market: "NASDAQ", startDate: "2024-01-01", endDate: "2024-01-01" }],
      fxPairs: [],
      cancellation: {
        isCanceled: () => true,
      },
    });

    expect(result.status).toBe("canceled");
    expect(p.fetchSecurityMetadata).not.toHaveBeenCalled();
  });
});
