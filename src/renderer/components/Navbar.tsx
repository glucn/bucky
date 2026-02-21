import React from "react";
import { Link } from "react-router-dom";
import { EnrichmentPanel } from "./EnrichmentPanel";

type PanelOpenDetail = {
  scopePreset?: {
    securityMetadata: boolean;
    securityPrices: boolean;
    fxRates: boolean;
  };
};

const Navbar: React.FC = () => {
  const [isEnrichmentPanelOpen, setIsEnrichmentPanelOpen] = React.useState(false);
  const [scopePreset, setScopePreset] = React.useState<PanelOpenDetail["scopePreset"] | null>(null);
  const [backgroundRunId, setBackgroundRunId] = React.useState<string | null>(null);
  const [completedBackgroundSummary, setCompletedBackgroundSummary] = React.useState<any | null>(null);
  const [baseCurrencyBannerDismissed, setBaseCurrencyBannerDismissed] = React.useState(false);
  const [baseCurrencyImpact, setBaseCurrencyImpact] = React.useState<{
    baseCurrency: string | null;
    reconciliation: {
      targetBaseCurrency: string;
      status: "pending" | "resolved";
      changedAt: string;
      resolvedAt?: string;
    } | null;
  } | null>(null);

  // Only show the reset button in development mode
  const isDev = process.env.NODE_ENV === "development";

  const handleResetAllData = async () => {
    if (!window.confirm("Are you sure you want to reset ALL data? This cannot be undone.")) return;
    try {
      const result = await (window as any).electron.ipcRenderer.invoke("reset-all-data");
      if (result && result.success) {
        alert("All data has been reset to the initial state.");
        window.location.reload();
      } else {
        alert("Failed to reset data: " + (result?.error || "Unknown error"));
      }
    } catch (err) {
      alert("Error resetting data: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  React.useEffect(() => {
    const handleOpenPanel = (event: Event) => {
      const customEvent = event as CustomEvent<PanelOpenDetail>;
      setScopePreset(customEvent.detail?.scopePreset || null);
      setIsEnrichmentPanelOpen(true);
    };
    window.addEventListener("open-enrichment-panel", handleOpenPanel);
    return () => window.removeEventListener("open-enrichment-panel", handleOpenPanel);
  }, []);

  React.useEffect(() => {
    let disposed = false;

    const load = async () => {
      const state = await window.electron.getBaseCurrencyImpactState();
      if (!disposed) {
        setBaseCurrencyImpact(state);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 3000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  const shouldShowBaseCurrencyBanner =
    !baseCurrencyBannerDismissed && baseCurrencyImpact?.reconciliation?.status === "pending";
  const shouldShowBaseCurrencySetupPrompt = baseCurrencyImpact?.baseCurrency === null;

  React.useEffect(() => {
    if (!backgroundRunId) {
      return;
    }

    const interval = window.setInterval(async () => {
      const summary = await window.electron.getEnrichmentRunSummary(backgroundRunId);
      if (summary && summary.status !== "running") {
        setCompletedBackgroundSummary(summary);
        setBackgroundRunId(null);
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, [backgroundRunId]);

  return (
    <nav className="bg-white shadow-lg">
      <div className="px-4">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-xl font-bold text-primary-600">Bucky</h1>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link
                to="/"
                className="border-transparent text-gray-500 hover:border-primary-500 hover:text-primary-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                Dashboard
              </Link>
              <Link
                to="/accounts"
                className="border-transparent text-gray-500 hover:border-primary-500 hover:text-primary-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                Accounts
              </Link>
              <Link
                to="/investments"
                className="border-transparent text-gray-500 hover:border-primary-500 hover:text-primary-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                Investments
              </Link>
              <Link
                to="/categories"
                className="border-transparent text-gray-500 hover:border-primary-500 hover:text-primary-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                Categories
              </Link>
              <Link
                to="/settings/auto-categorization"
                className="border-transparent text-gray-500 hover:border-primary-500 hover:text-primary-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                Settings
              </Link>
            </div>
          </div>
            <div className="flex items-center">
              <button
                onClick={() => {
                  setScopePreset(null);
                  setIsEnrichmentPanelOpen(true);
                }}
                className="ml-4 rounded bg-primary-600 px-3 py-1 text-white transition hover:bg-primary-700"
                data-testid="open-enrichment-panel"
              >
                Refresh Data
              </button>
            {isDev && (
              <button
                onClick={handleResetAllData}
                className="ml-4 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition"
                title="Reset all data to initial state (DEV ONLY)"
              >
                Reset All Data
              </button>
            )}
          </div>
        </div>
      </div>
      {shouldShowBaseCurrencySetupPrompt ? (
        <div
          className="border-t border-blue-300 bg-blue-50 px-4 py-2 text-sm text-blue-900"
          data-testid="base-currency-setup-prompt"
        >
          Base currency is not configured yet. Configure it to enable valuation and reporting.
          <Link
            to="/settings/auto-categorization"
            className="ml-3 rounded border border-blue-500 px-2 py-1 text-xs"
            data-testid="configure-base-currency"
          >
            Configure now
          </Link>
        </div>
      ) : null}
      {shouldShowBaseCurrencyBanner ? (
        <div
          className="border-t border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
          data-testid="base-currency-warning-banner"
        >
          <span>
            Base currency changed to {baseCurrencyImpact?.reconciliation?.targetBaseCurrency}. Refresh FX rates to
            reconcile valuations.
          </span>
          <button
            className="ml-3 rounded border border-amber-500 px-2 py-1 text-xs"
            data-testid="base-currency-refresh-fx"
            onClick={() => {
              setScopePreset({
                securityMetadata: false,
                securityPrices: false,
                fxRates: true,
              });
              setIsEnrichmentPanelOpen(true);
            }}
          >
            Refresh FX now
          </button>
          <button
            className="ml-2 text-xs text-amber-800 underline"
            data-testid="base-currency-dismiss"
            onClick={() => setBaseCurrencyBannerDismissed(true)}
          >
            Dismiss for now
          </button>
        </div>
      ) : null}
      <EnrichmentPanel
        isOpen={isEnrichmentPanelOpen}
        onClose={() => setIsEnrichmentPanelOpen(false)}
        scopePreset={scopePreset}
        onContinueInBackground={(runId) => {
          setBackgroundRunId(runId);
          setIsEnrichmentPanelOpen(false);
          void window.electron.sendEnrichmentRunToBackground(runId);
        }}
        externalSummary={completedBackgroundSummary}
      />
      {completedBackgroundSummary ? (
        <div
          className="fixed bottom-4 right-4 z-50 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm shadow"
          data-testid="enrichment-background-toast"
        >
          <div className="font-medium">Refresh completed: {completedBackgroundSummary.status}</div>
          <button
            className="mt-2 text-primary-600 hover:text-primary-700"
            onClick={() => setIsEnrichmentPanelOpen(true)}
            data-testid="enrichment-toast-open-summary"
          >
            View summary
          </button>
          <button
            className="ml-3 text-gray-600 hover:text-gray-800"
            onClick={() => setCompletedBackgroundSummary(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </nav>
  );
};

export default Navbar;
