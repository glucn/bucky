import React, { useState } from "react";
import { AccountType, toAccountType, AccountSubtype } from "../../shared/accountTypes";
import { CreditCardSetupModal } from "./CreditCardSetupModal";

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountCreated: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  onAccountCreated,
}) => {
  const [newAccount, setNewAccount] = useState({
    name: "",
    type: AccountType.User,
    currency: "USD",
    subtype: AccountSubtype.Asset,
  });
  const [loading, setLoading] = useState(false);
  const [showCreditCardSetup, setShowCreditCardSetup] = useState(false);
  const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);
  const [selectedTypeValue, setSelectedTypeValue] = useState<string>("cash"); // Track raw dropdown value

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const result = await window.electron.ipcRenderer.invoke("add-account", newAccount);
      
      // Check if this is a credit card account using the tracked dropdown value
      const isCreditCard = selectedTypeValue === "credit" && newAccount.subtype === AccountSubtype.Liability;
      
      if (isCreditCard && result?.account?.id) {
        // Store the created account ID and show credit card setup modal
        setCreatedAccountId(result.account.id);
        setShowCreditCardSetup(true);
      } else {
        // For non-credit card accounts, close immediately
        setNewAccount({ name: "", type: AccountType.User, currency: "USD", subtype: AccountSubtype.Asset });
        setSelectedTypeValue("cash");
        onAccountCreated();
        onClose();
      }
    } catch (error) {
      console.error("Error creating account:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreditCardSetupComplete = () => {
    setShowCreditCardSetup(false);
    setCreatedAccountId(null);
    setNewAccount({ name: "", type: AccountType.User, currency: "USD", subtype: AccountSubtype.Asset });
    setSelectedTypeValue("cash");
    onAccountCreated();
    onClose();
  };

  const handleCreditCardSetupSkip = () => {
    setShowCreditCardSetup(false);
    setCreatedAccountId(null);
    setNewAccount({ name: "", type: AccountType.User, currency: "USD", subtype: AccountSubtype.Asset });
    setSelectedTypeValue("cash");
    onAccountCreated();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Add New Account
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              Account Name
            </label>
            <input
              type="text"
              id="name"
              value={newAccount.name}
              onChange={(e) =>
                setNewAccount({ ...newAccount, name: e.target.value })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              required
            />
          </div>
          <div>
            <label
              htmlFor="type"
              className="block text-sm font-medium text-gray-700"
            >
              Account Type
            </label>
            <select
              id="type"
              value={selectedTypeValue}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedTypeValue(value);
                // Automatically set subtype to Liability for credit cards
                const subtype = value === "credit" ? AccountSubtype.Liability : newAccount.subtype;
                setNewAccount({
                  ...newAccount,
                  type: toAccountType(value),
                  subtype,
                });
              }}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="credit">Credit Card</option>
              <option value="investment">Investment</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="subtype"
              className="block text-sm font-medium text-gray-700"
            >
              Account Subtype
            </label>
            <select
              id="subtype"
              value={newAccount.subtype}
              onChange={(e) =>
                setNewAccount({
                  ...newAccount,
                  subtype: e.target.value as AccountSubtype,
                })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value={AccountSubtype.Asset}>Asset</option>
              <option value={AccountSubtype.Liability}>Liability</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="currency"
              className="block text-sm font-medium text-gray-700"
            >
              Currency
            </label>
            <select
              id="currency"
              value={newAccount.currency}
              onChange={(e) =>
                setNewAccount({ ...newAccount, currency: e.target.value })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="USD">USD</option>
              <option value="CAD">CAD</option>
              <option value="CNY">CNY</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="JPY">JPY</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            disabled={loading}
          >
            {loading ? "Adding..." : "Add Account"}
          </button>
        </form>
      </div>
      
      {/* Credit Card Setup Modal */}
      {showCreditCardSetup && createdAccountId && (
        <CreditCardSetupModal
          accountId={createdAccountId}
          isOpen={showCreditCardSetup}
          onClose={handleCreditCardSetupSkip}
          onSuccess={handleCreditCardSetupComplete}
        />
      )}
    </div>
  );
};