import React, { createContext, useContext, useCallback, useState, useEffect, ReactNode } from "react";
import { Account } from "../types";

// Context type
type AccountsContextType = {
  accounts: Account[];
  refreshAccounts: () => Promise<void>;
  loading: boolean;
  error: Error | null;
};

const AccountsContext = createContext<AccountsContextType | undefined>(undefined);

export const useAccounts = () => {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error("useAccounts must be used within AccountsProvider");
  return ctx;
};

export const AccountsProvider = ({ children }: { children: ReactNode }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refreshAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use IPC to get accounts with balances from the main process
      const data = await window.electron.ipcRenderer.invoke("get-accounts-with-balances");
      setAccounts(
        data.map((acc: any) => ({
          ...acc,
          archivedAt: acc.archivedAt ? new Date(acc.archivedAt).toISOString() : null,
          createdAt: acc.createdAt ? new Date(acc.createdAt).toISOString() : undefined,
          updatedAt: acc.updatedAt ? new Date(acc.updatedAt).toISOString() : undefined,
          balance: typeof acc.balance === "number" ? acc.balance : undefined,
        }))
      );
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  return (
    <AccountsContext.Provider value={{ accounts, refreshAccounts, loading, error }}>
      {children}
    </AccountsContext.Provider>
  );
};