import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccounts } from "../context/AccountsContext";

interface Portfolio {
  id: string;
  name: string;
  accountType: string;
  displayOrder: number;
}

interface PortfolioValue {
  totalCostBasis: number;
  totalMarketValue: number;
  totalUnrealizedGain: number;
  totalUnrealizedGainPercent: number;
  cashBalance: number;
}

export const InvestmentPortfolios: React.FC = () => {
  const navigate = useNavigate();
  const { refreshAccounts } = useAccounts();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [portfolioValues, setPortfolioValues] = useState<Record<string, PortfolioValue>>({});
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [newPortfolioCurrency, setNewPortfolioCurrency] = useState("USD");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchPortfolios();
  }, []);

  const fetchPortfolios = async () => {
    setLoading(true);
    try {
      const result = await window.electron.ipcRenderer.invoke("get-investment-portfolios");
      if (result.success) {
        setPortfolios(result.portfolios);
        
        // Fetch values for each portfolio
        const values: Record<string, PortfolioValue> = {};
        for (const portfolio of result.portfolios) {
          const valueResult = await window.electron.ipcRenderer.invoke(
            "get-portfolio-value",
            portfolio.id
          );
          if (valueResult.success) {
            values[portfolio.id] = valueResult.value;
          }
        }
        setPortfolioValues(values);
      }
    } catch (error) {
      console.error("Error fetching portfolios:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePortfolio = async () => {
    if (!newPortfolioName.trim()) {
      alert("Please enter a portfolio name");
      return;
    }

    setCreating(true);
    try {
      const result = await window.electron.ipcRenderer.invoke(
        "create-investment-portfolio",
        { name: newPortfolioName, currency: newPortfolioCurrency }
      );
      
      if (result.success) {
        setShowCreateModal(false);
        setNewPortfolioName("");
        setNewPortfolioCurrency("USD");
        await fetchPortfolios();
        // Refresh accounts context so sidebar and other components update
        await refreshAccounts();
      } else {
        alert(`Failed to create portfolio: ${result.error}`);
      }
    } catch (error) {
      console.error("Error creating portfolio:", error);
      alert("Failed to create portfolio");
    } finally {
      setCreating(false);
    }
  };

  const handleViewPortfolio = (portfolioId: string) => {
    navigate(`/investments/${portfolioId}`);
  };

  const formatCurrency = (amount: number): string => {
    // Fix floating-point precision issues: treat very small numbers as zero
    // This prevents "-0.00" display for balances like -6.7302587114515e-13
    const threshold = 0.0001; // 0.01^2 for 2 decimal places
    const normalizedAmount = Math.abs(amount) < threshold ? 0 : amount;
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(normalizedAmount);
  };

  const formatPercent = (percent: number): string => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading portfolios...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Investment Portfolios</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Create Portfolio
          </button>
        </div>

        {portfolios.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No investment portfolios yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Create Your First Portfolio
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {portfolios.map((portfolio) => {
              const value = portfolioValues[portfolio.id];
              const totalValue = value ? value.totalMarketValue + value.cashBalance : 0;
              const unrealizedGain = value?.totalUnrealizedGain || 0;
              const unrealizedGainPercent = value?.totalUnrealizedGainPercent || 0;

              return (
                <div
                  key={portfolio.id}
                  className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => handleViewPortfolio(portfolio.id)}
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {portfolio.name}
                  </h3>
                  
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-500">Total Value</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {formatCurrency(totalValue)}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-gray-500">Unrealized Gain/Loss</p>
                      <p className={`text-lg font-semibold ${
                        unrealizedGain >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(unrealizedGain)} ({formatPercent(unrealizedGainPercent)})
                      </p>
                    </div>
                    
                    {value && (
                      <div className="pt-3 border-t border-gray-200">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Cash:</span>
                          <span className="font-medium">{formatCurrency(value.cashBalance)}</span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-gray-500">Securities:</span>
                          <span className="font-medium">{formatCurrency(value.totalMarketValue)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Portfolio Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Create Investment Portfolio
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Portfolio Name
              </label>
              <input
                type="text"
                value={newPortfolioName}
                onChange={(e) => setNewPortfolioName(e.target.value)}
                placeholder="e.g., Fidelity 401(k), Vanguard Brokerage"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Trade Cash Currency
              </label>
              <select
                value={newPortfolioCurrency}
                onChange={(e) => setNewPortfolioCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="JPY">JPY - Japanese Yen</option>
                <option value="CAD">CAD - Canadian Dollar</option>
                <option value="AUD">AUD - Australian Dollar</option>
                <option value="CHF">CHF - Swiss Franc</option>
                <option value="CNY">CNY - Chinese Yuan</option>
                <option value="INR">INR - Indian Rupee</option>
                <option value="KRW">KRW - South Korean Won</option>
                <option value="BRL">BRL - Brazilian Real</option>
                <option value="MXN">MXN - Mexican Peso</option>
                <option value="SEK">SEK - Swedish Krona</option>
                <option value="NOK">NOK - Norwegian Krone</option>
                <option value="DKK">DKK - Danish Krone</option>
                <option value="PLN">PLN - Polish Zloty</option>
                <option value="TRY">TRY - Turkish Lira</option>
                <option value="THB">THB - Thai Baht</option>
                <option value="ZAR">ZAR - South African Rand</option>
                <option value="RUB">RUB - Russian Ruble</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                This will be the currency for the initial trade cash account. You can add additional trade cash accounts in different currencies later.
              </p>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewPortfolioName("");
                  setNewPortfolioCurrency("USD");
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePortfolio}
                className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                disabled={creating}
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
