import React, { useState, useEffect } from "react";
import { AccountType, AccountSubtype } from "../../shared/accountTypes";
import { SUPPORTED_CURRENCY_OPTIONS } from "../../shared/currencies";
import LiabilityProfileModal from "./LiabilityProfileModal";
import { LiabilityTemplate } from "../../shared/liabilityTypes";

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
  const [baseCurrencyAtOpen, setBaseCurrencyAtOpen] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [openingBalanceAmount, setOpeningBalanceAmount] = useState("");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [openingBalanceError, setOpeningBalanceError] = useState<string | null>(null);
  const [showLiabilitySetup, setShowLiabilitySetup] = useState(false);
  const [createdAccountId, setCreatedAccountId] = useState<string | null>(null);
  const [selectedLiabilityTemplate, setSelectedLiabilityTemplate] = useState<LiabilityTemplate>(
    LiabilityTemplate.Blank
  );

  // Fetch available groups
  useEffect(() => {
    if (isOpen) {
      const initialize = async () => {
        await fetchGroups();
        const impactState = await window.electron.getBaseCurrencyImpactState();
        const baseCurrency = impactState.baseCurrency || "USD";
        setBaseCurrencyAtOpen(baseCurrency);
        // Reset form when modal opens
        setNewAccount({
          name: "",
          type: AccountType.User,
          currency: baseCurrency,
          subtype: AccountSubtype.Asset,
        });
        setSelectedLiabilityTemplate(LiabilityTemplate.Blank);
        setSelectedGroupId("");
        setOpeningBalanceAmount("");
        setOpeningBalanceDate(new Date().toISOString().split("T")[0]);
        setOpeningBalanceError(null);
      };

      void initialize();
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

    if (parsedOpeningBalance !== null && !Number.isFinite(parsedOpeningBalance)) {
      setOpeningBalanceError("Please enter a valid opening balance.");
      return;
    }

    if (!openingBalanceDate) {
      setOpeningBalanceError("Please provide an as-of date for opening balance.");
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
      
      if (newAccount.subtype === AccountSubtype.Liability && result?.account?.id) {
        setCreatedAccountId(result.account.id);
        setShowLiabilitySetup(true);
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
        setNewAccount({ name: "", type: AccountType.User, currency: baseCurrencyAtOpen, subtype: AccountSubtype.Asset });
        setSelectedLiabilityTemplate(LiabilityTemplate.Blank);
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

  const handleLiabilitySetupComplete = () => {
    setShowLiabilitySetup(false);
    setCreatedAccountId(null);
    setNewAccount({ name: "", type: AccountType.User, currency: baseCurrencyAtOpen, subtype: AccountSubtype.Asset });
    setSelectedLiabilityTemplate(LiabilityTemplate.Blank);
    setSelectedGroupId("");
    onAccountCreated();
    onClose();
  };

  const handleLiabilitySetupSkip = () => {
    setShowLiabilitySetup(false);
    setCreatedAccountId(null);
    setNewAccount({ name: "", type: AccountType.User, currency: baseCurrencyAtOpen, subtype: AccountSubtype.Asset });
    setSelectedLiabilityTemplate(LiabilityTemplate.Blank);
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
              htmlFor="accountKind"
              className="block text-sm font-medium text-gray-700"
            >
              Account Kind
            </label>
            <select
              id="accountKind"
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

          {newAccount.subtype === AccountSubtype.Liability && (
            <div>
              <label
                htmlFor="liabilityTemplate"
                className="block text-sm font-medium text-gray-700"
              >
                Liability Template
              </label>
              <select
                id="liabilityTemplate"
                value={selectedLiabilityTemplate}
                onChange={(e) =>
                  setSelectedLiabilityTemplate(e.target.value as LiabilityTemplate)
                }
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              >
                <option value={LiabilityTemplate.CreditCard}>Credit Card</option>
                <option value={LiabilityTemplate.LoanMortgage}>Loan/Mortgage</option>
                <option value={LiabilityTemplate.PersonalDebt}>Personal Debt</option>
                <option value={LiabilityTemplate.Blank}>Blank</option>
              </select>
            </div>
          )}
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
              {SUPPORTED_CURRENCY_OPTIONS.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} - {currency.label}
                </option>
              ))}
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
                  data-testid="opening-balance-amount-input"
                  disabled={newAccount.subtype === AccountSubtype.Liability}
                />
                {newAccount.subtype === AccountSubtype.Liability && (
                  <p className="mt-1 text-xs text-gray-500">
                    Set balance owed during liability profile setup.
                  </p>
                )}
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
                  data-testid="opening-balance-date-input"
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
      
       {showLiabilitySetup && createdAccountId && (
         <LiabilityProfileModal
           accountId={createdAccountId}
           isOpen={showLiabilitySetup}
           initialTemplate={selectedLiabilityTemplate}
           allowSkip={selectedLiabilityTemplate === LiabilityTemplate.Blank}
           onClose={handleLiabilitySetupSkip}
           onSuccess={handleLiabilitySetupComplete}
         />
       )}
    </div>
  );
};
