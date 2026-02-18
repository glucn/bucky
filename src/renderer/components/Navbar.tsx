import React from "react";
import { Link } from "react-router-dom";
import { EnrichmentPanel } from "./EnrichmentPanel";

const Navbar: React.FC = () => {
  const [isEnrichmentPanelOpen, setIsEnrichmentPanelOpen] = React.useState(false);
  const [backgroundRunId, setBackgroundRunId] = React.useState<string | null>(null);
  const [completedBackgroundSummary, setCompletedBackgroundSummary] = React.useState<any | null>(null);

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
    const handleOpenPanel = () => setIsEnrichmentPanelOpen(true);
    window.addEventListener("open-enrichment-panel", handleOpenPanel);
    return () => window.removeEventListener("open-enrichment-panel", handleOpenPanel);
  }, []);

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
                onClick={() => setIsEnrichmentPanelOpen(true)}
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
      <EnrichmentPanel
        isOpen={isEnrichmentPanelOpen}
        onClose={() => setIsEnrichmentPanelOpen(false)}
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
