import { AccountGroup, Account, GroupedAccountsView } from '../types';
import { OverviewDashboardPayload } from '../../shared/overview';
import { LiabilityProfileInput, LiabilityTemplate } from '../../shared/liabilityTypes';

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

interface EnrichmentRunScope {
  securityMetadata: boolean;
  securityPrices: boolean;
  fxRates: boolean;
}

interface EnrichmentRunSummary {
  id: string;
  status: "running" | "completed" | "completed_with_issues" | "canceled";
  startedAt: Date;
  endedAt: Date | null;
  categoryProgress: {
    securityMetadata: { total: number; processed: number };
    securityPrices: { total: number; processed: number };
    fxRates: { total: number; processed: number };
  };
  failedItems: Array<{
    category: "securityMetadata" | "securityPrices" | "fxRates";
    identifier: string;
    reason: string;
  }>;
}

interface BaseCurrencyReconciliationState {
  targetBaseCurrency: string;
  status: "pending" | "resolved";
  changedAt: string;
  resolvedAt?: string;
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
