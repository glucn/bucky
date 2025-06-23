import { AccountType } from "../shared/accountTypes";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
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
