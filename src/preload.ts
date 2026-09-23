import { contextBridge, ipcRenderer } from "electron";
import { isAppIpcChannel } from "./shared/ipcChannels";
import type { SecurityApi } from "./shared/security";
import {
  type IncomeExpenseBreakdownFilter,
  type IncomeExpenseTrendFilter,
} from "./shared/reporting";

contextBridge.exposeInMainWorld("electron", {
  security: {
    getState: () => ipcRenderer.invoke("get-security-state"),
    beginSetup: (input) => ipcRenderer.invoke("begin-protected-setup", input),
    confirmSetup: (input) => ipcRenderer.invoke("confirm-protected-setup", input),
    unlock: (input) => ipcRenderer.invoke("unlock-personal-profile", input),
    lock: () => ipcRenderer.invoke("lock-personal-profile"),
    onStateChanged: (listener) => {
      const receive = (_event: unknown, state: any) => listener(state);
      ipcRenderer.on("security-state-changed", receive);
      return () => { ipcRenderer.removeListener("security-state-changed", receive); };
    },
  } satisfies SecurityApi,
  getRecoveryState: () => ipcRenderer.invoke("get-recovery-state"),
  createPersonalBackup: () => ipcRenderer.invoke("create-personal-backup"),
  restorePersonalBackup: () => ipcRenderer.invoke("restore-personal-backup"),
  selectPersonalProfile: (id: string) => ipcRenderer.invoke("select-personal-profile", id),
  ipcRenderer: {
    invoke: async (channel: string, ...args: any[]) => {
      if (!isAppIpcChannel(channel)) throw new Error("Unsupported IPC channel");
      return ipcRenderer.invoke(channel, ...args);
    },
  },
  
  // Account Group operations
  createAccountGroup: (data: { name: string; accountType: string }) =>
    ipcRenderer.invoke("create-account-group", data),
  getAccountGroups: (accountType?: string) =>
    ipcRenderer.invoke("get-account-groups", accountType),
  updateAccountGroup: (id: string, data: { name?: string; displayOrder?: number }) =>
    ipcRenderer.invoke("update-account-group", { id, data }),
  deleteAccountGroup: (id: string) =>
    ipcRenderer.invoke("delete-account-group", id),
  
  // Account-Group relationship operations
  addAccountToGroup: (accountId: string, groupId: string) =>
    ipcRenderer.invoke("add-account-to-group", { accountId, groupId }),
  removeAccountFromGroup: (accountId: string) =>
    ipcRenderer.invoke("remove-account-from-group", accountId),
  
  // Query operations
  getAccountsWithGroups: (params: { includeArchived?: boolean; accountType?: string }) =>
    ipcRenderer.invoke("get-accounts-with-groups", params),
  reorderAccountGroups: (groupOrders: Array<{ id: string; displayOrder: number }>) =>
    ipcRenderer.invoke("reorder-account-groups", groupOrders),
  
  // Transaction reordering operations
  moveTransactionUp: (entryId: string) =>
    ipcRenderer.invoke("move-transaction-up", entryId),
  moveTransactionDown: (entryId: string) =>
    ipcRenderer.invoke("move-transaction-down", entryId),

  // Opening balance operations
  setOpeningBalance: (data: { accountId: string; displayAmount: number; asOfDate: string }) =>
    ipcRenderer.invoke("set-opening-balance", data),
  getOpeningBalance: (accountId: string) =>
    ipcRenderer.invoke("get-opening-balance", accountId),

  // Overview dashboard operations
  getOverviewDashboard: (asOfDate?: string) =>
    ipcRenderer.invoke("get-overview-dashboard", asOfDate),

  getIncomeExpenseTrendReport: (
    filter: IncomeExpenseTrendFilter,
    asOfDate?: string
  ) => ipcRenderer.invoke("get-income-expense-trend-report", filter, asOfDate),
  getIncomeExpenseBreakdownReport: (
    filter: IncomeExpenseBreakdownFilter,
    asOfDate?: string
  ) => ipcRenderer.invoke("get-income-expense-breakdown-report", filter, asOfDate),

  // Auto-categorization rule operations
  getAutoCategorizationRules: () =>
    ipcRenderer.invoke("get-auto-categorization-rules"),
  updateAutoCategorizationRule: (
    ruleId: string,
    update: {
      pattern: string;
      matchType: "exact" | "keyword";
      targetCategoryAccountId: string;
    }
  ) => ipcRenderer.invoke("update-auto-categorization-rule", { ruleId, update }),
  deleteAutoCategorizationRule: (ruleId: string) =>
    ipcRenderer.invoke("delete-auto-categorization-rule", ruleId),

  // Data enrichment operations
  getEnrichmentPanelState: () =>
    ipcRenderer.invoke("get-enrichment-panel-state"),
  startEnrichmentRun: (scope: {
    securityMetadata: boolean;
    securityPrices: boolean;
    fxRates: boolean;
  }) => ipcRenderer.invoke("start-enrichment-run", scope),
  cancelEnrichmentRun: (runId: string) =>
    ipcRenderer.invoke("cancel-enrichment-run", runId),
  sendEnrichmentRunToBackground: (runId: string) =>
    ipcRenderer.invoke("send-enrichment-run-to-background", runId),
  getEnrichmentRunSummary: (runId: string) =>
    ipcRenderer.invoke("get-enrichment-run-summary", runId),
  getEnrichmentConfigState: () =>
    ipcRenderer.invoke("get-enrichment-config-state"),

  // Generic app settings operations
  getAppSetting: (key: string) =>
    ipcRenderer.invoke("get-app-setting", key),
  setAppSetting: (key: string, value: unknown) =>
    ipcRenderer.invoke("set-app-setting", { key, value }),
  getBaseCurrencyImpactState: () =>
    ipcRenderer.invoke("get-base-currency-impact-state"),

  // Liability profile operations
  getLiabilityProfile: (accountId: string) =>
    ipcRenderer.invoke("get-liability-profile", accountId),
  upsertLiabilityProfile: (data: { accountId: string; profile: Record<string, unknown> }) =>
    ipcRenderer.invoke("upsert-liability-profile", data),
  saveLiabilityVersion: (data: { accountId: string; profile: Record<string, unknown> }) =>
    ipcRenderer.invoke("save-liability-version", data),
  convertLiabilityTemplate: (data: {
    accountId: string;
    targetTemplate: string;
    profile: Record<string, unknown>;
  }) => ipcRenderer.invoke("convert-liability-template", data),
  getLiabilityVersionHistory: (accountId: string) =>
    ipcRenderer.invoke("get-liability-version-history", accountId),
  getLiabilityMetrics: (accountId: string) =>
    ipcRenderer.invoke("get-liability-metrics", accountId),
});
