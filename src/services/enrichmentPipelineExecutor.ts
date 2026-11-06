import type { EnrichmentRunScope } from "./enrichmentRunCoordinator";
import type { EnrichmentProviderAdapter, SecurityDailyPricePoint } from "./enrichmentProviderRegistry";
import { verifyPricePolicy } from "./securityPricePolicy";
import { withTransientRetry } from "./enrichmentRetry";
import { parseSecurityIdentity } from "../shared/securityMarket";
import { isValidStandardDate } from "../shared/dateUtils";

type SecurityRange = {
  ticker: string;
  market: string;
  quoteCurrency: string;
  validationError?: string;
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
    points: SecurityDailyPricePoint[]
  ): Promise<{ unavailable: number } | void>;
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

const verifySecurity = (security: SecurityRange) => {
  if (security.validationError) throw new Error(security.validationError);
  parseSecurityIdentity({ ticker: security.ticker, market: security.market });
  if (!/^[A-Z]{3}$/.test(security.quoteCurrency)) throw new Error("Security quote currency must be verified before refreshing prices");
};
const verifyRange = (security: SecurityRange) => {
  if (!isValidStandardDate(security.startDate) || !isValidStandardDate(security.endDate) || security.startDate > security.endDate ||
    security.endDate > new Date().toISOString().slice(0, 10)) throw new Error("Invalid security refresh date range");
};

export const executeEnrichmentPipeline = async (input: PipelineInput) => {
  const failedItems: Array<{
    category: "securityMetadata" | "securityPrices" | "fxRates";
    identifier: string;
    reason: string;
  }> = [];
  const metadataFailures = new Set<string>();
  const identityKey = (security: SecurityRange) => JSON.stringify([security.ticker, security.market, security.quoteCurrency]);

  const retryOptions = input.retryOptions || {
    maxRetries: 2,
    initialDelayMs: 200,
  };

  const shouldCancel = () => Boolean(input.cancellation?.isCanceled());
  const requireActive = <T>(operation: () => Promise<T>) => {
    if (shouldCancel()) throw new Error("Enrichment canceled");
    return operation();
  };
  const canceledResult = () => {
    input.coordinator.finishRun(input.runId, "canceled");
    return { status: "canceled" as const, failedItems };
  };

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
        verifySecurity(security);
        const metadata = await withTransientRetry(
          () => requireActive(() =>
            input.provider.fetchSecurityMetadata({
              symbol: security.ticker,
              market: security.market,
            })),
          retryOptions
        );
        if (shouldCancel()) return canceledResult();
        if (!metadata || metadata.symbol !== security.ticker || metadata.market !== security.market || metadata.quoteCurrency !== security.quoteCurrency) {
          throw new Error("Provider metadata did not match the requested security market and quote currency");
        }
        await input.repository.upsertSecurityMetadataFillMissing({
          ticker: security.ticker, market: security.market, displayName: metadata.displayName,
          assetType: metadata.assetType, quoteCurrency: metadata.quoteCurrency,
        });
      } catch (error) {
        metadataFailures.add(identityKey(security));
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
        verifySecurity(security); verifyRange(security);
        if (metadataFailures.has(identityKey(security))) throw new Error("Price refresh skipped because market metadata verification failed");
        const points = await withTransientRetry(
          () => requireActive(() =>
            input.provider.fetchSecurityDailyPrices({
              symbol: security.ticker,
              market: security.market,
              quoteCurrency: security.quoteCurrency,
              startDate: security.startDate,
              endDate: security.endDate,
            })),
          retryOptions
        );
        if (shouldCancel()) return canceledResult();
        if (!Array.isArray(points) || points.some((point) => !isValidStandardDate(point.marketDate) || point.marketDate < security.startDate ||
          point.marketDate > security.endDate || typeof point.close !== "number" || !Number.isFinite(point.close) || point.close < 0)) {
          throw new Error("Provider returned an invalid or out-of-range security price batch");
        }
        for (const point of points) verifyPricePolicy(point);
        const stored = await input.repository.insertMissingSecurityDailyPrices(
          {
            ticker: security.ticker,
            market: security.market,
          },
          points
        );
        if (stored?.unavailable || points.some((point) => point.priceBasis !== "raw")) throw new Error("Unverified or split-adjusted prices were retained for review and cannot value dated holdings. Use verified unadjusted prices or explicitly correct the retained records.");
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
          () => requireActive(() =>
            input.provider.fetchFxDailyRates({
              sourceCurrency: pair.sourceCurrency,
              targetCurrency: pair.targetCurrency,
              startDate: pair.startDate,
              endDate: pair.endDate,
            })),
          retryOptions
        );
        if (shouldCancel()) return canceledResult();
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

  if (shouldCancel()) return canceledResult();
  const status = failedItems.length > 0 ? "completed_with_issues" : "completed";
  input.coordinator.finishRun(input.runId, status);

  return {
    status,
    failedItems,
  };
};
