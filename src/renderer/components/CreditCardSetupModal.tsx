import React, { useState } from "react";

interface CreditCardSetupModalProps {
  accountId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingProperties?: {
    creditLimit: number;
    interestRate: number;
    statementClosingDay: number;
    paymentDueDay: number;
    minimumPaymentPercent: number;
    effectiveDate: string;
  } | null;
}

export const CreditCardSetupModal: React.FC<CreditCardSetupModalProps> = ({
  accountId,
  isOpen,
  onClose,
  onSuccess,
  existingProperties,
}) => {
  const [formData, setFormData] = useState({
    creditLimit: existingProperties?.creditLimit?.toString() || "",
    interestRate: existingProperties?.interestRate ? (existingProperties.interestRate * 100).toFixed(2) : "",
    statementClosingDay: existingProperties?.statementClosingDay?.toString() || "",
    paymentDueDay: existingProperties?.paymentDueDay?.toString() || "",
    minimumPaymentPercent: existingProperties?.minimumPaymentPercent ? (existingProperties.minimumPaymentPercent * 100).toFixed(2) : "",
    effectiveDate: existingProperties?.effectiveDate || new Date().toISOString().split("T")[0],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Credit limit validation
    const creditLimit = parseFloat(formData.creditLimit);
    if (!formData.creditLimit || isNaN(creditLimit) || creditLimit <= 0) {
      newErrors.creditLimit = "Credit limit must be a positive number";
    }

    // Interest rate validation (0-100%)
    const interestRate = parseFloat(formData.interestRate);
    if (!formData.interestRate || isNaN(interestRate) || interestRate < 0 || interestRate > 100) {
      newErrors.interestRate = "Interest rate must be between 0 and 100";
    }

    // Statement closing day validation (1-31)
    const statementClosingDay = parseInt(formData.statementClosingDay);
    if (!formData.statementClosingDay || isNaN(statementClosingDay) || statementClosingDay < 1 || statementClosingDay > 31) {
      newErrors.statementClosingDay = "Statement closing day must be between 1 and 31";
    }

    // Payment due day validation (1-31)
    const paymentDueDay = parseInt(formData.paymentDueDay);
    if (!formData.paymentDueDay || isNaN(paymentDueDay) || paymentDueDay < 1 || paymentDueDay > 31) {
      newErrors.paymentDueDay = "Payment due day must be between 1 and 31";
    }

    // Payment due day must be after statement closing day
    if (!isNaN(statementClosingDay) && !isNaN(paymentDueDay) && paymentDueDay <= statementClosingDay) {
      newErrors.paymentDueDay = "Payment due day must be after statement closing day";
    }

    // Minimum payment percentage validation (0-100%)
    const minimumPaymentPercent = parseFloat(formData.minimumPaymentPercent);
    if (!formData.minimumPaymentPercent || isNaN(minimumPaymentPercent) || minimumPaymentPercent < 0 || minimumPaymentPercent > 100) {
      newErrors.minimumPaymentPercent = "Minimum payment percentage must be between 0 and 100";
    }

    // Effective date validation
    if (!formData.effectiveDate) {
      newErrors.effectiveDate = "Effective date is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const properties = {
        creditLimit: parseFloat(formData.creditLimit),
        interestRate: parseFloat(formData.interestRate) / 100, // Convert percentage to decimal
        statementClosingDay: parseInt(formData.statementClosingDay),
        paymentDueDay: parseInt(formData.paymentDueDay),
        minimumPaymentPercent: parseFloat(formData.minimumPaymentPercent) / 100, // Convert percentage to decimal
        effectiveDate: formData.effectiveDate,
      };

      const method = existingProperties ? "update-credit-card-properties" : "setup-credit-card";
      const result = await window.electron.ipcRenderer.invoke(method, {
        accountId,
        properties,
      });

      if (result.success) {
        onSuccess();
        onClose();
      } else {
        setGeneralError(result.error || "Failed to save credit card properties");
      }
    } catch (error) {
      console.error("Error saving credit card properties:", error);
      setGeneralError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-2xl"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          {existingProperties ? "Update Credit Card Properties" : "Set Up Credit Card"}
        </h2>

        {generalError && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {generalError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Credit Limit */}
            <div>
              <label htmlFor="creditLimit" className="block text-sm font-medium text-gray-700">
                Credit Limit ($)
              </label>
              <input
                type="number"
                id="creditLimit"
                step="0.01"
                value={formData.creditLimit}
                onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })}
                className={`mt-1 block w-full rounded-md shadow-sm focus:ring-primary-500 sm:text-sm ${
                  errors.creditLimit ? "border-red-300 focus:border-red-500" : "border-gray-300 focus:border-primary-500"
                }`}
                placeholder="5000.00"
              />
              {errors.creditLimit && (
                <p className="mt-1 text-sm text-red-600">{errors.creditLimit}</p>
              )}
            </div>

            {/* Interest Rate (APR) */}
            <div>
              <label htmlFor="interestRate" className="block text-sm font-medium text-gray-700">
                Interest Rate (APR %)
              </label>
              <input
                type="number"
                id="interestRate"
                step="0.01"
                value={formData.interestRate}
                onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
                className={`mt-1 block w-full rounded-md shadow-sm focus:ring-primary-500 sm:text-sm ${
                  errors.interestRate ? "border-red-300 focus:border-red-500" : "border-gray-300 focus:border-primary-500"
                }`}
                placeholder="18.99"
              />
              {errors.interestRate && (
                <p className="mt-1 text-sm text-red-600">{errors.interestRate}</p>
              )}
            </div>

            {/* Statement Closing Day */}
            <div>
              <label htmlFor="statementClosingDay" className="block text-sm font-medium text-gray-700">
                Statement Closing Day (1-31)
              </label>
              <input
                type="number"
                id="statementClosingDay"
                min="1"
                max="31"
                value={formData.statementClosingDay}
                onChange={(e) => setFormData({ ...formData, statementClosingDay: e.target.value })}
                className={`mt-1 block w-full rounded-md shadow-sm focus:ring-primary-500 sm:text-sm ${
                  errors.statementClosingDay ? "border-red-300 focus:border-red-500" : "border-gray-300 focus:border-primary-500"
                }`}
                placeholder="15"
              />
              {errors.statementClosingDay && (
                <p className="mt-1 text-sm text-red-600">{errors.statementClosingDay}</p>
              )}
            </div>

            {/* Payment Due Day */}
            <div>
              <label htmlFor="paymentDueDay" className="block text-sm font-medium text-gray-700">
                Payment Due Day (1-31)
              </label>
              <input
                type="number"
                id="paymentDueDay"
                min="1"
                max="31"
                value={formData.paymentDueDay}
                onChange={(e) => setFormData({ ...formData, paymentDueDay: e.target.value })}
                className={`mt-1 block w-full rounded-md shadow-sm focus:ring-primary-500 sm:text-sm ${
                  errors.paymentDueDay ? "border-red-300 focus:border-red-500" : "border-gray-300 focus:border-primary-500"
                }`}
                placeholder="25"
              />
              {errors.paymentDueDay && (
                <p className="mt-1 text-sm text-red-600">{errors.paymentDueDay}</p>
              )}
            </div>

            {/* Minimum Payment Percentage */}
            <div>
              <label htmlFor="minimumPaymentPercent" className="block text-sm font-medium text-gray-700">
                Minimum Payment (%)
              </label>
              <input
                type="number"
                id="minimumPaymentPercent"
                step="0.01"
                value={formData.minimumPaymentPercent}
                onChange={(e) => setFormData({ ...formData, minimumPaymentPercent: e.target.value })}
                className={`mt-1 block w-full rounded-md shadow-sm focus:ring-primary-500 sm:text-sm ${
                  errors.minimumPaymentPercent ? "border-red-300 focus:border-red-500" : "border-gray-300 focus:border-primary-500"
                }`}
                placeholder="2.00"
              />
              {errors.minimumPaymentPercent && (
                <p className="mt-1 text-sm text-red-600">{errors.minimumPaymentPercent}</p>
              )}
            </div>

            {/* Effective Date */}
            <div>
              <label htmlFor="effectiveDate" className="block text-sm font-medium text-gray-700">
                Effective Date
              </label>
              <input
                type="date"
                id="effectiveDate"
                value={formData.effectiveDate}
                onChange={(e) => setFormData({ ...formData, effectiveDate: e.target.value })}
                className={`mt-1 block w-full rounded-md shadow-sm focus:ring-primary-500 sm:text-sm ${
                  errors.effectiveDate ? "border-red-300 focus:border-red-500" : "border-gray-300 focus:border-primary-500"
                }`}
              />
              {errors.effectiveDate && (
                <p className="mt-1 text-sm text-red-600">{errors.effectiveDate}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                {existingProperties ? "Date when these new properties take effect" : "Date when credit card properties become active"}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
            >
              {loading ? "Saving..." : existingProperties ? "Update Properties" : "Set Up Credit Card"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
