import { localCalendarDate } from "../../shared/dateUtils";
import React, { useState, useEffect, useMemo } from "react";

interface TransactionEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: string;
  onTransactionCreated?: () => void;
  initialTransactionType?: TransactionType;
  initialTickerSymbol?: string;
  initialSecurityAccountId?: string;
}

type TransactionType = 'buy' | 'sell' | 'dividend' | 'dividend_reinvest' | 'interest' | 'fee' | 'cash_deposit' | 'cash_withdrawal';

export const TransactionEntryModal: React.FC<TransactionEntryModalProps> = ({
  isOpen,
  onClose,
  portfolioId,
  onTransactionCreated,
  initialTransactionType = 'buy',
  initialTickerSymbol,
  initialSecurityAccountId,
}) => {
  const [transactionType, setTransactionType] = useState<TransactionType>(initialTransactionType);
  const [securities, setSecurities] = useState<any[]>([]);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [securityAccountId, setSecurityAccountId] = useState('');
  const [tradeCashAccountId, setTradeCashAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const requiresTicker = ['buy', 'sell', 'dividend', 'dividend_reinvest'].includes(transactionType);
  const selectedHolding = securities.find((account) => account.id === securityAccountId);
  const tickerSymbol = selectedHolding?.investmentProperties.tickerSymbol || '';
  const eligibleCash = useMemo(() => cashAccounts.filter((account) => !requiresTicker || (selectedHolding && account.currency === selectedHolding.currency)), [cashAccounts, requiresTicker, selectedHolding]);
  const [quantity, setQuantity] = useState('');
  const [pricePerShare, setPricePerShare] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localCalendarDate());
  const [fee, setFee] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true); setError(''); setSecurities([]); setCashAccounts([]);
    setSecurityAccountId(''); setTradeCashAccountId(''); setTransactionType(initialTransactionType);
    void (async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke("get-portfolio-accounts", portfolioId);
        if (!active) return;
        if (!result.success) throw new Error(result.error || "Unable to load portfolio accounts");
        const holdings = (result.accounts.securities || []).filter((a: any) => !a.isArchived);
        setSecurities(holdings);
        setCashAccounts((result.accounts.tradeCashAccounts || []).filter((a: any) => !a.isArchived));
        const matches = holdings.filter((a: any) => a.investmentProperties?.tickerSymbol === initialTickerSymbol);
        const selected = initialSecurityAccountId ? holdings.find((a: any) => a.id === initialSecurityAccountId)
          : initialTickerSymbol ? matches.length === 1 ? matches[0] : undefined : holdings.length === 1 ? holdings[0] : undefined;
        setSecurityAccountId(selected?.id || '');
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "Unable to load portfolio accounts"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [isOpen, portfolioId, initialTransactionType, initialTickerSymbol, initialSecurityAccountId]);

  useEffect(() => {
    setTradeCashAccountId((current) => eligibleCash.some((a) => a.id === current) ? current : eligibleCash.length === 1 ? eligibleCash[0].id : '');
  }, [eligibleCash]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (loading || submitting) return;
    if (requiresTicker && !selectedHolding) { setError('Select a holding. Add a holding from the portfolio first if needed.'); return; }
    if (!eligibleCash.some((a) => a.id === tradeCashAccountId)) { setError('Select a matching cash account.'); return; }
    setSubmitting(true);

    try {
      let result;

      switch (transactionType) {
        case 'buy':
          result = await window.electron.ipcRenderer.invoke('record-buy', {
            portfolioId,
            tickerSymbol,
            securityAccountId,
            tradeCashAccountId,
            quantity: parseFloat(quantity),
            pricePerShare: parseFloat(pricePerShare),
            date,
            fee: fee ? parseFloat(fee) : undefined,
            description,
          });
          break;

        case 'sell':
          result = await window.electron.ipcRenderer.invoke('record-sell', {
            portfolioId,
            tickerSymbol,
            securityAccountId,
            tradeCashAccountId,
            quantity: parseFloat(quantity),
            pricePerShare: parseFloat(pricePerShare),
            date,
            fee: fee ? parseFloat(fee) : undefined,
            description,
          });
          break;

        case 'dividend':
          result = await window.electron.ipcRenderer.invoke('record-dividend', {
            portfolioId,
            tickerSymbol,
            securityAccountId,
            tradeCashAccountId,
            amount: parseFloat(amount),
            date,
            isReturnOfCapital: false,
            description,
          });
          break;

        case 'dividend_reinvest':
          result = await window.electron.ipcRenderer.invoke('record-reinvested-dividend', {
            portfolioId,
            tickerSymbol,
            securityAccountId,
            tradeCashAccountId,
            dividendAmount: parseFloat(amount),
            reinvestmentPrice: parseFloat(pricePerShare),
            date,
            recordAsIncome: true,
            description,
          });
          break;

        case 'interest':
          result = await window.electron.ipcRenderer.invoke('record-interest', {
            portfolioId,
            tradeCashAccountId,
            amount: parseFloat(amount),
            date,
            description,
          });
          break;

        case 'fee':
          result = await window.electron.ipcRenderer.invoke('record-fee', {
            portfolioId,
            tradeCashAccountId,
            amount: parseFloat(amount),
            description: description || 'Investment fee',
            date,
          });
          break;

        case 'cash_deposit':
        case 'cash_withdrawal':
          // These need to be implemented with account selection
          setError('Cash deposit/withdrawal functionality coming soon. Please use the Transfer modal from the Accounts page.');
          setSubmitting(false);
          return;

        default:
          throw new Error('Unsupported transaction type');
      }

      if (result.success) {
        onTransactionCreated?.();
        handleClose();
      } else {
        setError(result.error || 'Failed to record transaction');
      }
    } catch (err) {
      console.error('Error recording transaction:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setTransactionType('buy');
    setSecurityAccountId('');
    setTradeCashAccountId('');
    setQuantity('');
    setPricePerShare('');
    setAmount('');
    setDate(localCalendarDate());
    setFee('');
    setDescription('');
    setError('');
    onClose();
  };

  const requiresQuantity = ['buy', 'sell'].includes(transactionType);
  const requiresPrice = ['buy', 'sell', 'dividend_reinvest'].includes(transactionType);
  const requiresAmount = ['dividend', 'dividend_reinvest', 'interest', 'fee'].includes(transactionType);

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div role="dialog" aria-modal="true" aria-labelledby="transaction-entry-title" data-testid="transaction-entry-dialog" className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 id="transaction-entry-title" className="text-lg font-medium text-gray-900 mb-4">
          Record Transaction
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {loading ? <p role="status">Loading portfolio accounts…</p> : null}
          {/* Transaction Type */}
          <div>
            <label htmlFor="transaction-type" className="block text-sm font-medium text-gray-700 mb-1">
              Transaction Type
            </label>
            <select id="transaction-type"
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value as TransactionType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="dividend">Cash Dividend</option>
              <option value="dividend_reinvest">Reinvested Dividend</option>
              <option value="interest">Interest Income</option>
              <option value="fee">Fee</option>
            </select>
          </div>

          {requiresTicker && <div>
            <label htmlFor="transaction-holding" className="block text-sm font-medium text-gray-700 mb-1">Holding</label>
            <select id="transaction-holding" className="w-full px-3 py-2 border rounded-md" value={securityAccountId} onChange={(e) => setSecurityAccountId(e.target.value)} required disabled={loading || submitting}>
              <option value="">Select holding</option>
              {securities.map((a) => <option key={a.id} value={a.id}>{a.investmentProperties.tickerSymbol} · {a.investmentProperties.market || 'Market needs review'} · {a.currency}</option>)}
            </select>
            {!loading && !securities.length ? <p className="text-sm text-gray-600">Add a holding from the portfolio before recording a security transaction.</p> : null}
          </div>}
          <div>
            <label htmlFor="transaction-cash" className="block text-sm font-medium text-gray-700 mb-1">Cash account</label>
            <select id="transaction-cash" className="w-full px-3 py-2 border rounded-md" value={tradeCashAccountId} onChange={(e) => setTradeCashAccountId(e.target.value)} required disabled={loading || submitting}>
              <option value="">Select cash account</option>{eligibleCash.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
            </select>
            {requiresTicker && selectedHolding ? <p className="text-sm text-gray-600">Amounts are in {selectedHolding.currency}. Only matching cash accounts are shown.</p> : null}
          </div>

          {/* Quantity */}
          {requiresQuantity && (
            <div>
              <label htmlFor="transaction-quantity" className="block text-sm font-medium text-gray-700 mb-1">
                Quantity *
              </label>
              <input id="transaction-quantity"
                type="number"
                step="0.000001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          )}

          {/* Price Per Share */}
          {requiresPrice && (
            <div>
              <label htmlFor="transaction-price" className="block text-sm font-medium text-gray-700 mb-1">
                Price Per Share *
              </label>
              <input id="transaction-price"
                type="number"
                step="0.01"
                value={pricePerShare}
                onChange={(e) => setPricePerShare(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          )}

          {/* Amount */}
          {requiresAmount && (
            <div>
              <label htmlFor="transaction-amount" className="block text-sm font-medium text-gray-700 mb-1">
                Amount *
              </label>
              <input id="transaction-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          )}

          {/* Date */}
          <div>
            <label htmlFor="transaction-date" className="block text-sm font-medium text-gray-700 mb-1">
              Date *
            </label>
            <input id="transaction-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

          {/* Fee (for buy/sell) */}
          {(transactionType === 'buy' || transactionType === 'sell') && (
            <div>
              <label htmlFor="transaction-fee" className="block text-sm font-medium text-gray-700 mb-1">
                Fee (optional)
              </label>
              <input id="transaction-fee"
                type="number"
                step="0.01"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label htmlFor="transaction-description" className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <input id="transaction-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p role="alert" className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
              disabled={submitting || loading || (requiresTicker && !selectedHolding) || !eligibleCash.some((a) => a.id === tradeCashAccountId)}
            >
              {submitting ? 'Recording...' : 'Record Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
