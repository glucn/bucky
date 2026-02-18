import { createEnrichmentRunCoordinator, type EnrichmentRunScope } from "./enrichmentRunCoordinator";
import { enrichmentRepository } from "./enrichmentRepository";

const coordinator = createEnrichmentRunCoordinator();

class EnrichmentRuntimeService {
  private latestSummary: any | null = null;

  startRun(scope: EnrichmentRunScope) {
    const result = coordinator.startOrGetExistingRun(scope);
    return result;
  }

  async getPanelState() {
    const freshness = await enrichmentRepository.getCategoryFreshness();

    return {
      activeRun: coordinator.getActiveRun(),
      latestSummary: this.latestSummary,
      freshness,
    };
  }

  cancelRun(runId: string) {
    coordinator.finishRun(runId, "canceled");
    this.latestSummary = coordinator.getRunSummary(runId);
    return { success: true };
  }

  sendToBackground(runId: string) {
    const run = coordinator.getRunSummary(runId);
    return {
      success: Boolean(run),
    };
  }

  getRunSummary(runId: string) {
    return coordinator.getRunSummary(runId);
  }

  seedCompletedWithIssuesRunForTest() {
    const { run } = coordinator.startOrGetExistingRun({
      securityMetadata: true,
      securityPrices: true,
      fxRates: true,
    });

    coordinator.updateCategoryProgress(run.id, "securityMetadata", { total: 1, processed: 1 });
    coordinator.updateCategoryProgress(run.id, "securityPrices", { total: 1, processed: 1 });
    coordinator.updateCategoryProgress(run.id, "fxRates", { total: 1, processed: 1 });
    coordinator.addFailedItem(run.id, {
      category: "fxRates",
      identifier: "CAD/USD",
      reason: "Unable to fetch data from provider",
    });
    coordinator.finishRun(run.id, "completed_with_issues");
    this.latestSummary = coordinator.getRunSummary(run.id);

    return { runId: run.id };
  }
}

export const enrichmentRuntimeService = new EnrichmentRuntimeService();
