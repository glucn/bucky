import { AccountType, AccountSubtype } from "../../shared/accountTypes";

export interface CleanupDestinationAccount {
  id: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
}

export interface CleanupDestinationOption {
  id: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  group: "category" | "user";
}

export const isPlaceholderCounterpartyName = (name?: string): boolean => {
  return name === "Uncategorized Income" || name === "Uncategorized Expense";
};

export const buildCleanupDestinationOptions = (
  accounts: CleanupDestinationAccount[],
  config: { includeUserAccounts: boolean; excludeAccountId?: string }
): CleanupDestinationOption[] => {
  const filtered = accounts.filter((account) => {
    if (config.excludeAccountId && account.id === config.excludeAccountId) {
      return false;
    }

    if (account.type === AccountType.Category) {
      return true;
    }

    return config.includeUserAccounts && account.type === AccountType.User;
  });

  const categoryOptions = filtered
    .filter((account) => account.type === AccountType.Category)
    .map((account) => ({
      ...account,
      group: "category" as const,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const userOptions = filtered
    .filter((account) => account.type === AccountType.User)
    .map((account) => ({
      ...account,
      group: "user" as const,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...categoryOptions, ...userOptions];
};

export const filterCleanupDestinationOptions = (
  options: CleanupDestinationOption[],
  query: string
): CleanupDestinationOption[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return options;
  }

  return options.filter((option) => option.name.toLowerCase().includes(normalizedQuery));
};
