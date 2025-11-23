import { AccountGroup, Account, GroupedAccountsView } from '../types';

export interface IElectronAPI {
  ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
    on(channel: string, listener: (...args: any[]) => void): void;
  };
  
  // Account Group operations
  createAccountGroup(data: { name: string; accountType: string }): Promise<AccountGroup>;
  getAccountGroups(accountType?: string): Promise<AccountGroup[]>;
  updateAccountGroup(id: string, data: { name?: string; displayOrder?: number }): Promise<AccountGroup>;
  deleteAccountGroup(id: string): Promise<AccountGroup>;
  
  // Account-Group relationship operations
  addAccountToGroup(accountId: string, groupId: string): Promise<Account>;
  removeAccountFromGroup(accountId: string): Promise<Account>;
  
  // Query operations
  getAccountsWithGroups(params: { includeArchived?: boolean; accountType?: string }): Promise<GroupedAccountsView>;
  reorderAccountGroups(groupOrders: Array<{ id: string; displayOrder: number }>): Promise<void>;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
