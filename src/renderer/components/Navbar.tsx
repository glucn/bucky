import React from "react";
import { Link } from "react-router-dom";

const Navbar: React.FC = () => {
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
            </div>
          </div>
          {isDev && (
            <div className="flex items-center">
              <button
                onClick={handleResetAllData}
                className="ml-4 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition"
                title="Reset all data to initial state (DEV ONLY)"
              >
                Reset All Data
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;