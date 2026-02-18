import type { EnrichmentRunScope } from "./enrichmentRunCoordinator";
import type { EnrichmentProviderAdapter } from "./enrichmentProviderRegistry";
import { withTransientRetry } from "./enrichmentRetry";

type SecurityRange = {
  ticker: string;
  market: string;
  startDate: string;
  endDate: string;
};

type FxRange = {
  sourceCurrency: string;
  targetCurrency: string;
  startDate: string;
  endDate: string;
};

type RepositoryContract = {
  upsertSecurityMetadataFillMissing(input: {
    ticker: string;
    market: string;
    displayName: string | null;
    assetType: string | null;
    quoteCurrency: string | null;
  }): Promise<unknown>;
  insertMissingSecurityDailyPrices(
    key: { ticker: string; market: string },
    points: Array<{ marketDate: string; close: number }>
  ): Promise<unknown>;
  insertMissingFxDailyRates(
    key: { sourceCurrency: string; targetCurrency: string },
    points: Array<{ marketDate: string; rate: number }>
  ): Promise<unknown>;
};

type CoordinatorContract = {
  updateCategoryProgress(
    runId: string,
    category: "securityMetadata" | "securityPrices" | "fxRates",
    progress: { total: number; processed: number }
  ): void;
  addFailedItem(
    runId: string,
    failedItem: {
      category: "securityMetadata" | "securityPrices" | "fxRates";
      identifier: string;
      reason: string;
    }
  ): void;
  finishRun(runId: string, status: "completed" | "completed_with_issues" | "canceled"): void;
};

type PipelineInput = {
  runId: string;
  provider: EnrichmentProviderAdapter;
  repository: RepositoryContract;
  coordinator: CoordinatorContract;
  scope: EnrichmentRunScope;
  securities: SecurityRange[];
  fxPairs: FxRange[];
  cancellation?: {
    isCanceled: () => boolean;
  };
  retryOptions?: {
    maxRetries: number;
    initialDelayMs: number;
  };
};

const toReason = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unable to fetch data from provider";
};

export const executeEnrichmentPipeline = async (input: PipelineInput) => {
  const failedItems: Array<{
    category: "securityMetadata" | "securityPrices" | "fxRates";
    identifier: string;
    reason: string;
  }> = [];

  const retryOptions = input.retryOptions || {
    maxRetries: 2,
    initialDelayMs: 200,
  };

  const shouldCancel = () => Boolean(input.cancellation?.isCanceled());

  if (input.scope.securityMetadata) {
    let processed = 0;
    const total = input.securities.length;
    input.coordinator.updateCategoryProgress(input.runId, "securityMetadata", {
      total,
      processed,
    });

    for (const security of input.securities) {
      if (shouldCancel()) {
        input.coordinator.finishRun(input.runId, "canceled");
        return {
          status: "canceled" as const,
          failedItems,
        };
      }

      try {
        const metadata = await withTransientRetry(
          () =>
            input.provider.fetchSecurityMetadata({
              symbol: security.ticker,
              market: security.market,
            }),
          retryOptions
        );
        if (metadata) {
          await input.repository.upsertSecurityMetadataFillMissing({
            ticker: security.ticker,
            market: security.market,
            displayName: metadata.displayName,
            assetType: metadata.assetType,
            quoteCurrency: metadata.quoteCurrency,
          });
        }
      } catch (error) {
        const failedItem = {
          category: "securityMetadata" as const,
          identifier: `${security.ticker}/${security.market}`,
          reason: toReason(error),
        };
        failedItems.push(failedItem);
        input.coordinator.addFailedItem(input.runId, failedItem);
      } finally {
        processed += 1;
        input.coordinator.updateCategoryProgress(input.runId, "securityMetadata", {
          total,
          processed,
        });
      }
    }
  }

  if (input.scope.securityPrices) {
    let processed = 0;
    const total = input.securities.length;
    input.coordinator.updateCategoryProgress(input.runId, "securityPrices", {
      total,
      processed,
    });

    for (const security of input.securities) {
      if (shouldCancel()) {
        input.coordinator.finishRun(input.runId, "canceled");
        return {
          status: "canceled" as const,
          failedItems,
        };
      }

      try {
        const points = await withTransientRetry(
          () =>
            input.provider.fetchSecurityDailyPrices({
              symbol: security.ticker,
              market: security.market,
              startDate: security.startDate,
              endDate: security.endDate,
            }),
          retryOptions
        );
        await input.repository.insertMissingSecurityDailyPrices(
          {
            ticker: security.ticker,
            market: security.market,
          },
          points
        );
      } catch (error) {
        const failedItem = {
          category: "securityPrices" as const,
          identifier: `${security.ticker}/${security.market}`,
          reason: toReason(error),
        };
        failedItems.push(failedItem);
        input.coordinator.addFailedItem(input.runId, failedItem);
      } finally {
        processed += 1;
        input.coordinator.updateCategoryProgress(input.runId, "securityPrices", {
          total,
          processed,
        });
      }
    }
  }

  if (input.scope.fxRates) {
    let processed = 0;
    const total = input.fxPairs.length;
    input.coordinator.updateCategoryProgress(input.runId, "fxRates", {
      total,
      processed,
    });

    for (const pair of input.fxPairs) {
      if (shouldCancel()) {
        input.coordinator.finishRun(input.runId, "canceled");
        return {
          status: "canceled" as const,
          failedItems,
        };
      }

      try {
        const points = await withTransientRetry(
          () =>
            input.provider.fetchFxDailyRates({
              sourceCurrency: pair.sourceCurrency,
              targetCurrency: pair.targetCurrency,
              startDate: pair.startDate,
              endDate: pair.endDate,
            }),
          retryOptions
        );
        await input.repository.insertMissingFxDailyRates(
          {
            sourceCurrency: pair.sourceCurrency,
            targetCurrency: pair.targetCurrency,
          },
          points
        );
      } catch (error) {
        const failedItem = {
          category: "fxRates" as const,
          identifier: `${pair.sourceCurrency}/${pair.targetCurrency}`,
          reason: toReason(error),
        };
        failedItems.push(failedItem);
        input.coordinator.addFailedItem(input.runId, failedItem);
      } finally {
        processed += 1;
        input.coordinator.updateCategoryProgress(input.runId, "fxRates", {
          total,
          processed,
        });
      }
    }
  }

  const status = failedItems.length > 0 ? "completed_with_issues" : "completed";
  input.coordinator.finishRun(input.runId, status);

  return {
    status,
    failedItems,
  };
};
