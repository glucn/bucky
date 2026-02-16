import { AccountGroup, Account, GroupedAccountsView } from '../types';
import { OverviewDashboardPayload } from '../../shared/overview';

interface AutoCategorizationRuleListItem {
  id: string;
  pattern: string;
  matchType: "exact" | "keyword";
  targetCategoryAccountId: string | null;
  targetCategoryName: string | null;
  lastUpdatedAt: Date;
  status: "Valid" | "Invalid target";
}

interface AutoCategorizationRuleUpdateInput {
  pattern: string;
  matchType: "exact" | "keyword";
  targetCategoryAccountId: string;
}

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
  
  // Transaction reordering operations
  moveTransactionUp(entryId: string): Promise<{ success: boolean; error?: string }>;
  moveTransactionDown(entryId: string): Promise<{ success: boolean; error?: string }>;

  // Opening balance operations
  setOpeningBalance(data: { accountId: string; displayAmount: number; asOfDate: string }): Promise<any>;
  getOpeningBalance(accountId: string): Promise<{ entryId: string; accountId: string; displayAmount: number; date: string } | null>;

  // Overview dashboard operations
  getOverviewDashboard(asOfDate?: string): Promise<OverviewDashboardPayload>;

  // Auto-categorization rule operations
  getAutoCategorizationRules(): Promise<AutoCategorizationRuleListItem[]>;
  updateAutoCategorizationRule(
    ruleId: string,
    update: AutoCategorizationRuleUpdateInput
  ): Promise<AutoCategorizationRuleListItem>;
  deleteAutoCategorizationRule(ruleId: string): Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
