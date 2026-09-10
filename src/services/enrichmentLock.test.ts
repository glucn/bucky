import { expect, it, vi } from "vitest";
import { createEnrichmentRuntimeService } from "./enrichmentRuntimeService";
import { createEnrichmentRunCoordinator } from "./enrichmentRunCoordinator";

it("quiesces a late provider response without writing or retaining financial state after locking", async () => {
  let received!: () => void;
  let respond!: (value: any) => void;
  const requested = new Promise<void>((resolve) => { received = resolve; });
  const response = new Promise<any>((resolve) => { respond = resolve; });
  const insert = vi.fn();
  const coordinator = createEnrichmentRunCoordinator();
  const runtime = createEnrichmentRuntimeService({
    coordinator,
    getBaseCurrency: async () => "CAD",
    getBaseCurrencyReconciliationState: async () => null,
    prismaClient: {
      account: { findMany: async () => [] },
      investmentProperties: { findMany: async () => [{ tickerSymbol: "PRIVATE" }] },
      securityMetadata: { findMany: async () => [{ ticker: "PRIVATE", market: "TSX", quoteCurrency: "CAD" }] },
      journalEntry: { aggregate: async () => ({ _min: { date: "2026-01-01" } }) },
    },
    repository: { getLatestSecurityPriceDate: async () => null, getLatestFxRateDate: async () => null,
      getCategoryFreshness: async () => ({}), insertMissingSecurityDailyPrices: insert } as any,
    resolveProvider: () => ({ ok: true, provider: {
      id: "synthetic", capabilities: { supportsSecurityMetadata: false, supportsSecurityDailyPrices: true,
        supportsFxDailyRates: false, supportsBatchRequests: false },
      fetchSecurityDailyPrices: async () => { received(); return response; },
    } as any }),
  });
  const { run } = runtime.startRun({ securityMetadata: false, securityPrices: true, fxRates: false });
  await requested;
  const locked = runtime.suspendForLock();
  expect(() => runtime.startRun({ securityMetadata: false, securityPrices: true, fxRates: false })).toThrow(/locked/i);
  respond([{ marketDate: "2026-01-01", close: 123 }]);
  await locked;
  expect(insert).not.toHaveBeenCalled();
  expect(coordinator.getActiveRun()).toBeNull();
  expect(runtime.getRunSummary(run.id)).toBeNull();
  expect((await runtime.getPanelState()).latestSummary).toBeNull();
  runtime.resumeAfterUnlock();
  expect(runtime.startRun({ securityMetadata: false, securityPrices: false, fxRates: false }).createdNewRun).toBe(true);
  await runtime.suspendForLock();
});
