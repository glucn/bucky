import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) =>
      ipcRenderer.invoke(channel, ...args),
    on: (channel: string, listener: (...args: any[]) => void) =>
      ipcRenderer.on(channel, (_event, ...args) => listener(...args)),
    // Optionally add more methods as needed
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
});
