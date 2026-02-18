export type EnrichmentProviderId = "yahoo" | "twelvedata";

export type EnrichmentProviderCapabilities = {
  supportsSecurityMetadata: boolean;
  supportsSecurityDailyPrices: boolean;
  supportsFxDailyRates: boolean;
  supportsBatchRequests: boolean;
};

export type SecuritySearchCandidate = {
  symbol: string;
  market: string;
  displayName: string | null;
  quoteCurrency: string | null;
};

export type SecurityMetadataSnapshot = {
  symbol: string;
  market: string;
  displayName: string | null;
  assetType: string | null;
  quoteCurrency: string | null;
};

export type SecurityDailyPricePoint = {
  marketDate: string;
  close: number;
};

export type FxDailyRatePoint = {
  marketDate: string;
  rate: number;
};

export interface EnrichmentProviderAdapter {
  id: EnrichmentProviderId;
  capabilities: EnrichmentProviderCapabilities;
  searchSecuritiesByTicker(ticker: string): Promise<SecuritySearchCandidate[]>;
  fetchSecurityMetadata(input: {
    symbol: string;
    market: string;
  }): Promise<SecurityMetadataSnapshot | null>;
  fetchSecurityDailyPrices(input: {
    symbol: string;
    market: string;
    startDate: string;
    endDate: string;
  }): Promise<SecurityDailyPricePoint[]>;
  fetchFxDailyRates(input: {
    sourceCurrency: string;
    targetCurrency: string;
    startDate: string;
    endDate: string;
  }): Promise<FxDailyRatePoint[]>;
}

type ResolveErrorCode =
  | "provider_not_configured"
  | "provider_not_supported"
  | "provider_config_invalid";

type ResolveOk = {
  ok: true;
  provider: EnrichmentProviderAdapter;
};

type ResolveError = {
  ok: false;
  errorCode: ResolveErrorCode;
  message: string;
};

export type ResolveEnrichmentProviderResult = ResolveOk | ResolveError;

type ResolveInput = {
  env: Partial<Record<string, string | undefined>>;
  adapters: Partial<Record<EnrichmentProviderId, EnrichmentProviderAdapter>>;
};

const SUPPORTED_PROVIDER_IDS = new Set<EnrichmentProviderId>(["yahoo", "twelvedata"]);

export const resolveEnrichmentProvider = (
  input: ResolveInput
): ResolveEnrichmentProviderResult => {
  const configuredProviderId = input.env.ENRICHMENT_PROVIDER;

  if (!configuredProviderId) {
    return {
      ok: false,
      errorCode: "provider_not_configured",
      message: "Provider is not configured",
    };
  }

  if (!SUPPORTED_PROVIDER_IDS.has(configuredProviderId as EnrichmentProviderId)) {
    return {
      ok: false,
      errorCode: "provider_not_supported",
      message: `Provider '${configuredProviderId}' is not supported`,
    };
  }

  const providerId = configuredProviderId as EnrichmentProviderId;
  if (providerId === "twelvedata" && !input.env.TWELVEDATA_API_KEY) {
    return {
      ok: false,
      errorCode: "provider_config_invalid",
      message: "Provider configuration is invalid",
    };
  }

  const adapter = input.adapters[providerId];
  if (!adapter) {
    return {
      ok: false,
      errorCode: "provider_not_supported",
      message: `Provider '${providerId}' has no registered adapter`,
    };
  }

  return {
    ok: true,
    provider: adapter,
  };
};
