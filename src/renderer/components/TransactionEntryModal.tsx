import React, { useState, useEffect } from "react";

interface TransactionEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: string;
  onTransactionCreated?: () => void;
  initialTransactionType?: TransactionType;
  initialTickerSymbol?: string;
}

type TransactionType = 'buy' | 'sell' | 'dividend' | 'dividend_reinvest' | 'interest' | 'fee' | 'cash_deposit' | 'cash_withdrawal';

export const TransactionEntryModal: React.FC<TransactionEntryModalProps> = ({
  isOpen,
  onClose,
  portfolioId,
  onTransactionCreated,
  initialTransactionType = 'buy',
  initialTickerSymbol,
}) => {
  const [transactionType, setTransactionType] = useState<TransactionType>(initialTransactionType);
  const [tickerSymbol, setTickerSymbol] = useState('');
  const [availableTickers, setAvailableTickers] = useState<string[]>([]);
  const [quantity, setQuantity] = useState('');
  const [pricePerShare, setPricePerShare] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [fee, setFee] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch available ticker symbols when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchAvailableTickers();
    }
  }, [isOpen, portfolioId]);

  // Reset transaction type and ticker when modal opens
  useEffect(() => {
    if (isOpen) {
      setTransactionType(initialTransactionType);
      if (initialTickerSymbol) {
        setTickerSymbol(initialTickerSymbol);
      }
    }
  }, [isOpen, initialTransactionType, initialTickerSymbol]);

  const fetchAvailableTickers = async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        "get-portfolio-accounts",
        portfolioId
      );
      
      if (result.success && result.accounts.securities) {
        const tickers = result.accounts.securities
          .map((sec: any) => sec.investmentProperties?.tickerSymbol)
          .filter((ticker: string) => ticker);
        setAvailableTickers(tickers);
      }
    } catch (error) {
      console.error("Error fetching tickers:", error);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      let result;

      switch (transactionType) {
        case 'buy':
          result = await window.electron.ipcRenderer.invoke('record-buy', {
            portfolioId,
            tickerSymbol,
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
            amount: parseFloat(amount),
            date,
            description,
          });
          break;

        case 'fee':
          result = await window.electron.ipcRenderer.invoke('record-fee', {
            portfolioId,
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
    setTickerSymbol('');
    setQuantity('');
    setPricePerShare('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setFee('');
    setDescription('');
    setError('');
    onClose();
  };

  const requiresTicker = ['buy', 'sell', 'dividend', 'dividend_reinvest'].includes(transactionType);
  const requiresQuantity = ['buy', 'sell'].includes(transactionType);
  const requiresPrice = ['buy', 'sell', 'dividend_reinvest'].includes(transactionType);
  const requiresAmount = ['dividend', 'dividend_reinvest', 'interest', 'fee'].includes(transactionType);

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Record Transaction
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Transaction Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Transaction Type
            </label>
            <select
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

          {/* Ticker Symbol */}
          {requiresTicker && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ticker Symbol *
              </label>
              <input
                type="text"
                list="ticker-symbols"
                value={tickerSymbol}
                onChange={(e) => setTickerSymbol(e.target.value.toUpperCase())}
                placeholder="e.g., AAPL"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
              <datalist id="ticker-symbols">
                {availableTickers.map((ticker) => (
                  <option key={ticker} value={ticker} />
                ))}
              </datalist>
            </div>
          )}

          {/* Quantity */}
          {requiresQuantity && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity *
              </label>
              <input
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price Per Share *
              </label>
              <input
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount *
              </label>
              <input
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date *
            </label>
            <input
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fee (optional)
              </label>
              <input
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <input
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
              <p className="text-sm text-red-600">{error}</p>
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
              disabled={submitting}
            >
              {submitting ? 'Recording...' : 'Record Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
