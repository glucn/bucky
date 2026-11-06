import { securityRefreshTargets, type RefreshHolding } from "./securityRefreshTargets";
import { appSettingsService } from "./appSettingsService";
import { databaseService } from "./database";
import { executeEnrichmentPipeline } from "./enrichmentPipelineExecutor";
import {
  createEnrichmentRunCoordinator,
  type EnrichmentRunScope,
} from "./enrichmentRunCoordinator";
import {
  type ResolveEnrichmentProviderResult,
  resolveEnrichmentProvider,
} from "./enrichmentProviderRegistry";
import { deriveIncrementalStartDate } from "./enrichmentRange";
import { enrichmentRepository } from "./enrichmentRepository";
import { deriveRequiredFxPairs } from "./fxDerivation";
import { createTwelveDataEnrichmentProvider } from "./providers/twelveDataEnrichmentProvider";
import { yahooEnrichmentProvider } from "./providers/yahooEnrichmentProvider";

type RuntimeDependencies = {
  coordinator: ReturnType<typeof createEnrichmentRunCoordinator>;
  repository: typeof enrichmentRepository;
  getBaseCurrency: () => Promise<string | null>;
  getBaseCurrencyReconciliationState: () => Promise<{
    targetBaseCurrency: string;
    status: "pending" | "resolved";
    changedAt: string;
    resolvedAt?: string;
  } | null>;
  setBaseCurrencyReconciliationState: (state: {
    targetBaseCurrency: string;
    status: "pending" | "resolved";
    changedAt: string;
    resolvedAt?: string;
  }) => Promise<void>;
  prismaClient: {
    account: {
      findMany: (args: unknown) => Promise<Array<{ currency: string }>>;
    };
    investmentProperties: {
      findMany: (args: unknown) => Promise<RefreshHolding[]>;
    };
    securityMetadata: {
      findMany: (args: unknown) => Promise<Array<{ ticker: string; market: string; quoteCurrency: string | null }>>;
    };
    journalEntry: {
      aggregate: (args: unknown) => Promise<{ _min: { date: string | null } }>;
    };
  };
  executePipeline: typeof executeEnrichmentPipeline;
  env: Partial<Record<string, string | undefined>>;
  resolveProvider: () => ResolveEnrichmentProviderResult;
};

const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10);

const createProviderMap = (env: Partial<Record<string, string | undefined>>) => {
  const adapters: {
    yahoo?: typeof yahooEnrichmentProvider;
    twelvedata?: ReturnType<typeof createTwelveDataEnrichmentProvider>;
  } = {};

  if (env.ENRICHMENT_PROVIDER === "yahoo") {
    adapters.yahoo = yahooEnrichmentProvider;
  }

  if (env.ENRICHMENT_PROVIDER === "twelvedata" && env.TWELVEDATA_API_KEY) {
    adapters.twelvedata = createTwelveDataEnrichmentProvider(env.TWELVEDATA_API_KEY);
  }

  return adapters;
};

export class EnrichmentRuntimeService {
  private latestSummary: any | null = null;

  private canceledRunIds = new Set<string>();
  private suspended = false;
  private tasks = new Map<string, Promise<void>>();

  constructor(private readonly deps: RuntimeDependencies) {}

  startRun(scope: EnrichmentRunScope) {
    if (this.suspended) throw new Error("Enrichment is locked");
    const result = this.deps.coordinator.startOrGetExistingRun(scope);
    if (result.createdNewRun) {
      const id = result.run.id;
      const task = this.executeRun(id, scope).catch(() => {
        this.deps.coordinator.finishRun(id, this.suspended || this.canceledRunIds.has(id) ? "canceled" : "completed_with_issues");
      }).finally(() => { this.tasks.delete(id); this.canceledRunIds.delete(id); });
      this.tasks.set(id, task);
    }
    return result;
  }

