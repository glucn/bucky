import { describe, expect, it, vi } from "vitest";
import {
  type EnrichmentProviderAdapter,
  resolveEnrichmentProvider,
} from "./enrichmentProviderRegistry";

const createAdapter = (id: "yahoo" | "twelvedata"): EnrichmentProviderAdapter => ({
  id,
  capabilities: {
    supportsSecurityMetadata: true,
    supportsSecurityDailyPrices: true,
    supportsFxDailyRates: true,
    supportsBatchRequests: false,
  },
  searchSecuritiesByTicker: vi.fn(),
  fetchSecurityMetadata: vi.fn(),
  fetchSecurityDailyPrices: vi.fn(),
  fetchFxDailyRates: vi.fn(),
});

describe("resolveEnrichmentProvider", () => {
  it("returns controlled error when provider env var is missing", () => {
    const result = resolveEnrichmentProvider({
      env: {},
      adapters: {
        yahoo: createAdapter("yahoo"),
        twelvedata: createAdapter("twelvedata"),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_not_configured");
  });

  it("returns controlled error when provider is unsupported", () => {
    const result = resolveEnrichmentProvider({
      env: { ENRICHMENT_PROVIDER: "unknown" },
      adapters: {
        yahoo: createAdapter("yahoo"),
        twelvedata: createAdapter("twelvedata"),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_not_supported");
  });

  it("returns controlled error when twelvedata key is missing", () => {
    const result = resolveEnrichmentProvider({
      env: { ENRICHMENT_PROVIDER: "twelvedata" },
      adapters: {
        yahoo: createAdapter("yahoo"),
        twelvedata: createAdapter("twelvedata"),
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_config_invalid");
  });

  it("resolves yahoo without API key", () => {
    const yahoo = createAdapter("yahoo");
    const result = resolveEnrichmentProvider({
      env: { ENRICHMENT_PROVIDER: "yahoo" },
      adapters: {
        yahoo,
        twelvedata: createAdapter("twelvedata"),
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider.id).toBe("yahoo");
    expect(result.provider).toBe(yahoo);
  });

  it("resolves twelvedata when API key exists", () => {
    const twelvedata = createAdapter("twelvedata");
    const result = resolveEnrichmentProvider({
      env: {
        ENRICHMENT_PROVIDER: "twelvedata",
        TWELVEDATA_API_KEY: "test-key",
      },
      adapters: {
        yahoo: createAdapter("yahoo"),
        twelvedata,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provider).toBe(twelvedata);
  });
});
