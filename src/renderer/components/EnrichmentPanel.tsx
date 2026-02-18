import React, { useEffect, useMemo, useState } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onContinueInBackground?: (runId: string) => void;
  externalSummary?: any | null;
};

type Scope = {
  securityMetadata: boolean;
  securityPrices: boolean;
  fxRates: boolean;
};

const defaultScope: Scope = {
  securityMetadata: true,
  securityPrices: true,
  fxRates: true,
};

const formatFreshness = (value: string | null): string => {
  if (!value) {
    return "Never refreshed";
  }

  const timestamp = new Date(value);
  const elapsedMs = Date.now() - timestamp.getTime();
  const days = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

  if (days <= 0) {
    return "Refreshed today";
  }

  if (days === 1) {
    return "Refreshed 1 day ago";
  }

  return `Refreshed ${days} days ago`;
};

export const EnrichmentPanel: React.FC<Props> = ({
  isOpen,
  onClose,
  onContinueInBackground,
  externalSummary,
}) => {
  const [scope, setScope] = useState<Scope>(defaultScope);
  const [panelState, setPanelState] = useState<any>(null);
  const [configState, setConfigState] = useState<{
    providerConfigured: boolean;
    baseCurrencyConfigured: boolean;
  }>({
    providerConfigured: false,
    baseCurrencyConfigured: false,
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const load = async () => {
      const [latestPanelState, latestConfigState] = await Promise.all([
        window.electron.getEnrichmentPanelState(),
        window.electron.getEnrichmentConfigState(),
      ]);

      setPanelState(latestPanelState);
      setConfigState(latestConfigState);
    };

    void load();
  }, [isOpen]);

  const disabledReason = useMemo(() => {
    if (!configState.providerConfigured) {
      return "Refresh is unavailable until provider setup is complete.";
    }

    if (!configState.baseCurrencyConfigured) {
      return "Refresh is unavailable until base currency is configured in Settings.";
    }

    return null;
  }, [configState]);

  if (!isOpen) {
    return null;
  }

  const startRefresh = async () => {
    await window.electron.startEnrichmentRun(scope);
    const latestPanelState = await window.electron.getEnrichmentPanelState();
    setPanelState(latestPanelState);
  };

  const activeRun = panelState?.activeRun;
  const summaryRun = activeRun || externalSummary;
  const freshness = panelState?.freshness || {
    metadata: null,
    prices: null,
    fx: null,
  };

  const copyFailureDetails = async () => {
    if (!summaryRun?.failedItems?.length) {
      return;
    }

    const text = summaryRun.failedItems
      .map((item: any) => `${item.category}: ${item.identifier} - ${item.reason}`)
      .join("\n");

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  };

  const categoryStatus = (category: "securityMetadata" | "securityPrices" | "fxRates") => {
    if (!summaryRun) {
      return "-";
    }

    if (summaryRun.status === "canceled") {
      return "Canceled";
    }

    const hasIssue = (summaryRun.failedItems || []).some((item: any) => item.category === category);
    return hasIssue ? "Issues" : "Done";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="enrichment-panel-overlay">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl" data-testid="enrichment-panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Data Refresh</h2>
          <button className="text-sm text-gray-600 hover:text-gray-800" onClick={onClose}>
            Close
          </button>
        </div>

        {disabledReason ? (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="enrichment-disabled-message">
            {disabledReason}
          </div>
        ) : null}

        <div className="space-y-3" data-testid="enrichment-scope-list">
          <label className="flex items-center justify-between">
            <span>
              <input
                type="checkbox"
                checked={scope.securityMetadata}
                onChange={(event) => setScope((prev) => ({ ...prev, securityMetadata: event.target.checked }))}
                data-testid="scope-security-metadata"
              />{" "}
              Security metadata
            </span>
            <span className="text-sm text-gray-500">{formatFreshness(freshness.metadata)}</span>
          </label>

          <label className="flex items-center justify-between">
            <span>
              <input
                type="checkbox"
                checked={scope.securityPrices}
                onChange={(event) => setScope((prev) => ({ ...prev, securityPrices: event.target.checked }))}
                data-testid="scope-security-prices"
              />{" "}
              Security price history
            </span>
            <span className="text-sm text-gray-500">{formatFreshness(freshness.prices)}</span>
          </label>

          <label className="flex items-center justify-between">
            <span>
              <input
                type="checkbox"
                checked={scope.fxRates}
                onChange={(event) => setScope((prev) => ({ ...prev, fxRates: event.target.checked }))}
                data-testid="scope-fx-rates"
              />{" "}
              FX rates
            </span>
            <span className="text-sm text-gray-500">{formatFreshness(freshness.fx)}</span>
          </label>
        </div>

        {summaryRun ? (
          <div className="mt-5 rounded border border-gray-200 bg-gray-50 p-3 text-sm" data-testid="enrichment-active-run">
            <div>Run status: {summaryRun.status}</div>
            <div>Metadata: {summaryRun.categoryProgress.securityMetadata.processed}/{summaryRun.categoryProgress.securityMetadata.total} ({categoryStatus("securityMetadata")})</div>
            <div>Prices: {summaryRun.categoryProgress.securityPrices.processed}/{summaryRun.categoryProgress.securityPrices.total} ({categoryStatus("securityPrices")})</div>
            <div>FX: {summaryRun.categoryProgress.fxRates.processed}/{summaryRun.categoryProgress.fxRates.total} ({categoryStatus("fxRates")})</div>
            {summaryRun.failedItems?.length ? (
              <div className="mt-3">
                <div className="mb-2 font-medium">Failed items</div>
                <div className="max-h-40 overflow-auto rounded border border-gray-200 bg-white p-2" data-testid="enrichment-failed-items-list">
                  {summaryRun.failedItems.map((item: any, index: number) => (
                    <div key={`${item.identifier}-${index}`} className="text-xs text-gray-700">
                      {item.category}: {item.identifier} - {item.reason}
                    </div>
                  ))}
                </div>
                <button
                  className="mt-2 rounded border border-gray-300 px-2 py-1 text-xs"
                  onClick={() => {
                    void copyFailureDetails();
                  }}
                  data-testid="copy-failure-details"
                >
                  Copy failure details
                </button>
              </div>
            ) : null}
            {summaryRun.status === "running" ? (
              <button
                className="mt-3 rounded border border-gray-300 px-3 py-1 text-xs"
                onClick={() => {
                  if (onContinueInBackground) {
                    onContinueInBackground(summaryRun.id);
                  }
                }}
                data-testid="continue-in-background"
              >
                Continue in background
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
            disabled={Boolean(disabledReason)}
            onClick={startRefresh}
            data-testid="start-enrichment-run"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};