  private async executeRun(runId: string, scope: EnrichmentRunScope): Promise<void> {
    const canceled = () => this.suspended || this.canceledRunIds.has(runId);
    const providerResolution = this.deps.resolveProvider();

    if (!providerResolution.ok) {
      this.deps.coordinator.addFailedItem(runId, {
        category: "securityMetadata",
        identifier: "provider",
        reason: providerResolution.message,
      });
      this.deps.coordinator.finishRun(runId, "completed_with_issues");
      this.latestSummary = this.deps.coordinator.getRunSummary(runId);
      return;
    }

    const baseCurrency = await this.deps.getBaseCurrency();
    if (canceled()) return;
    if (!baseCurrency) {
      this.deps.coordinator.addFailedItem(runId, {
        category: "fxRates",
        identifier: "baseCurrency",
        reason: "Base currency is not configured",
      });
      this.deps.coordinator.finishRun(runId, "completed_with_issues");
      this.latestSummary = this.deps.coordinator.getRunSummary(runId);
      return;
    }

    const [accounts, investmentProperties, securityMetadataRows, txBounds] = await Promise.all([
      this.deps.prismaClient.account.findMany({ select: { currency: true } }),
      this.deps.prismaClient.investmentProperties.findMany({
        select: { tickerSymbol: true, market: true, account: { select: { currency: true } } },
      }),
      this.deps.prismaClient.securityMetadata.findMany({
        select: { ticker: true, market: true, quoteCurrency: true },
      }),
      this.deps.prismaClient.journalEntry.aggregate({ _min: { date: true } }),
    ]);
    if (canceled()) return;

    const today = toIsoDate(new Date());
    const earliestRelevantTransactionDate = txBounds._min.date || today;

    const securities = await securityRefreshTargets(investmentProperties, securityMetadataRows,
      (ticker) => scope.securityMetadata || scope.securityPrices
        ? providerResolution.provider.searchSecuritiesByTicker(ticker) : Promise.resolve([]), canceled);

    if (canceled()) return;
    const securityRanges = await Promise.all(
      securities.map(async (security) => ({
        ticker: security.ticker,
        market: security.market,
        quoteCurrency: security.quoteCurrency,
        ...(security.validationError ? { validationError: security.validationError } : {}),
        startDate: deriveIncrementalStartDate({
          earliestRelevantTransactionDate,
          lastSuccessfulRefreshDate: await this.deps.repository.getLatestSecurityPriceDate({
            ticker: security.ticker,
            market: security.market,
          }),
        }),
        endDate: today,
      }))
    );

    if (canceled()) return;
    const sourceCurrencies = new Set<string>(accounts.map((account) => account.currency));
    for (const security of securities) {
      if (security.quoteCurrency) {
        sourceCurrencies.add(security.quoteCurrency);
      }
    }

    const fxPairs = deriveRequiredFxPairs({
      sourceCurrencies: Array.from(sourceCurrencies),
      baseCurrency,
    });

    const fxRanges = await Promise.all(
      fxPairs.map(async (pair) => ({
        sourceCurrency: pair.sourceCurrency,
        targetCurrency: pair.targetCurrency,
        startDate: deriveIncrementalStartDate({
          earliestRelevantTransactionDate,
          lastSuccessfulRefreshDate: await this.deps.repository.getLatestFxRateDate({
            sourceCurrency: pair.sourceCurrency,
            targetCurrency: pair.targetCurrency,
          }),
        }),
        endDate: today,
      }))
    );

    if (canceled()) return;
    let pipelineResult:
      | {
          status: string;
          failedItems: Array<{
            category: "securityMetadata" | "securityPrices" | "fxRates";
            identifier: string;
            reason: string;
          }>;
        }
      | null = null;

    try {
      pipelineResult = await this.deps.executePipeline({
        runId,
        provider: providerResolution.provider,
        repository: this.deps.repository,
        coordinator: this.deps.coordinator,
        scope,
        securities: securityRanges,
        fxPairs: fxRanges,
        cancellation: {
          isCanceled: canceled,
        },
      });
    } finally {
      this.canceledRunIds.delete(runId);
      this.latestSummary = this.deps.coordinator.getRunSummary(runId);
    }

    if (canceled() || !scope.fxRates || !pipelineResult || pipelineResult.status === "canceled") {
      return;
    }

    const hasFxFailures = pipelineResult.failedItems.some((item) => item.category === "fxRates");
    if (hasFxFailures) {
      return;
    }

    const reconciliation = await this.deps.getBaseCurrencyReconciliationState();
    if (canceled()) return;
    if (
      !reconciliation ||
      reconciliation.status !== "pending" ||
      reconciliation.targetBaseCurrency !== baseCurrency
    ) {
      return;
    }

    await this.deps.setBaseCurrencyReconciliationState({
      ...reconciliation,
      status: "resolved",
      resolvedAt: new Date().toISOString(),
    });
  }

