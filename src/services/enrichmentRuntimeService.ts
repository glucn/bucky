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
  prismaClient: {
    account: {
      findMany: (args: unknown) => Promise<Array<{ currency: string }>>;
    };
    investmentProperties: {
      findMany: (args: unknown) => Promise<Array<{ tickerSymbol: string }>>;
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

  constructor(private readonly deps: RuntimeDependencies) {}

  startRun(scope: EnrichmentRunScope) {
    const result = this.deps.coordinator.startOrGetExistingRun(scope);
    if (result.createdNewRun) {
      void this.executeRun(result.run.id, scope);
    }
    return result;
  }

  private async executeRun(runId: string, scope: EnrichmentRunScope): Promise<void> {
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
        select: { tickerSymbol: true },
      }),
      this.deps.prismaClient.securityMetadata.findMany({
        select: { ticker: true, market: true, quoteCurrency: true },
      }),
      this.deps.prismaClient.journalEntry.aggregate({ _min: { date: true } }),
    ]);

    const today = toIsoDate(new Date());
    const earliestRelevantTransactionDate = txBounds._min.date || today;

    const metadataByTicker = new Map<string, { market: string; quoteCurrency: string | null }>();
    for (const row of securityMetadataRows) {
      if (!metadataByTicker.has(row.ticker)) {
        metadataByTicker.set(row.ticker, {
          market: row.market,
          quoteCurrency: row.quoteCurrency,
        });
      }
    }

    const baseSecurities = Array.from(
      new Set(
        investmentProperties
          .map((item) => item.tickerSymbol?.trim())
          .filter((ticker): ticker is string => Boolean(ticker))
      )
    ).map((ticker) => {
      const metadata = metadataByTicker.get(ticker);
      return {
        ticker,
        market: metadata?.market || "UNKNOWN",
        quoteCurrency: metadata?.quoteCurrency || null,
      };
    });

    const securities = await Promise.all(
      baseSecurities.map(async (security) => {
        if (security.market !== "UNKNOWN") {
          return security;
        }

        try {
          const candidates = await providerResolution.provider.searchSecuritiesByTicker(
            security.ticker
          );
          const exactMatches = candidates.filter(
            (candidate) => candidate.symbol.toUpperCase() === security.ticker.toUpperCase()
          );
          const resolved = exactMatches[0] || candidates[0];

          if (!resolved) {
            return security;
          }

          return {
            ticker: security.ticker,
            market: resolved.market || security.market,
            quoteCurrency: security.quoteCurrency || resolved.quoteCurrency || null,
          };
        } catch {
          return security;
        }
      })
    );

    const securityRanges = await Promise.all(
      securities.map(async (security) => ({
        ticker: security.ticker,
        market: security.market,
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

    try {
      await this.deps.executePipeline({
        runId,
        provider: providerResolution.provider,
        repository: this.deps.repository,
        coordinator: this.deps.coordinator,
        scope,
        securities: securityRanges,
        fxPairs: fxRanges,
        cancellation: {
          isCanceled: () => this.canceledRunIds.has(runId),
        },
      });
    } finally {
      this.canceledRunIds.delete(runId);
      this.latestSummary = this.deps.coordinator.getRunSummary(runId);
    }
  }

  async getPanelState() {
    const freshness = await this.deps.repository.getCategoryFreshness();

    return {
      activeRun: this.deps.coordinator.getActiveRun(),
      latestSummary: this.latestSummary,
      freshness,
    };
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
