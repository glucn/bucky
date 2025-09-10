import { AccountType } from "../shared/accountTypes";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  subtype: string;
  isArchived: boolean;
  archivedAt?: string | null;
  balance?: number; // Added for accounts-with-balances
};

interface IElectronAPI {
  ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
    on(channel: string, listener: (...args: any[]) => void): void;
  };
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}

export function toAccountType(
  type: string,
  fallback: AccountType = AccountType.Cash
): AccountType {
  return (Object.values(AccountType) as string[]).includes(type)
    ? (type as AccountType)
    : fallback;
}