  async getPanelState() {
    const freshness = await this.deps.repository.getCategoryFreshness();

    return {
      activeRun: this.deps.coordinator.getActiveRun(),
      latestSummary: this.latestSummary,
      freshness,
    };
  }

  async suspendForLock(): Promise<void> {
    this.suspended = true;
    for (const id of this.tasks.keys()) this.canceledRunIds.add(id);
    await Promise.allSettled(this.tasks.values());
    this.latestSummary = null;
    this.canceledRunIds.clear();
    this.deps.coordinator.clear();
  }

  resumeAfterUnlock(): void {
    if (this.tasks.size) throw new Error("Enrichment is still locking");
    this.suspended = false;
  }

  cancelRun(runId: string) {
    this.canceledRunIds.add(runId);
    this.deps.coordinator.finishRun(runId, "canceled");
    this.latestSummary = this.deps.coordinator.getRunSummary(runId);
    return { success: true };
  }

  sendToBackground(runId: string) {
    const run = this.deps.coordinator.getRunSummary(runId);
    return {
      success: Boolean(run),
    };
  }

  getRunSummary(runId: string) {
    return this.deps.coordinator.getRunSummary(runId);
  }

  seedCompletedWithIssuesRunForTest() {
    const { run } = this.deps.coordinator.startOrGetExistingRun({
      securityMetadata: true,
      securityPrices: true,
      fxRates: true,
    });

    this.deps.coordinator.updateCategoryProgress(run.id, "securityMetadata", { total: 1, processed: 1 });
    this.deps.coordinator.updateCategoryProgress(run.id, "securityPrices", { total: 1, processed: 1 });
    this.deps.coordinator.updateCategoryProgress(run.id, "fxRates", { total: 1, processed: 1 });
    this.deps.coordinator.addFailedItem(run.id, {
      category: "fxRates",
      identifier: "CAD/USD",
      reason: "Unable to fetch data from provider",
    });
    this.deps.coordinator.finishRun(run.id, "completed_with_issues");
    this.latestSummary = this.deps.coordinator.getRunSummary(run.id);

    return { runId: run.id };
  }
}

export const createEnrichmentRuntimeService = (deps: Partial<RuntimeDependencies> = {}) =>
  new EnrichmentRuntimeService({
    coordinator: deps.coordinator || createEnrichmentRunCoordinator(),
    repository: deps.repository || enrichmentRepository,
    getBaseCurrency: deps.getBaseCurrency || (() => appSettingsService.getBaseCurrency()),
    getBaseCurrencyReconciliationState:
      deps.getBaseCurrencyReconciliationState ||
      (() => appSettingsService.getBaseCurrencyReconciliationState()),
    setBaseCurrencyReconciliationState:
      deps.setBaseCurrencyReconciliationState ||
      ((state) => appSettingsService.setBaseCurrencyReconciliationState(state)),
    prismaClient:
      deps.prismaClient ||
      (databaseService.prismaClient as unknown as RuntimeDependencies["prismaClient"]),
    executePipeline: deps.executePipeline || executeEnrichmentPipeline,
    env: deps.env || process.env,
    resolveProvider:
      deps.resolveProvider ||
      (() =>
        resolveEnrichmentProvider({
          env: deps.env || process.env,
          adapters: createProviderMap(deps.env || process.env),
        })),
  });

export const enrichmentRuntimeService = createEnrichmentRuntimeService();
