import { AccountType } from "../shared/accountTypes";
import { OverviewDashboardPayload } from "../shared/overview";
import { LiabilityProfileInput, LiabilityTemplate } from "../shared/liabilityTypes";

export type AccountGroup = {
  id: string;
  name: string;
  accountType: AccountType;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  accounts?: Account[];
  aggregateBalance?: number;
  aggregateBalances?: Record<string, number>;
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  subtype: string;
  isArchived: boolean;
  archivedAt?: string | null;
  balance?: number; // Added for accounts-with-balances
  groupId?: string | null;
  group?: AccountGroup;
};

export type GroupedAccountsView = {
  groups: AccountGroup[];
  ungroupedAccounts: Account[];
};

type AutoCategorizationRuleListItem = {
  id: string;
  pattern: string;
  matchType: "exact" | "keyword";
  targetCategoryAccountId: string | null;
  targetCategoryName: string | null;
  lastUpdatedAt: string;
  status: "Valid" | "Invalid target";
};

type AutoCategorizationRuleUpdateInput = {
  pattern: string;
  matchType: "exact" | "keyword";
  targetCategoryAccountId: string;
};

type EnrichmentRunScope = {
  securityMetadata: boolean;
  securityPrices: boolean;
  fxRates: boolean;
};

type EnrichmentRunCategoryProgress = {
  total: number;
  processed: number;
};

type EnrichmentRunSummary = {
  id: string;
  status: "running" | "completed" | "completed_with_issues" | "canceled";
  startedAt: string;
  endedAt: string | null;
  categoryProgress: {
    securityMetadata: EnrichmentRunCategoryProgress;
    securityPrices: EnrichmentRunCategoryProgress;
    fxRates: EnrichmentRunCategoryProgress;
  };
  failedItems: Array<{
    category: "securityMetadata" | "securityPrices" | "fxRates";
    identifier: string;
    reason: string;
  }>;
};

type BaseCurrencyReconciliationState = {
  targetBaseCurrency: string;
  status: "pending" | "resolved";
  changedAt: string;
  resolvedAt?: string;
};

interface IElectronAPI {
  ipcRenderer: {
    invoke(channel: string, ...args: any[]): Promise<any>;
    on(channel: string, listener: (...args: any[]) => void): void;
  };
  
  // Account Group operations
  createAccountGroup(data: { name: string; accountType: string }): Promise<{ success: boolean; group?: AccountGroup; error?: string }>;
  getAccountGroups(accountType?: string): Promise<{ success: boolean; groups?: AccountGroup[]; error?: string }>;
  updateAccountGroup(id: string, data: { name?: string; displayOrder?: number }): Promise<{ success: boolean; group?: AccountGroup; error?: string }>;
  deleteAccountGroup(id: string): Promise<{ success: boolean; group?: AccountGroup; error?: string }>;
  
  // Account-Group relationship operations
  addAccountToGroup(accountId: string, groupId: string): Promise<{ success: boolean; account?: Account; error?: string }>;
  removeAccountFromGroup(accountId: string): Promise<{ success: boolean; account?: Account; error?: string }>;
  
  // Query operations
  getAccountsWithGroups(params: { includeArchived?: boolean; accountType?: string }): Promise<{ success: boolean; data?: GroupedAccountsView; error?: string }>;
  reorderAccountGroups(groupOrders: Array<{ id: string; displayOrder: number }>): Promise<{ success: boolean; error?: string }>;
  
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

  // Data enrichment operations
  getEnrichmentPanelState(): Promise<{
    activeRun: EnrichmentRunSummary | null;
    latestSummary: EnrichmentRunSummary | null;
    freshness: {
      metadata: string | null;
      prices: string | null;
      fx: string | null;
    };
  }>;
  startEnrichmentRun(
    scope: EnrichmentRunScope
  ): Promise<{ createdNewRun: boolean; run: EnrichmentRunSummary }>;
  cancelEnrichmentRun(runId: string): Promise<{ success: boolean }>;
  sendEnrichmentRunToBackground(runId: string): Promise<{ success: boolean }>;
  getEnrichmentRunSummary(runId: string): Promise<EnrichmentRunSummary | null>;
  getEnrichmentConfigState(): Promise<{
    providerConfigured: boolean;
    baseCurrencyConfigured: boolean;
  }>;

  // Generic app settings operations
  getAppSetting(key: string): Promise<unknown | null>;
  setAppSetting(key: string, value: unknown): Promise<{ success: boolean }>;
  getBaseCurrencyImpactState(): Promise<{
    baseCurrency: string | null;
    reconciliation: BaseCurrencyReconciliationState | null;
  }>;

  // Liability profile operations
  getLiabilityProfile(accountId: string): Promise<{ success: boolean; profile?: any; error?: string }>;
  upsertLiabilityProfile(data: { accountId: string; profile: LiabilityProfileInput }): Promise<{ success: boolean; profile?: any; error?: string }>;
  saveLiabilityVersion(data: { accountId: string; profile: LiabilityProfileInput }): Promise<{ success: boolean; version?: any; error?: string }>;
  convertLiabilityTemplate(data: {
    accountId: string;
    targetTemplate: LiabilityTemplate;
    profile: Omit<LiabilityProfileInput, "template">;
  }): Promise<{ success: boolean; profile?: any; error?: string }>;
  getLiabilityVersionHistory(accountId: string): Promise<{ success: boolean; history?: any[]; error?: string }>;
  getLiabilityMetrics(accountId: string): Promise<{ success: boolean; metrics?: any; error?: string }>;
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
