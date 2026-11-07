import { localCalendarDate, formatDateString } from "../../shared/dateUtils";
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { formatValuationAmount } from "../utils/valuationFormatting";

import type { RealizedGainReportRow } from "../../shared/investmentReporting";
import { formatMultiCurrencyBalances } from "../utils/currencyUtils";

interface PerformanceData {
  baseCurrency?: string;
  incomeByCurrency?: { dividends: Record<string, number>; interest: Record<string, number>; fees: Record<string, number> };
  totalReturn: number | null;
  totalReturnPercent: number | null;
  realizedGains: number | null;
  unrealizedGains: number | null;
  dividendIncome: number | null;
  interestIncome: number | null;
  fees: number | null;
  deposits: number;
  withdrawals: number;
  currentValue: number | null;
}

interface AssetAllocation {
  accountId: string;
  tickerSymbol: string;
  marketValueBase: number | null;
  marketValueNative: number | null;
  currency: string;
  percentOfPortfolio: number | null;
}

interface PositionAllocationSnapshot {
  accountId: string;
  tickerSymbol: string;
  currency: string;
  costBasisBase: number | null;
  marketValue: number | null;
  marketValueBase: number | null;
}

type RealizedGain = RealizedGainReportRow;

export const PerformanceReportsPage: React.FC = () => {
  const { portfolioId } = useParams<{ portfolioId: string }>();
  const navigate = useNavigate();
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [assetAllocation, setAssetAllocation] = useState<AssetAllocation[]>([]);
  const [realizedGains, setRealizedGains] = useState<RealizedGain[]>([]);
  const generation = useRef(0);
  const [gainsAvailable, setGainsAvailable] = useState(false);
  const [allocationAvailable, setAllocationAvailable] = useState(false);
  const [reportError, setReportError] = useState("");
  const [loading, setLoading] = useState(true);
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return localCalendarDate(date);
  });
  const [endDate, setEndDate] = useState(localCalendarDate());

  useEffect(() => {
    if (portfolioId) {
      fetchReportData();
    }
    let active = true;
    void window.electron.getBaseCurrencyImpactState().then((state) => { if (active) setBaseCurrency(state.baseCurrency || "USD"); });
    return () => { active = false; generation.current++; };
  }, [portfolioId, startDate, endDate]);

  const fetchReportData = async () => {
    if (!portfolioId) return;

    const token = ++generation.current;
    setLoading(true); setReportError(""); setPerformance(null); setAssetAllocation([]); setRealizedGains([]); setGainsAvailable(false); setAllocationAvailable(false);
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

      if (token !== generation.current) return;
      setReportError([perfResult, allocResult, gainsResult, positionsResult].filter((r) => !r.success).map((r) => r.error || "Report data is unavailable").join("; "));
      setGainsAvailable(Boolean(gainsResult.success)); setAllocationAvailable(Boolean(allocResult.success && positionsResult.success));
      if (perfResult.success) {
        setPerformance(perfResult.performance);
      }

      if (allocResult.success) {
        const positionEntries: Array<[string, PositionAllocationSnapshot]> = Array.isArray(positionsResult.positions)
          ? positionsResult.positions.map((position: PositionAllocationSnapshot) => [
              position.accountId,
              position,
            ])
          : [];
        const positionsById = new Map<string, PositionAllocationSnapshot>(positionEntries);

        const mergedAllocation: AssetAllocation[] = allocResult.allocation.map((allocation: any) => {
          const position = positionsById.get(allocation.accountId);
          const marketValueNative =
            position?.marketValue !== null && position?.marketValue !== undefined
              ? position.marketValue
              : allocation.marketValue;

          return {
            accountId: allocation.accountId,
            tickerSymbol: allocation.tickerSymbol,
            marketValueBase:
              position?.marketValueBase !== null && position?.marketValueBase !== undefined
                ? position.marketValueBase
                : null,
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
      if (token === generation.current) setReportError(error instanceof Error ? error.message : "Report data is unavailable");
    } finally {
      if (token === generation.current) setLoading(false);
    }
  };

  const reportCurrency = performance?.baseCurrency || baseCurrency;

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
    <div className="space-y-6" data-testid="performance-reports-page">
      {reportError ? <div className="rounded border border-red-200 bg-red-50 p-3"><p role="alert">{reportError}</p><button className="underline" onClick={() => void fetchReportData()}>Retry report data</button></div> : null}
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
                (performance.totalReturn ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {performance.totalReturn === null ? "N/A" : formatValuationAmount(performance.totalReturn, reportCurrency)}
              </p>
              <p className={`text-sm ${
                (performance.totalReturnPercent ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {performance.totalReturnPercent === null ? "N/A" : formatPercent(performance.totalReturnPercent)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Realized Gains</p>
              <p className={`text-xl font-semibold ${
                (performance.realizedGains ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatValuationAmount(performance.realizedGains, reportCurrency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Unrealized Gains</p>
              <p className={`text-xl font-semibold ${
                (performance.unrealizedGains ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {performance.unrealizedGains === null ? "N/A" : formatValuationAmount(performance.unrealizedGains, reportCurrency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Income</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatValuationAmount(performance.dividendIncome === null || performance.interestIncome === null ? null : performance.dividendIncome + performance.interestIncome, reportCurrency)}
              </p>
              <p className="text-xs text-gray-500">
                Div: {formatValuationAmount(performance.dividendIncome, reportCurrency)}<br />
                Int: {formatValuationAmount(performance.interestIncome, reportCurrency)}
              </p>
              {performance.incomeByCurrency ? <p className="text-xs text-gray-500">Native div: {formatMultiCurrencyBalances(performance.incomeByCurrency.dividends)}<br />Native int: {formatMultiCurrencyBalances(performance.incomeByCurrency.interest)}</p> : null}
            </div>
          </div>
        </div>
      )}

      {/* Asset Allocation */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Asset Allocation</h3>
        {!allocationAvailable ? <p className="text-sm text-gray-500">Allocation data is unavailable</p> : assetAllocation.length === 0 ? (
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
                  <tr key={allocation.accountId}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {allocation.tickerSymbol}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                      {allocation.percentOfPortfolio === null ? "N/A" : `${allocation.percentOfPortfolio.toFixed(2)}%`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {allocation.marketValueBase !== null
                        ? formatValuationAmount(allocation.marketValueBase, baseCurrency, { disambiguate: true })
                        : "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {allocation.marketValueNative === null ? "N/A" : formatValuationAmount(allocation.marketValueNative, allocation.currency, {
                        disambiguate: true,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {assetAllocation.some((allocation) => allocation.marketValueBase === null) ? (
              <p className="mt-3 text-xs text-amber-700">
                Base totals are unavailable for one or more positions because verified market prices or FX conversion data are missing.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* Realized Gains/Losses */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Realized Gains/Losses</h3>
        <p className="text-sm text-gray-500 mb-3">Native journal gains are converted using sale-date FX. Holding age describes consumed lots using a 365-day boundary.</p>
        {!gainsAvailable ? <p className="text-sm text-gray-500">Realized gains are unavailable</p> : realizedGains.length === 0 ? (
          <p className="text-sm text-gray-500">No realized gains/losses in this period</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost Basis (Native)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Cash Proceeds (Native)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gain/Loss (Native)</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Gain/Loss (Base)</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Holding Age</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {realizedGains.map((gain) => (
                  <tr key={gain.entryId}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDateString(gain.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {gain.tickerSymbol}<div className="text-xs text-gray-500">{gain.market || "Market needs review"}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {gain.quantity === null ? "N/A" : gain.quantity.toFixed(6)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatValuationAmount(gain.costBasis, gain.currency, { disambiguate: true })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatValuationAmount(gain.saleProceeds, gain.currency, { disambiguate: true })}
                      {gain.otherCategoryAmount ? <div className="text-xs text-gray-500">Other category postings: {formatValuationAmount(gain.otherCategoryAmount, gain.currency, { disambiguate: true })}</div> : null}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
                      gain.realizedGain >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatValuationAmount(gain.realizedGain, gain.currency, { disambiguate: true })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatValuationAmount(gain.realizedGainBase, gain.baseCurrency, { disambiguate: true })}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {gain.holdingPeriod === 'long' ? 'Long' : gain.holdingPeriod === 'short' ? 'Short' : gain.holdingPeriod === 'mixed' ? 'Mixed' : '-'}
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
