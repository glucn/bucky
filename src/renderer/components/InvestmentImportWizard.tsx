import React, { useState } from "react";

interface InvestmentImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: string;
  onImportComplete?: () => void;
}

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

export const InvestmentImportWizard: React.FC<InvestmentImportWizardProps> = ({
  isOpen,
  onClose,
  portfolioId,
  onImportComplete,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [csvData, setCsvData] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState({
    date: '',
    type: '',
    ticker: '',
    quantity: '',
    price: '',
    amount: '',
    fee: '',
    description: '',
  });
  const [validationResult, setValidationResult] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvData(text);
      
      // Parse headers
      const lines = text.trim().split('\n');
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim());
        setCsvHeaders(headers);
      }
      
      setStep('mapping');
    };
    reader.readAsText(file);
  };

  const handleValidate = async () => {
    setError('');
    try {
      const result = await window.electron.ipcRenderer.invoke('validate-import-data', {
        csvData,
        mapping,
      });

      if (result.success) {
        setValidationResult(result.validation);
        if (result.validation.valid) {
          setStep('preview');
        } else {
          setError(`Validation failed: ${result.validation.errors.length} errors found`);
        }
      } else {
        setError(result.error || 'Validation failed');
      }
    } catch (err) {
      console.error('Error validating import data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleImport = async () => {
    setError('');
    setStep('importing');
    
    try {
      const result = await window.electron.ipcRenderer.invoke('import-investment-transactions', {
        portfolioId,
        csvData,
        mapping,
      });

      if (result.success) {
        setImportResult(result);
        setStep('complete');
        onImportComplete?.();
      } else {
        setError(result.error || 'Import failed');
        setStep('preview');
      }
    } catch (err) {
      console.error('Error importing transactions:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStep('preview');
    }
  };

  const handleClose = () => {
    setStep('upload');
    setCsvData('');
    setCsvHeaders([]);
    setMapping({
      date: '',
      type: '',
      ticker: '',
      quantity: '',
      price: '',
      amount: '',
      fee: '',
      description: '',
    });
    setValidationResult(null);
    setImportResult(null);
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Import Investment Transactions
        </h3>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Upload a CSV file containing your investment transactions.
            </p>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-upload"
              />
              <label
                htmlFor="csv-upload"
                className="cursor-pointer inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
              >
                Choose CSV File
              </label>
            </div>
          </div>
        )}

        {/* Step: Mapping */}
        {step === 'mapping' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Map CSV columns to transaction fields. Required fields are marked with *.
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date Column *
                </label>
                <select
                  value={mapping.date}
                  onChange={(e) => setMapping({ ...mapping, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select column...</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type Column *
                </label>
                <select
                  value={mapping.type}
                  onChange={(e) => setMapping({ ...mapping, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select column...</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ticker Column *
                </label>
                <select
                  value={mapping.ticker}
                  onChange={(e) => setMapping({ ...mapping, ticker: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select column...</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount Column *
                </label>
                <select
                  value={mapping.amount}
                  onChange={(e) => setMapping({ ...mapping, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select column...</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity Column
                </label>
                <select
                  value={mapping.quantity}
                  onChange={(e) => setMapping({ ...mapping, quantity: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select column...</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price Column
                </label>
                <select
                  value={mapping.price}
                  onChange={(e) => setMapping({ ...mapping, price: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select column...</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleValidate}
                className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700"
              >
                Validate & Preview
              </button>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && validationResult && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">
                Validation successful! {validationResult.rowCount} transactions ready to import.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700"
              >
                Import Transactions
              </button>
            </div>
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div className="text-center py-8">
            <p className="text-gray-600">Importing transactions...</p>
          </div>
        )}

        {/* Step: Complete */}
        {step === 'complete' && importResult && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">
                Import complete! {importResult.imported} transactions imported.
                {importResult.skipped > 0 && ` ${importResult.skipped} skipped.`}
              </p>
            </div>

            <button
              onClick={handleClose}
              className="w-full px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
