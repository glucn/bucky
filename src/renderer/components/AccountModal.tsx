import React, { useState, useEffect } from "react";
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
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [openingBalanceAmount, setOpeningBalanceAmount] = useState("");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [openingBalanceError, setOpeningBalanceError] = useState<string | null>(null);
  const [showCreditCardSetup, setShowCreditCardSetup] = useState(false);
  const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);
  const [selectedTypeValue, setSelectedTypeValue] = useState<string>("cash"); // Track raw dropdown value

  // Fetch available groups
  useEffect(() => {
    if (isOpen) {
      fetchGroups();
      // Reset form when modal opens
      setNewAccount({ name: "", type: AccountType.User, currency: "USD", subtype: AccountSubtype.Asset });
      setSelectedTypeValue("cash");
      setSelectedGroupId("");
      setOpeningBalanceAmount("");
      setOpeningBalanceDate(new Date().toISOString().split("T")[0]);
      setOpeningBalanceError(null);
    }
  }, [isOpen]);

  const fetchGroups = async () => {
    try {
      const response = await window.electron.ipcRenderer.invoke("get-account-groups", AccountType.User);
      if (response.success) {
        setAvailableGroups(response.groups || []);
      }
    } catch (err) {
      console.error("Failed to fetch groups:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpeningBalanceError(null);

    const trimmedAmount = openingBalanceAmount.trim();
    const parsedOpeningBalance = trimmedAmount === "" ? null : Number(trimmedAmount);

    if (parsedOpeningBalance !== null && Number.isNaN(parsedOpeningBalance)) {
      setOpeningBalanceError("Please enter a valid opening balance.");
      return;
    }

    setLoading(true);
    
    try {
      const result = await window.electron.ipcRenderer.invoke("add-account", newAccount);
      
      // If a group was selected, add the account to the group
      if (result?.account?.id && selectedGroupId) {
        try {
          await window.electron.ipcRenderer.invoke("add-account-to-group", {
            accountId: result.account.id,
            groupId: selectedGroupId,
          });
        } catch (groupErr) {
          console.error("Failed to add account to group:", groupErr);
          // Don't fail the whole operation if group assignment fails
        }
      }
      
      // Check if this is a credit card account using the tracked dropdown value
      const isCreditCard = selectedTypeValue === "credit" && newAccount.subtype === AccountSubtype.Liability;
      
      if (isCreditCard && result?.account?.id) {
        if (parsedOpeningBalance !== null && parsedOpeningBalance !== 0) {
          try {
            await window.electron.setOpeningBalance({
              accountId: result.account.id,
              displayAmount: parsedOpeningBalance,
              asOfDate: openingBalanceDate,
            });
          } catch (balanceError) {
            console.error("Failed to set opening balance:", balanceError);
          }
        }
        // Store the created account ID and show credit card setup modal
        setCreatedAccountId(result.account.id);
        setShowCreditCardSetup(true);
      } else {
        if (parsedOpeningBalance !== null && parsedOpeningBalance !== 0) {
          try {
            await window.electron.setOpeningBalance({
              accountId: result.account.id,
              displayAmount: parsedOpeningBalance,
              asOfDate: openingBalanceDate,
            });
          } catch (balanceError) {
            console.error("Failed to set opening balance:", balanceError);
          }
        }
        // For non-credit card accounts, close immediately
        setNewAccount({ name: "", type: AccountType.User, currency: "USD", subtype: AccountSubtype.Asset });
        setSelectedTypeValue("cash");
        setSelectedGroupId("");
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
    setSelectedGroupId("");
    onAccountCreated();
    onClose();
  };

  const handleCreditCardSetupSkip = () => {
    setShowCreditCardSetup(false);
    setCreatedAccountId(null);
    setNewAccount({ name: "", type: AccountType.User, currency: "USD", subtype: AccountSubtype.Asset });
    setSelectedTypeValue("cash");
    setSelectedGroupId("");
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
        {openingBalanceError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-3">
            {openingBalanceError}
          </div>
        )}
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
          
          {availableGroups.length > 0 && (
            <div>
              <label
                htmlFor="accountGroup"
                className="block text-sm font-medium text-gray-700"
              >
                Group (Optional)
              </label>
              <select
                id="accountGroup"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              >
                <option value="">No Group</option>
                {availableGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Assign this account to a group for better organization
              </p>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Opening Balance</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {newAccount.subtype === AccountSubtype.Liability
                    ? "Balance owed"
                    : "Balance"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={openingBalanceAmount}
                  onChange={(e) => setOpeningBalanceAmount(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  As of date
                </label>
                <input
                  type="date"
                  value={openingBalanceDate}
                  onChange={(e) => setOpeningBalanceDate(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  required
                />
              </div>
            </div>
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
