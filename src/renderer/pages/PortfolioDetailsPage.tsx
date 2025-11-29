import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TransactionEntryModal } from "../components/TransactionEntryModal";
import { useAccounts } from "../context/AccountsContext";

interface Position {
  tickerSymbol: string;
  quantity: number;
  costBasis: number;
  costPerShare: number;
  marketPrice: number | null;
  marketValue: number | null;
  unrealizedGain: number | null;
  unrealizedGainPercent: number | null;
}

interface PortfolioValue {
  totalCostBasis: number;
  totalMarketValue: number;
  totalUnrealizedGain: number;
  totalUnrealizedGainPercent: number;
  cashBalance: number;
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

  useEffect(() => {
    if (portfolioId) {
      fetchPortfolioData();
    }
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

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercent = (percent: number): string => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
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
    ? portfolioValue.totalMarketValue + portfolioValue.cashBalance
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
                  {formatCurrency(totalValue)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Cash Balance</p>
                <p className="text-xl font-semibold text-gray-900">
                  {formatCurrency(portfolioValue.cashBalance)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Securities Value</p>
                <p className="text-xl font-semibold text-gray-900">
                  {formatCurrency(portfolioValue.totalMarketValue)}
                </p>
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-gray-500">Unrealized Gain/Loss</p>
                  <p className={`text-xl font-semibold ${
                    portfolioValue.totalUnrealizedGain >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(portfolioValue.totalUnrealizedGain)}
                  </p>
                  <p className={`text-sm ${
                    portfolioValue.totalUnrealizedGain >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatPercent(portfolioValue.totalUnrealizedGainPercent)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Realized Gain/Loss</p>
                  <p className={`text-xl font-semibold ${
                    realizedGains >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(realizedGains)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Dividend Income</p>
                  <p className="text-xl font-semibold text-green-600">
                    {formatCurrency(dividendIncome)}
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
                    Cost Basis
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Market Price
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Market Value
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gain/Loss
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
                      {formatCurrency(position.costBasis)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {position.marketPrice !== null
                        ? formatCurrency(position.marketPrice)
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {position.marketValue !== null
                        ? formatCurrency(position.marketValue)
                        : formatCurrency(position.costBasis)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${
                      (position.unrealizedGain || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {position.unrealizedGain !== null
                        ? formatCurrency(position.unrealizedGain)
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
    </div>
  );
};
