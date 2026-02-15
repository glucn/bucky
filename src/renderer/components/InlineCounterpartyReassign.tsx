import React, { useMemo, useState } from "react";
import { CleanupDestinationAccount, buildCleanupDestinationOptions, filterCleanupDestinationOptions } from "../utils/placeholderCleanup";

interface InlineCounterpartyReassignProps {
  accounts: CleanupDestinationAccount[];
  fromAccountId: string;
  onApply: (toAccountId: string) => void;
  isSubmitting: boolean;
  error?: string | null;
}

export const InlineCounterpartyReassign: React.FC<InlineCounterpartyReassignProps> = ({
  accounts,
  fromAccountId,
  onApply,
  isSubmitting,
  error,
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [query, setQuery] = useState("");
  const [showAllAccounts, setShowAllAccounts] = useState(false);

  const options = useMemo(() => {
    const built = buildCleanupDestinationOptions(accounts, {
      includeUserAccounts: showAllAccounts,
      excludeAccountId: fromAccountId,
    });
    return filterCleanupDestinationOptions(built, query);
  }, [accounts, fromAccountId, query, showAllAccounts]);

  return (
    <div className="space-y-2" data-testid="cleanup-inline-reassign">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-700 flex items-center gap-1">
          <input
            type="checkbox"
            checked={showAllAccounts}
            onChange={(event) => setShowAllAccounts(event.target.checked)}
            data-testid="cleanup-show-all-toggle"
          />
          Show all accounts
        </label>
      </div>
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search destination"
        className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
        data-testid="cleanup-destination-search"
      />
      <div className="flex items-center gap-2">
        <select
          value={selectedAccountId}
          onChange={(event) => setSelectedAccountId(event.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
          data-testid="cleanup-destination-picker"
          disabled={isSubmitting}
        >
          <option value="">Select destination</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.group === "category" ? "Category" : "Account"}: {option.name}
            </option>
          ))}
        </select>
        <button
          className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          type="button"
          data-testid="cleanup-apply-button"
          disabled={!selectedAccountId || isSubmitting}
          onClick={() => onApply(selectedAccountId)}
        >
          {isSubmitting ? "Applying..." : "Apply"}
        </button>
      </div>
      {error && (
        <div className="text-xs text-red-600" data-testid="cleanup-row-error">
          {error}
        </div>
      )}
    </div>
  );
};
