import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TransactionEntryModal } from "../components/TransactionEntryModal";
import { useAccounts } from "../context/AccountsContext";

interface PositionDetails {
  tickerSymbol: string;
  quantity: number;
  costBasis: number;
  costPerShare: number;
  marketPrice: number | null;
  marketValue: number | null;
  unrealizedGain: number | null;
  unrealizedGainPercent: number | null;
}

interface Transaction {
  id: string;
  date: string;
  type: string;
  description: string;
  amount: number;
}

type TransactionType = 'buy' | 'sell' | 'dividend' | 'dividend_reinvest' | 'interest' | 'fee' | 'cash_deposit' | 'cash_withdrawal';

export const PositionDetailsPage: React.FC = () => {
  const { portfolioId, tickerSymbol } = useParams<{ portfolioId: string; tickerSymbol: string }>();
  const navigate = useNavigate();
  const { refreshAccounts } = useAccounts();
  const [position, setPosition] = useState<PositionDetails | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [selectedTransactionType, setSelectedTransactionType] = useState<TransactionType>('buy');

  useEffect(() => {
    if (portfolioId && tickerSymbol) {
      fetchPositionData();
    }
  }, [portfolioId, tickerSymbol]);

  const fetchPositionData = async () => {
    if (!portfolioId || !tickerSymbol) return;

    setLoading(true);
    try {
      // Get portfolio accounts to find the security account
      const accountsResult = await window.electron.ipcRenderer.invoke(
        "get-portfolio-accounts",
        portfolioId
      );
      
      if (accountsResult.success) {
        const securityAccount = accountsResult.accounts.securities.find(
          (s: any) => s.investmentProperties?.tickerSymbol === tickerSymbol
        );
        
        if (securityAccount) {
          setAccountId(securityAccount.id);
          
          // Get position details
          const positionResult = await window.electron.ipcRenderer.invoke(
            "get-position-details",
            { accountId: securityAccount.id }
          );
          
          if (positionResult.success) {
            setPosition(positionResult.position);
          }

          // Get transaction history for this security
          // For now, we only show transactions that directly affect the security account
          // (buy, sell, reinvested dividends, stock splits)
          // Cash dividends don't affect the security account, so they won't appear here
          // TODO: Add a way to link dividend transactions to specific securities
          // (perhaps by adding a tickerSymbol field to JournalEntry)
          
          const securityTxns = await window.electron.ipcRenderer.invoke(
            "get-transactions",
            securityAccount.id
          );
          
          if (securityTxns && Array.isArray(securityTxns)) {
            const txns = securityTxns.map((entry: any) => ({
              id: entry.entry.id,
              date: entry.entry.date,
              type: entry.entry.type || 'unknown',
              description: entry.entry.description || '',
              amount: entry.amount,
            }));
            // Sort by date descending (most recent first)
            txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setTransactions(txns);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching position data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTransactionCreated = async () => {
    await fetchPositionData();
    // Refresh accounts context so balances update everywhere
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
        <div className="text-gray-500">Loading position...</div>
      </div>
    );
  }

  if (!position) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Position not found</div>
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
            <p className="text-sm text-gray-500 mt-1">Position Details</p>
          </div>
          <div className="flex gap-3">
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
              {formatCurrency(position.costBasis)}
            </p>
            <p className="text-sm text-gray-500">
              {formatCurrency(position.costPerShare)} per share
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Market Value</p>
            <p className="text-xl font-semibold text-gray-900">
              {position.marketValue !== null
                ? formatCurrency(position.marketValue)
                : formatCurrency(position.costBasis)}
            </p>
            {position.marketPrice !== null && (
              <p className="text-sm text-gray-500">
                {formatCurrency(position.marketPrice)} per share
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500">Unrealized Gain/Loss</p>
            <p className={`text-xl font-semibold ${
              (position.unrealizedGain || 0) >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {position.unrealizedGain !== null
                ? formatCurrency(position.unrealizedGain)
                : '-'}
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
                      {formatCurrency(Math.abs(txn.amount))}
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
      {portfolioId && (
        <TransactionEntryModal
          isOpen={showTransactionModal}
          onClose={() => setShowTransactionModal(false)}
          portfolioId={portfolioId}
          onTransactionCreated={handleTransactionCreated}
          initialTransactionType={selectedTransactionType}
          initialTickerSymbol={tickerSymbol}
        />
      )}
    </div>
  );
};
