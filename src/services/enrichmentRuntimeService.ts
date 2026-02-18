import { createEnrichmentRunCoordinator, type EnrichmentRunScope } from "./enrichmentRunCoordinator";

const coordinator = createEnrichmentRunCoordinator();

class EnrichmentRuntimeService {
  startRun(scope: EnrichmentRunScope) {
    return coordinator.startOrGetExistingRun(scope);
  }

  getPanelState() {
    return {
      activeRun: coordinator.getActiveRun(),
    };
  }

  cancelRun(runId: string) {
    coordinator.finishRun(runId, "canceled");
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
}

export const enrichmentRuntimeService = new EnrichmentRuntimeService();
