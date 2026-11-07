import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TransactionEntryModal } from "../components/TransactionEntryModal";
import { useAccounts } from "../context/AccountsContext";
import { formatValuationAmount } from "../utils/valuationFormatting";
const SecurityPriceModal = React.lazy(() => import("../components/SecurityPriceModal").then((module) => ({ default: module.SecurityPriceModal })));

interface PositionDetails {
  accountId: string;
  market: string | null;
  priceDate: string | null;
  tickerSymbol: string;
  quantity: number;
  costBasis: number;
  costPerShare: number;
  marketPrice: number | null;
  marketValue: number | null;
  unrealizedGain: number | null;
  unrealizedGainPercent: number | null;
}

interface PositionValuationSnapshot {
  currency: string;
  costBasisBase: number | null;
  marketValueBase: number | null;
}

interface Transaction {
  id: string;
  date: string;
  type: string;
  description: string;
  amount: number;
  currency: string;
}

type TransactionType = 'buy' | 'sell' | 'dividend' | 'dividend_reinvest' | 'interest' | 'fee' | 'cash_deposit' | 'cash_withdrawal';

export const PositionDetailsPage: React.FC = () => {
  const { portfolioId, tickerSymbol, securityAccountId } = useParams<{ portfolioId: string; tickerSymbol: string; securityAccountId: string }>();
  const navigate = useNavigate();
  const { refreshAccounts } = useAccounts();
  const generation = useRef(0);
  const [error, setError] = useState("");
  const [position, setPosition] = useState<PositionDetails | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showPrices, setShowPrices] = useState(false);
  const [selectedTransactionType, setSelectedTransactionType] = useState<TransactionType>('buy');
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [positionValuation, setPositionValuation] = useState<PositionValuationSnapshot | null>(null);

  useEffect(() => {
    void fetchPositionData();
    let disposed = false;
    void window.electron.getBaseCurrencyImpactState().then((state) => {
      if (!disposed) setBaseCurrency(state.baseCurrency || "USD");
    });
    return () => { disposed = true; generation.current++; };
  }, [portfolioId, tickerSymbol, securityAccountId]);

  const fetchPositionData = async () => {
    if (!portfolioId || (!tickerSymbol && !securityAccountId)) return;
    const token = ++generation.current;
    setLoading(true); setError(""); setPosition(null); setPositionValuation(null); setAccountId(null); setTransactions([]);
    try {
      const accountsResult = await window.electron.ipcRenderer.invoke("get-portfolio-accounts", portfolioId);
      if (token !== generation.current) return;
      if (!accountsResult.success) throw new Error(accountsResult.error || "Unable to load portfolio");
      const matches = accountsResult.accounts.securities.filter((account: any) => securityAccountId ? account.id === securityAccountId : account.investmentProperties?.tickerSymbol === tickerSymbol);
      if (matches.length > 1) throw new Error("This ticker has multiple holdings. Open the position from its portfolio to select the correct market.");
      const securityAccount = matches[0];
      if (!securityAccount) throw new Error("Position not found in this portfolio");
      const [positionResult, allPositionsResult, securityTxns] = await Promise.all([
        window.electron.ipcRenderer.invoke("get-position-details", { accountId: securityAccount.id }),
        window.electron.ipcRenderer.invoke("get-all-positions", { portfolioId }),
        window.electron.ipcRenderer.invoke("get-transactions", securityAccount.id),
      ]);
      if (token !== generation.current) return;
      if (!positionResult.success) throw new Error(positionResult.error || "Unable to load position");
      setAccountId(securityAccount.id); setPosition(positionResult.position);
      const matched = allPositionsResult.success && allPositionsResult.positions?.find((entry: any) => entry.accountId === securityAccount.id);
      if (matched) setPositionValuation({ currency: matched.currency, costBasisBase: matched.costBasisBase, marketValueBase: matched.marketValueBase });
      else setPositionValuation({ currency: securityAccount.currency, costBasisBase: null, marketValueBase: null });
      if (Array.isArray(securityTxns)) setTransactions(securityTxns.map((entry: any) => ({
        id: entry.entry.id, date: entry.entry.date, type: entry.entry.type || "unknown", description: entry.entry.description || "", amount: entry.amount, currency: entry.currency,
      })).sort((a, b) => b.date.localeCompare(a.date)));
    } catch (failure) {
      if (token === generation.current) setError(failure instanceof Error ? failure.message : "Unable to load position");
    } finally { if (token === generation.current) setLoading(false); }
  };

  const handleTransactionCreated = async () => {
    await fetchPositionData();
    // Refresh accounts context so balances update everywhere
    await refreshAccounts();
  };

  const formatPercent = (percent: number): string => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  const nativeCurrency = positionValuation?.currency || baseCurrency;
  const costBasisBase = positionValuation?.costBasisBase ?? null;
  const marketValueBase = positionValuation?.marketValueBase ?? null;
  const nativeMarketValue = position?.marketValue ?? null;
  const unrealizedGainBase =
    costBasisBase !== null && marketValueBase !== null ? marketValueBase - costBasisBase : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading position...</div>
      </div>
    );
  }

  if (!position) {
    return (
      <div className="flex items-center justify-center h-64">
        <div role="alert" className="text-gray-500">{error || "Position not found"}</div>
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
        
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">{position.tickerSymbol}</h2>
            <p className="text-sm text-gray-500 mt-1">{position.market || "Market needs review"}{position.priceDate ? ` · Close as of ${position.priceDate}` : ""}</p>
          </div>
          <div className="flex gap-3">
            <button data-testid="security-price-controls-button" className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium" onClick={() => setShowPrices(true)}>Market &amp; prices</button>
            <button 
              onClick={() => {
                setSelectedTransactionType('buy');
                setShowTransactionModal(true);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Buy
            </button>
            <button 
              onClick={() => {
                setSelectedTransactionType('sell');
                setShowTransactionModal(true);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Sell
            </button>
          </div>
        </div>
      </div>

      {/* Position Summary */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Summary</h3>
        {position.marketPrice === null ? (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="missing-enrichment-cta">
            Market data is unavailable for this position at the selected valuation point.
            <button
              type="button"
              className="ml-2 text-primary-700 underline"
              onClick={() => {
                window.dispatchEvent(new Event("open-enrichment-panel"));
              }}
              data-testid="missing-enrichment-refresh-now"
            >
              Refresh now
            </button>
          </div>
        ) : null}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-gray-500">Quantity</p>
            <p className="text-xl font-semibold text-gray-900">
              {position.quantity.toFixed(6)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Cost Basis</p>
            <p className="text-xl font-semibold text-gray-900">
              {costBasisBase !== null ? formatValuationAmount(costBasisBase, baseCurrency) : "N/A"}
            </p>
            <p className="text-sm text-gray-500">
              Native: {formatValuationAmount(position.costBasis, nativeCurrency, { disambiguate: true })}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Market Value</p>
            <p className="text-xl font-semibold text-gray-900">
              {marketValueBase !== null
                ? formatValuationAmount(marketValueBase, baseCurrency)
                : "N/A"}
            </p>
            <p className="text-sm text-gray-500">
              Native: {nativeMarketValue === null ? "N/A" : formatValuationAmount(nativeMarketValue, nativeCurrency, { disambiguate: true })}
            </p>
            {position.marketPrice !== null && (
              <p className="text-sm text-gray-500">
                  Price: {formatValuationAmount(position.marketPrice, nativeCurrency, { disambiguate: true })} per share
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500">Unrealized Gain/Loss</p>
            <p className={`text-xl font-semibold ${
              (unrealizedGainBase || 0) >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {unrealizedGainBase !== null
                ? formatValuationAmount(unrealizedGainBase, baseCurrency)
                : 'N/A'}
            </p>
            <p className={`text-sm ${
              (position.unrealizedGain || 0) >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {position.unrealizedGain !== null
                ? `Native: ${formatValuationAmount(position.unrealizedGain, nativeCurrency, { disambiguate: true })}`
                : "Native: -"}
            </p>
            {position.unrealizedGainPercent !== null && (
              <p className={`text-sm ${
                position.unrealizedGainPercent >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatPercent(position.unrealizedGainPercent)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction History</h3>
        
        {transactions.length === 0 ? (
          <p className="text-sm text-gray-500">No transactions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.map((txn) => (
                  <tr key={txn.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {txn.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {txn.type.replace('investment_', '').replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {txn.description}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${
                      txn.amount >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatValuationAmount(Math.abs(txn.amount), txn.currency, { disambiguate: true })}
                      {txn.amount >= 0 ? ' (debit)' : ' (credit)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cost Basis Breakdown */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Basis Breakdown</h3>
        <p className="text-sm text-gray-500">
          For FIFO portfolios, lot details will be displayed here showing purchase dates,
          quantities, and costs for each lot.
        </p>
      </div>

      {/* Transaction Modal */}
      {showPrices && accountId ? <React.Suspense fallback={<p role="status">Loading price controls…</p>}><SecurityPriceModal isOpen accountId={accountId} onClose={() => setShowPrices(false)} onChanged={() => { void handleTransactionCreated(); }} /></React.Suspense> : null}
      {portfolioId && (
        <TransactionEntryModal
          isOpen={showTransactionModal}
          onClose={() => setShowTransactionModal(false)}
          portfolioId={portfolioId}
          onTransactionCreated={handleTransactionCreated}
          initialTransactionType={selectedTransactionType}
          initialTickerSymbol={position.tickerSymbol}
          initialSecurityAccountId={accountId || undefined}
        />
      )}
    </div>
  );
};
