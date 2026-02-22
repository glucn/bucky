import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TransactionEntryModal } from "../components/TransactionEntryModal";
import { useAccounts } from "../context/AccountsContext";
import { formatMultiCurrencyBalances } from "../utils/currencyUtils";
import { formatValuationAmount } from "../utils/valuationFormatting";
import { SUPPORTED_CURRENCY_OPTIONS } from "../../shared/currencies";

interface Position {
  tickerSymbol: string;
  currency: string;
  quantity: number;
  costBasis: number;
  costBasisBase: number | null;
  costPerShare: number;
  marketPrice: number | null;
  marketValue: number | null;
  marketValueBase: number | null;
  unrealizedGain: number | null;
  unrealizedGainPercent: number | null;
}

interface PortfolioValue {
  totalCostBasis: number | null;
  totalMarketValue: number | null;
  totalUnrealizedGain: number | null;
  totalUnrealizedGainPercent: number | null;
  cashBalance: number | null;
  cashBalancesByCurrency: Record<string, number>;
  securityMarketValueByCurrency: Record<string, number>;
}

type TransactionType = 'buy' | 'sell' | 'dividend' | 'dividend_reinvest' | 'interest' | 'fee' | 'cash_deposit' | 'cash_withdrawal';

export const PortfolioDetailsPage: React.FC = () => {
  const { portfolioId } = useParams<{ portfolioId: string }>();
  const navigate = useNavigate();
  const { refreshAccounts } = useAccounts();
  const [portfolio, setPortfolio] = useState<any>(null);
  const [portfolioValue, setPortfolioValue] = useState<PortfolioValue | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [realizedGains, setRealizedGains] = useState<number>(0);
  const [dividendIncome, setDividendIncome] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [selectedTransactionType, setSelectedTransactionType] = useState<TransactionType>('buy');
  const [showAddCashModal, setShowAddCashModal] = useState(false);
  const [newCashCurrency, setNewCashCurrency] = useState("USD");
  const [baseCurrencyAtModalOpen, setBaseCurrencyAtModalOpen] = useState("USD");
  const [addingCash, setAddingCash] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState("USD");

  const openAddTradeCashModal = async () => {
    const impactState = await window.electron.getBaseCurrencyImpactState();
    const baseCurrency = impactState.baseCurrency || "USD";
    setBaseCurrencyAtModalOpen(baseCurrency);
    setNewCashCurrency(baseCurrency);
    setShowAddCashModal(true);
  };

  useEffect(() => {
    if (portfolioId) {
      fetchPortfolioData();
    }
    void window.electron.getBaseCurrencyImpactState().then((state) => {
      setBaseCurrency(state.baseCurrency || "USD");
    });
  }, [portfolioId]);

  const fetchPortfolioData = async () => {
    if (!portfolioId) return;

    setLoading(true);
    try {
      // Fetch portfolio details
      const groupsResult = await window.electron.ipcRenderer.invoke("get-account-groups", "user");
      if (groupsResult.success) {
        const foundPortfolio = groupsResult.groups.find((g: any) => g.id === portfolioId);
        setPortfolio(foundPortfolio);
      }

      // Fetch portfolio value
      const valueResult = await window.electron.ipcRenderer.invoke("get-portfolio-value", portfolioId);
      if (valueResult.success) {
        setPortfolioValue(valueResult.value);
      }

      // Fetch all positions
      const positionsResult = await window.electron.ipcRenderer.invoke(
        "get-all-positions",
        { portfolioId }
      );
      if (positionsResult.success) {
        setPositions(positionsResult.positions);
      }

      // Fetch realized gains (all-time)
      const startDate = '1970-01-01'; // Beginning of time
      const endDate = new Date().toISOString().split('T')[0];
      const gainsResult = await window.electron.ipcRenderer.invoke(
        "get-realized-gains",
        { portfolioId, startDate, endDate }
      );
      if (gainsResult.success && gainsResult.gains) {
        const totalGains = gainsResult.gains.reduce((sum: number, g: any) => sum + g.realizedGain, 0);
        setRealizedGains(totalGains);
      }

      // Fetch dividend income (all-time)
      const dividendResult = await window.electron.ipcRenderer.invoke(
        "get-dividend-income",
        { portfolioId, startDate, endDate }
      );
      if (dividendResult.success && dividendResult.income) {
        setDividendIncome(dividendResult.income.total);
      }
    } catch (error) {
      console.error("Error fetching portfolio data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTransactionCreated = async () => {
    await fetchPortfolioData();
    // Refresh accounts context so sidebar and other components update
    await refreshAccounts();
  };

  const handleAddTradeCashAccount = async () => {
    if (!portfolioId) return;

    setAddingCash(true);
    try {
      const result = await window.electron.ipcRenderer.invoke(
        "add-trade-cash-account",
        { portfolioId, currency: newCashCurrency }
      );
      
      if (result.success) {
        setShowAddCashModal(false);
        setNewCashCurrency(baseCurrencyAtModalOpen);
        await fetchPortfolioData();
        await refreshAccounts();
      } else {
        alert(`Failed to add trade cash account: ${result.error}`);
      }
    } catch (error) {
      console.error("Error adding trade cash account:", error);
      alert("Failed to add trade cash account");
    } finally {
      setAddingCash(false);
    }
  };

  const formatPercent = (percent: number): string => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  const formatSummaryValue = (amount: number | null): string => {
    if (amount === null) {
      return "N/A";
    }
    return formatValuationAmount(amount, baseCurrency);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading portfolio...</div>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Portfolio not found</div>
      </div>
    );
  }

  const totalValue = portfolioValue
    ? portfolioValue.totalMarketValue === null || portfolioValue.cashBalance === null
      ? null
      : portfolioValue.totalMarketValue + portfolioValue.cashBalance
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <button
              onClick={() => navigate("/investments")}
              className="text-sm text-gray-500 hover:text-gray-700 mb-2"
            >
              ← Back to Portfolios
            </button>
            <h2 className="text-2xl font-bold text-gray-900">{portfolio.name}</h2>
          </div>
          <button
            onClick={() => setShowTransactionModal(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700"
          >
            New Transaction
          </button>
        </div>

        {/* Portfolio Summary */}
        {portfolioValue && (
          <div className="space-y-4 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500">Total Value</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatSummaryValue(totalValue)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Cash Balance</p>
                <div className="text-xl font-semibold text-gray-900">
                  {portfolioValue.cashBalancesByCurrency && Object.keys(portfolioValue.cashBalancesByCurrency).length > 1 ? (
                    <div>
                      <div>{formatSummaryValue(portfolioValue.cashBalance)}</div>
                      <div className="text-sm text-gray-600 font-normal">
                        {formatMultiCurrencyBalances(portfolioValue.cashBalancesByCurrency)}
                      </div>
                    </div>
                  ) : (
                    formatSummaryValue(portfolioValue.cashBalance)
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500">Securities Value</p>
                <div className="text-xl font-semibold text-gray-900">
                  <div>{formatSummaryValue(portfolioValue.totalMarketValue)}</div>
                  {portfolioValue.securityMarketValueByCurrency &&
                  Object.keys(portfolioValue.securityMarketValueByCurrency).length > 0 ? (
                    <div className="text-sm text-gray-600 font-normal">
                      {formatMultiCurrencyBalances(portfolioValue.securityMarketValueByCurrency)}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-gray-500">Unrealized Gain/Loss</p>
                  <p className={`text-xl font-semibold ${
                    (portfolioValue.totalUnrealizedGain ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatSummaryValue(portfolioValue.totalUnrealizedGain)}
                  </p>
                  <p className={`text-sm ${
                    (portfolioValue.totalUnrealizedGain ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {portfolioValue.totalUnrealizedGainPercent === null
                      ? 'N/A'
                      : formatPercent(portfolioValue.totalUnrealizedGainPercent)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Realized Gain/Loss</p>
                  <p className={`text-xl font-semibold ${
                    realizedGains >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatValuationAmount(realizedGains, baseCurrency)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Dividend Income</p>
                  <p className="text-xl font-semibold text-green-600">
                    {formatValuationAmount(dividendIncome, baseCurrency)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Positions List */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Positions</h3>
        
        {positions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No positions yet. Start by buying securities.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Symbol
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value (Base)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value (Native)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gain/Loss (Native)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Return %
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {positions.map((position) => (
                  <tr
                    key={position.tickerSymbol}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/investments/${portfolioId}/position/${encodeURIComponent(position.tickerSymbol)}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {position.tickerSymbol}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {position.quantity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {position.marketValueBase !== null
                        ? formatValuationAmount(position.marketValueBase, baseCurrency, { disambiguate: true })
                        : position.costBasisBase !== null
                          ? formatValuationAmount(position.costBasisBase, baseCurrency, { disambiguate: true })
                          : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {position.marketValue !== null
                        ? formatValuationAmount(position.marketValue, position.currency, { disambiguate: true })
                        : formatValuationAmount(position.costBasis, position.currency, { disambiguate: true })}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${
                      (position.unrealizedGain || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {position.unrealizedGain !== null
                        ? formatValuationAmount(position.unrealizedGain, baseCurrency, { disambiguate: true })
                        : '-'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${
                      (position.unrealizedGainPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {position.unrealizedGainPercent !== null
                        ? formatPercent(position.unrealizedGainPercent)
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <button
            onClick={() => {
              setSelectedTransactionType('buy');
              setShowTransactionModal(true);
            }}
            className="px-4 py-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Buy Security
          </button>
          <button
            onClick={() => {
              setSelectedTransactionType('sell');
              setShowTransactionModal(true);
            }}
            className="px-4 py-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sell Security
          </button>
          <button
            onClick={() => {
              setSelectedTransactionType('dividend');
              setShowTransactionModal(true);
            }}
            className="px-4 py-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Record Dividend
          </button>
          <button
            onClick={() => {
              setSelectedTransactionType('cash_deposit');
              setShowTransactionModal(true);
            }}
            className="px-4 py-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Deposit/Withdraw Cash
          </button>
          <button
            onClick={() => {
              void openAddTradeCashModal();
            }}
            className="px-4 py-3 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Add Currency
          </button>
        </div>
      </div>

      {/* Transaction Modal */}
      <TransactionEntryModal
        isOpen={showTransactionModal}
        onClose={() => setShowTransactionModal(false)}
        portfolioId={portfolioId!}
        onTransactionCreated={handleTransactionCreated}
        initialTransactionType={selectedTransactionType}
      />

      {/* Add Trade Cash Account Modal */}
      {showAddCashModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Add Trade Cash Account
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Currency
              </label>
              <select
                value={newCashCurrency}
                onChange={(e) => setNewCashCurrency(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
              >
                {SUPPORTED_CURRENCY_OPTIONS.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} - {currency.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                This will create a new trade cash account in the selected currency for this portfolio.
              </p>
            </div>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddCashModal(false);
                  setNewCashCurrency(baseCurrencyAtModalOpen);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={addingCash}
              >
                Cancel
              </button>
              <button
                onClick={handleAddTradeCashAccount}
                className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                disabled={addingCash}
              >
                {addingCash ? "Adding..." : "Add Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
