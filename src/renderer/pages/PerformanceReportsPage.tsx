import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { formatValuationAmount } from "../utils/valuationFormatting";

interface PerformanceData {
  totalReturn: number;
  totalReturnPercent: number;
  realizedGains: number;
  unrealizedGains: number;
  dividendIncome: number;
  interestIncome: number;
  fees: number;
  deposits: number;
  withdrawals: number;
  currentValue: number;
}

interface AssetAllocation {
  tickerSymbol: string;
  marketValueBase: number | null;
  marketValueNative: number;
  currency: string;
  percentOfPortfolio: number;
}

interface PositionAllocationSnapshot {
  tickerSymbol: string;
  currency: string;
  costBasisBase: number | null;
  marketValue: number | null;
  marketValueBase: number | null;
}

interface RealizedGain {
  date: string;
  tickerSymbol: string;
  quantity: number;
  costBasis: number;
  saleProceeds: number;
  realizedGain: number;
  holdingPeriod: 'short' | 'long' | 'unknown';
}

export const PerformanceReportsPage: React.FC = () => {
  const { portfolioId } = useParams<{ portfolioId: string }>();
  const navigate = useNavigate();
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [assetAllocation, setAssetAllocation] = useState<AssetAllocation[]>([]);
  const [realizedGains, setRealizedGains] = useState<RealizedGain[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (portfolioId) {
      fetchReportData();
    }
    void window.electron.getBaseCurrencyImpactState().then((state) => {
      setBaseCurrency(state.baseCurrency || "USD");
    });
  }, [portfolioId, startDate, endDate]);

  const fetchReportData = async () => {
    if (!portfolioId) return;

    setLoading(true);
    try {
      const [perfResult, allocResult, gainsResult, positionsResult] = await Promise.all([
        window.electron.ipcRenderer.invoke('get-portfolio-performance', {
          portfolioId,
          startDate,
          endDate,
        }),
        window.electron.ipcRenderer.invoke('get-asset-allocation', portfolioId),
        window.electron.ipcRenderer.invoke('get-realized-gains', {
          portfolioId,
          startDate,
          endDate,
        }),
        window.electron.ipcRenderer.invoke('get-all-positions', {
          portfolioId,
        }),
      ]);

      if (perfResult.success) {
        setPerformance(perfResult.performance);
      }

      if (allocResult.success) {
        const positionEntries: Array<[string, PositionAllocationSnapshot]> = Array.isArray(positionsResult.positions)
          ? positionsResult.positions.map((position: PositionAllocationSnapshot) => [
              position.tickerSymbol,
              position,
            ])
          : [];
        const positionsByTicker = new Map<string, PositionAllocationSnapshot>(positionEntries);

        const mergedAllocation: AssetAllocation[] = allocResult.allocation.map((allocation: any) => {
          const position = positionsByTicker.get(allocation.tickerSymbol);
          const marketValueNative =
            position?.marketValue !== null && position?.marketValue !== undefined
              ? position.marketValue
              : allocation.marketValue;

          return {
            tickerSymbol: allocation.tickerSymbol,
            marketValueBase:
              position?.marketValueBase !== null && position?.marketValueBase !== undefined
                ? position.marketValueBase
                : position?.costBasisBase ?? null,
            marketValueNative,
            currency: position?.currency || baseCurrency,
            percentOfPortfolio: allocation.percentOfPortfolio,
          };
        });

        setAssetAllocation(mergedAllocation);
      }

      if (gainsResult.success) {
        setRealizedGains(gainsResult.gains);
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (percent: number): string => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading reports...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <button
          onClick={() => navigate(`/investments/${portfolioId}`)}
          className="text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          ← Back to Portfolio
        </button>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Performance Reports</h2>

        {/* Date Range Selector */}
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <button
            onClick={fetchReportData}
            className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700"
          >
            Update
          </button>
        </div>
      </div>

      {/* Portfolio Performance */}
      {performance && (
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Portfolio Performance</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-500">Total Return</p>
              <p className={`text-xl font-semibold ${
                performance.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatValuationAmount(performance.totalReturn, baseCurrency)}
              </p>
              <p className={`text-sm ${
                performance.totalReturnPercent >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatPercent(performance.totalReturnPercent)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Realized Gains</p>
              <p className={`text-xl font-semibold ${
                performance.realizedGains >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatValuationAmount(performance.realizedGains, baseCurrency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Unrealized Gains</p>
              <p className={`text-xl font-semibold ${
                performance.unrealizedGains >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatValuationAmount(performance.unrealizedGains, baseCurrency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Income</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatValuationAmount(performance.dividendIncome + performance.interestIncome, baseCurrency)}
              </p>
              <p className="text-xs text-gray-500">
                Div: {formatValuationAmount(performance.dividendIncome, baseCurrency)}<br />
                Int: {formatValuationAmount(performance.interestIncome, baseCurrency)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Asset Allocation */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Asset Allocation</h3>
        {assetAllocation.length === 0 ? (
          <p className="text-sm text-gray-500">No positions</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Weight</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value (Base)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value (Native)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {assetAllocation.map((allocation) => (
                  <tr key={allocation.tickerSymbol}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {allocation.tickerSymbol}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                      {allocation.percentOfPortfolio.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {allocation.marketValueBase !== null
                        ? formatValuationAmount(allocation.marketValueBase, baseCurrency, { disambiguate: true })
                        : "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatValuationAmount(allocation.marketValueNative, allocation.currency, {
                        disambiguate: true,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {assetAllocation.some((allocation) => allocation.marketValueBase === null) ? (
              <p className="mt-3 text-xs text-amber-700">
                Base totals are unavailable for one or more positions because FX conversion data is missing.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* Realized Gains/Losses */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Realized Gains/Losses</h3>
        {realizedGains.length === 0 ? (
          <p className="text-sm text-gray-500">No realized gains/losses in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost Basis</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Proceeds</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gain/Loss</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Term</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {realizedGains.map((gain, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(gain.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {gain.tickerSymbol}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {gain.quantity.toFixed(6)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatValuationAmount(gain.costBasis, baseCurrency, { disambiguate: true })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatValuationAmount(gain.saleProceeds, baseCurrency, { disambiguate: true })}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
                      gain.realizedGain >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatValuationAmount(gain.realizedGain, baseCurrency, { disambiguate: true })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {gain.holdingPeriod === 'long' ? 'Long' : gain.holdingPeriod === 'short' ? 'Short' : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
