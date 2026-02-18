import { describe, expect, it } from "vitest";
import {
  type EnrichmentRunScope,
  createEnrichmentRunCoordinator,
} from "./enrichmentRunCoordinator";

const fullScope: EnrichmentRunScope = {
  securityMetadata: true,
  securityPrices: true,
  fxRates: true,
};

describe("enrichmentRunCoordinator", () => {
  it("allows only one active run and returns existing run when already active", () => {
    const coordinator = createEnrichmentRunCoordinator();

    const first = coordinator.startOrGetExistingRun(fullScope);
    const second = coordinator.startOrGetExistingRun(fullScope);

    expect(first.createdNewRun).toBe(true);
    expect(second.createdNewRun).toBe(false);
    expect(second.run.id).toBe(first.run.id);
  });

  it("updates per-category processed and total counters", () => {
    const coordinator = createEnrichmentRunCoordinator();
    const { run } = coordinator.startOrGetExistingRun(fullScope);

    coordinator.updateCategoryProgress(run.id, "securityPrices", {
      total: 10,
      processed: 3,
    });

    const active = coordinator.getActiveRun();
    expect(active?.categoryProgress.securityPrices.total).toBe(10);
    expect(active?.categoryProgress.securityPrices.processed).toBe(3);
  });

  it("stores failed item details and preserves in-memory state", () => {
    const coordinator = createEnrichmentRunCoordinator();
    const { run } = coordinator.startOrGetExistingRun(fullScope);

    coordinator.addFailedItem(run.id, {
      category: "fxRates",
      identifier: "CAD/USD",
      reason: "Rate limit exceeded",
    });

    const active = coordinator.getActiveRun();
    expect(active?.failedItems).toEqual([
      {
        category: "fxRates",
        identifier: "CAD/USD",
        reason: "Rate limit exceeded",
      },
    ]);
  });

  it("ends run and clears active state", () => {
    const coordinator = createEnrichmentRunCoordinator();
    const { run } = coordinator.startOrGetExistingRun(fullScope);

    coordinator.finishRun(run.id, "completed_with_issues");

    expect(coordinator.getActiveRun()).toBeNull();

    const summary = coordinator.getRunSummary(run.id);
    expect(summary?.status).toBe("completed_with_issues");
  });
});
