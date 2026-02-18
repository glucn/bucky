import React, { useEffect, useMemo, useState } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
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

export const EnrichmentPanel: React.FC<Props> = ({ isOpen, onClose }) => {
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
  const freshness = panelState?.freshness || {
    metadata: null,
    prices: null,
    fx: null,
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

        {activeRun ? (
          <div className="mt-5 rounded border border-gray-200 bg-gray-50 p-3 text-sm" data-testid="enrichment-active-run">
            <div>Run status: {activeRun.status}</div>
            <div>Metadata: {activeRun.categoryProgress.securityMetadata.processed}/{activeRun.categoryProgress.securityMetadata.total}</div>
            <div>Prices: {activeRun.categoryProgress.securityPrices.processed}/{activeRun.categoryProgress.securityPrices.total}</div>
            <div>FX: {activeRun.categoryProgress.fxRates.processed}/{activeRun.categoryProgress.fxRates.total}</div>
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
