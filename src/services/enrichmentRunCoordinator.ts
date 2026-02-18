import crypto from "crypto";

type EnrichmentCategory = "securityMetadata" | "securityPrices" | "fxRates";

export type EnrichmentRunScope = Record<EnrichmentCategory, boolean>;

type CategoryProgress = {
  total: number;
  processed: number;
};

type FailedItem = {
  category: EnrichmentCategory;
  identifier: string;
  reason: string;
};

type EnrichmentRunStatus =
  | "running"
  | "completed"
  | "completed_with_issues"
  | "canceled";

export type EnrichmentRunState = {
  id: string;
  scope: EnrichmentRunScope;
  startedAt: Date;
  endedAt: Date | null;
  status: EnrichmentRunStatus;
  categoryProgress: Record<EnrichmentCategory, CategoryProgress>;
  failedItems: FailedItem[];
};

const createEmptyCategoryProgress = (): Record<EnrichmentCategory, CategoryProgress> => ({
  securityMetadata: { total: 0, processed: 0 },
  securityPrices: { total: 0, processed: 0 },
  fxRates: { total: 0, processed: 0 },
});

export const createEnrichmentRunCoordinator = () => {
  let activeRun: EnrichmentRunState | null = null;
  const completedRuns = new Map<string, EnrichmentRunState>();

  return {
    startOrGetExistingRun(scope: EnrichmentRunScope): {
      createdNewRun: boolean;
      run: EnrichmentRunState;
    } {
      if (activeRun) {
        return { createdNewRun: false, run: activeRun };
      }

      activeRun = {
        id: crypto.randomUUID(),
        scope,
        startedAt: new Date(),
        endedAt: null,
        status: "running",
        categoryProgress: createEmptyCategoryProgress(),
        failedItems: [],
      };

      return { createdNewRun: true, run: activeRun };
    },

    getActiveRun(): EnrichmentRunState | null {
      return activeRun;
    },

    updateCategoryProgress(
      runId: string,
      category: EnrichmentCategory,
      progress: CategoryProgress
    ): void {
      if (!activeRun || activeRun.id !== runId) {
        return;
      }

      activeRun.categoryProgress[category] = progress;
    },

    addFailedItem(runId: string, failedItem: FailedItem): void {
      if (!activeRun || activeRun.id !== runId) {
        return;
      }

      activeRun.failedItems.push(failedItem);
    },

    finishRun(runId: string, status: Exclude<EnrichmentRunStatus, "running">): void {
      if (!activeRun || activeRun.id !== runId) {
        return;
      }

      activeRun.status = status;
      activeRun.endedAt = new Date();
      completedRuns.set(runId, activeRun);
      activeRun = null;
    },

    getRunSummary(runId: string): EnrichmentRunState | null {
      if (activeRun?.id === runId) {
        return activeRun;
      }

      return completedRuns.get(runId) || null;
    },
  };
};
