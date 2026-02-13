console.log("==========================================");
console.log("MAIN PROCESS STARTING - VERSION 2");
console.log("==========================================");

import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as isDev from "electron-is-dev";
import { databaseService } from "../services/database";
import { creditCardService } from "../services/creditCardService";
import { resolveImportAccounts } from "../services/importUtils";
import { AccountSubtype } from "../shared/accountTypes";
import { setupInvestmentIpcHandlers } from "./ipcHandlers.investments";
import { setupOverviewIpcHandlers } from "./ipcHandlers.overview";

// Add this at the top of the file for type safety with the injected variable
// eslint-disable-next-line no-var
// @ts-ignore
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let mainWindow: BrowserWindow | null = null;

// Initialize database and create window
async function initialize() {
  console.log("Starting initialization...");
  try {
    // Initialize database
    console.log("Initializing database...");
    await databaseService.initialize();
    console.log("Database initialized successfully");

    // Ensure default accounts exist only if there are no accounts
    const existingAccounts = await databaseService.getAccounts(true);
    if (!existingAccounts || existingAccounts.length === 0) {
      console.log("No accounts found. Ensuring default accounts exist...");
      await databaseService.ensureDefaultAccounts();
      console.log("Default accounts ensured");
    } else {
      console.log("Accounts already exist. Skipping default account creation.");
    }

    // Set up IPC handlers
    console.log("Setting up IPC handlers...");
    setupIpcHandlers();
    console.log("IPC handlers set up successfully");

    // Create window
    console.log("Creating main window...");
    createWindow();
    console.log("Main window created successfully");
  } catch (error) {
    console.error("Initialization failed:", error);
    app.quit();
  }
}

// Set up IPC handlers
function setupIpcHandlers() {
  console.log("Registering IPC handlers...");

  // Remove any existing handlers first
  ipcMain.removeHandler("get-accounts");
  ipcMain.removeHandler("get-transactions");
  ipcMain.removeHandler("add-account");
  ipcMain.removeHandler("add-transaction");
  ipcMain.removeHandler("delete-transaction");
  ipcMain.removeHandler("move-transaction-up");
  ipcMain.removeHandler("move-transaction-down");

  ipcMain.removeHandler("create-opening-balance-entry");
  ipcMain.removeHandler("get-net-worth");
  ipcMain.removeHandler("get-income-expense-this-month");
  ipcMain.removeHandler("get-recent-transactions");
  ipcMain.removeHandler("import-transactions");
  ipcMain.removeHandler("delete-account");
  ipcMain.removeHandler("archive-account");
  ipcMain.removeHandler("can-delete-account");
  ipcMain.removeHandler("restore-account");
  ipcMain.removeHandler("create-checkpoint");
  ipcMain.removeHandler("get-checkpoints-for-account");
  ipcMain.removeHandler("get-latest-checkpoint-for-account");
  ipcMain.removeHandler("delete-checkpoint");
  ipcMain.removeHandler("get-account-balance");
  ipcMain.removeHandler("reconcile-checkpoint");
  
  // Category-specific handlers
  ipcMain.removeHandler("get-category-balances-by-currency");
  ipcMain.removeHandler("get-accounts-by-type");
  ipcMain.removeHandler("get-category-accounts");

  // Account Group handlers
  ipcMain.removeHandler("create-account-group");
  ipcMain.removeHandler("get-account-groups");
  ipcMain.removeHandler("update-account-group");
  ipcMain.removeHandler("delete-account-group");
  ipcMain.removeHandler("add-account-to-group");
  ipcMain.removeHandler("remove-account-from-group");
  ipcMain.removeHandler("get-accounts-with-groups");
  ipcMain.removeHandler("reorder-account-groups");
  ipcMain.removeHandler("get-group-aggregate-balance");

  ipcMain.handle(
    "get-accounts",
    async (_, includeArchived: boolean = false) => {
      return databaseService.getAccounts(includeArchived);
    }
  );

  ipcMain.handle(
    "get-accounts-with-balances",
    async (_, includeArchived: boolean = false, currency?: string) => {
      return databaseService.getAccountsWithBalances(includeArchived, undefined, currency);
    }
  );

  ipcMain.handle("get-transactions", async (_, accountId: string) => {
    console.log("Handling get-transactions request for account:", accountId);
    return databaseService.getJournalEntriesForAccount(accountId);
  });

  ipcMain.handle("add-account", async (_, account) => {
    console.log("Handling add-account request:", account);
    const createdAccount = await databaseService.createAccount(account);
    return { success: true, account: createdAccount };
  });

  ipcMain.handle("update-account", async (_, data) => {
    console.log("Handling update-account request:", data);
    try {
      const updatedAccount = await databaseService.updateAccount(data.id, {
        name: data.name,
        currency: data.currency,
      });
      return { success: true, account: updatedAccount };
    } catch (error) {
      console.error("Error updating account:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("add-transaction", async (_, transaction) => {
    console.log("Handling add-transaction request:", transaction);
    // transaction should include: date, amount, description, fromAccountId, toAccountId
    // For manual transactions from UI, skip duplicate checking to allow legitimate duplicates
    return databaseService.createJournalEntry({
      ...transaction,
      skipDuplicateCheck: false
    });
  });

  ipcMain.handle("delete-transaction", async (_, entryId: string) => {
    console.log("Handling delete-transaction request for entry:", entryId);
    try {
      const result = await databaseService.deleteJournalEntry(entryId);
      console.log("Transaction deleted successfully:", result);
      return { success: true, deletedEntry: result };
    } catch (error) {
      console.error("Error deleting transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("update-transaction", async (_, data) => {
    console.log("Handling update-transaction request:", data);
    try {
      const result = await databaseService.updateJournalEntryLine(data);
      return { success: true, updatedEntry: result };
    } catch (error) {
      console.error("Error updating transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("move-transaction-up", async (_, entryId: string) => {
    console.log("Handling move-transaction-up request for entry:", entryId);
    try {
      const result = await databaseService.moveTransactionUp(entryId);
      return result;
    } catch (error) {
      console.error("Error moving transaction up:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("move-transaction-down", async (_, entryId: string) => {
    console.log("Handling move-transaction-down request for entry:", entryId);
    try {
      const result = await databaseService.moveTransactionDown(entryId);
      return result;
    } catch (error) {
      console.error("Error moving transaction down:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle(
    "create-opening-balance-entry",
    async (
      _,
      {
        balances,
        entryDate,
      }: {
        balances: { accountId: string; balance: number }[];
        entryDate: string;
      }
    ) => {
      console.log("Handling create-opening-balance-entry request:", {
        balances,
        entryDate,
      });
      return databaseService.createOpeningBalanceEntry(
        balances,
        new Date(entryDate)
      );
    }
  );

  ipcMain.handle(
    "set-opening-balance",
    async (
      _,
      {
        accountId,
        displayAmount,
        asOfDate,
      }: { accountId: string; displayAmount: number; asOfDate: string }
    ) => {
      console.log("Handling set-opening-balance request:", {
        accountId,
        displayAmount,
        asOfDate,
      });
      return databaseService.setOpeningBalance({
        accountId,
        displayAmount,
        asOfDate,
      });
    }
  );

  ipcMain.handle(
    "get-opening-balance",
    async (_, accountId: string) => {
      console.log("Handling get-opening-balance request:", { accountId });
      return databaseService.getOpeningBalanceForAccount(accountId);
    }
  );

  ipcMain.handle("get-net-worth", async () => {
    console.log("Handling get-net-worth request");
    return databaseService.getNetWorth();
  });

  ipcMain.handle("get-income-expense-this-month", async () => {
    console.log("Handling get-income-expense-this-month request");
    return databaseService.getIncomeExpenseThisMonth();
  });

  ipcMain.handle("get-recent-transactions", async (_, limit: number = 10) => {
    console.log("Handling get-recent-transactions request, limit:", limit);
    return databaseService.getRecentTransactions(limit);
  });

  ipcMain.handle("import-transactions", async (_, { transactions }) => {
    console.log("Handling import-transactions request");
    // Each transaction should have: date, amount, description, fromAccountId, toAccountId
    // Declare summary variables outside try for error reporting
    let importedCount = 0;
    let skippedCount = 0;
    const skippedDetails = [];
    const usedDefaultAccountDetails = [];
    const autoCreatedCategories: Array<{ name: string; subtype: string }> = [];
    try {

      // Ensure default accounts exist
      await databaseService.ensureDefaultAccounts();

      // Fetch all category accounts for quick lookup
      let allAccounts = await databaseService.getAccounts(true);
      const uncategorizedIncome = allAccounts.find(
        (acc) => acc.name === "Uncategorized Income" && acc.type === "category"
      );
      const uncategorizedExpense = allAccounts.find(
        (acc) => acc.name === "Uncategorized Expense" && acc.type === "category"
      );

      for (const tx of transactions) {
        console.log("[IMPORT] Processing transaction:", JSON.stringify(tx));
        // Basic validation: skip if required fields are missing (except toAccountId)
        if (
          !tx.date ||
          !tx.amount ||
          !tx.fromAccountId
        ) {
          console.log("[IMPORT] Skipping transaction due to missing required fields:", tx);
          continue;
        }

        // Find the user's account and its subtype
        const userAccount = allAccounts.find(acc => acc.id === tx.fromAccountId);
        if (!userAccount) {
          skippedCount++;
          skippedDetails.push({
            date: tx.date,
            amount: tx.amount,
            description: tx.description,
            fromAccountId: tx.fromAccountId,
            toAccountId: tx.toAccountId,
            reason: "User account not found",
          });
          continue;
        }

        let fromAccountId = tx.fromAccountId;
        let toAccountId = tx.toAccountId;
        let usedDefault = false;
        let defaultAccountName = null;
        const amount = Number(tx.amount);

        // Auto-create category if toAccountId is a string (category name) instead of an ID
        if (toAccountId && typeof toAccountId === 'string' && !allAccounts.find(acc => acc.id === toAccountId)) {
          // Check if it's a category name by looking for an account with this name
          const existingCategory = allAccounts.find(acc => acc.name === toAccountId && acc.type === 'category');
          
          if (existingCategory) {
            // Use existing category
            toAccountId = existingCategory.id;
          } else {
            // Auto-create new category
            // Determine subtype based on transaction amount sign
            const categorySubtype = amount > 0 ? 'asset' : 'liability';
            const categoryName = toAccountId;
            
            try {
              const newCategory = await databaseService.createAccount({
                name: categoryName,
                type: 'category',
                subtype: categorySubtype,
                currency: userAccount.currency, // Use user account's currency
              });
              
              console.log(`[IMPORT] Auto-created category: ${categoryName} (${categorySubtype})`);
              
              // Track auto-created category
              autoCreatedCategories.push({
                name: categoryName,
                subtype: categorySubtype === 'asset' ? 'Income' : 'Expense',
              });
              
              // Update toAccountId to the new category's ID
              toAccountId = newCategory.id;
              
              // Refresh accounts list to include the new category
              allAccounts = await databaseService.getAccounts(true);
            } catch (err) {
              console.error(`[IMPORT] Failed to auto-create category ${categoryName}:`, err);
              // Fall through to use default account logic below
              toAccountId = null;
            }
          }
        }

        const resolution = resolveImportAccounts({
          userAccountId: tx.fromAccountId,
          userAccountSubtype: userAccount.subtype as AccountSubtype,
          amount,
          toAccountId,
          uncategorizedIncomeId: uncategorizedIncome?.id ?? null,
          uncategorizedExpenseId: uncategorizedExpense?.id ?? null,
        });

        if (resolution.error) {
          skippedCount++;
          skippedDetails.push({
            date: tx.date,
            amount: tx.amount,
            description: tx.description,
            fromAccountId: tx.fromAccountId,
            toAccountId: tx.toAccountId,
            reason: resolution.error,
          });
          continue;
        }

        if (!resolution.fromAccountId || !resolution.toAccountId) {
          skippedCount++;
          skippedDetails.push({
            date: tx.date,
            amount: tx.amount,
            description: tx.description,
            fromAccountId: tx.fromAccountId,
            toAccountId: tx.toAccountId,
            reason: "Missing toAccountId and no default account found",
          });
          continue;
        }

        fromAccountId = resolution.fromAccountId;
        toAccountId = resolution.toAccountId;
        usedDefault = resolution.usedDefault;
        defaultAccountName = resolution.defaultAccountName;

        try {
          // Determine transaction type based on account types
          const fromAccount = allAccounts.find(acc => acc.id === fromAccountId);
          const toAccount = allAccounts.find(acc => acc.id === toAccountId);
          
          let transactionType: "income" | "expense" | "transfer" = "transfer";
          
          if (fromAccount && toAccount) {
            if (fromAccount.type === "user" && toAccount.type === "category") {
              transactionType = toAccount.subtype === "asset" ? "income" : "expense";
            } else if (fromAccount.type === "category" && toAccount.type === "user") {
              transactionType = fromAccount.subtype === "asset" ? "expense" : "income";
            }
            // If both are user accounts, it remains "transfer"
          }

          const result = await databaseService.createJournalEntry({
            date: tx.date,
            postingDate: tx.postingDate,
            amount: Math.abs(amount),
            description: tx.description,
            fromAccountId,
            toAccountId,
            transactionType,
            forceDuplicate: tx.forceDuplicate,
          });

          if (result.skipped) {
            skippedCount++;
            skippedDetails.push({
              date: tx.date,
              amount: tx.amount,
              description: tx.description,
              fromAccountId,
              toAccountId,
              reason: result.reason,
              index: typeof tx.index === "number" ? tx.index : undefined,
              existing: result.existing,
            });
            console.log("[IMPORT] Skipped transaction (reason):", result.reason, tx);
          } else {
            importedCount++;
            if (usedDefault) {
              usedDefaultAccountDetails.push({
                date: tx.date,
                amount: tx.amount,
                description: tx.description,
                fromAccountId,
                toAccountId,
                defaultAccountName,
              });
            }
            console.log("[IMPORT] Imported transaction:", tx);
          }
        } catch (err) {
          skippedCount++;
          skippedDetails.push({
            date: tx.date,
            amount: tx.amount,
            description: tx.description,
            fromAccountId,
            toAccountId,
            reason: err instanceof Error ? err.message : "Unknown error",
          });
          console.error("[IMPORT] Error importing transaction:", err, tx);
        }
      }
      console.log("[IMPORT] Import summary:", {
        importedCount,
        skippedCount,
        skippedDetails,
        usedDefaultAccountDetails,
        autoCreatedCategories,
      });
      return {
        success: true,
        imported: importedCount,
        skipped: skippedCount,
        skippedDetails,
        usedDefaultAccountDetails,
        autoCreatedCategories,
      };
    } catch (err) {
      console.error("Failed to import transactions", err);
      let message = "Unknown error";
      if (err instanceof Error) message = err.message;
      // Always return usedDefaultAccountDetails and autoCreatedCategories if available
      return {
        success: false,
        error: message,
        usedDefaultAccountDetails: typeof usedDefaultAccountDetails !== "undefined" ? usedDefaultAccountDetails : [],
        autoCreatedCategories: typeof autoCreatedCategories !== "undefined" ? autoCreatedCategories : [],
      };
    }
  });

  ipcMain.handle("can-delete-account", async (_, accountId: string) => {
    return databaseService.canDeleteAccount(accountId);
  });

  ipcMain.handle("delete-account", async (_, accountId: string) => {
    try {
      const result = await databaseService.deleteAccount(accountId);
      return { success: true, deletedAccount: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("archive-account", async (_, accountId: string) => {
    try {
      const result = await databaseService.archiveAccount(accountId);
      return { success: true, archivedAccount: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("restore-account", async (_, accountId: string) => {
    try {
      const result = await databaseService.restoreAccount(accountId);
      return { success: true, restoredAccount: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Checkpoint handlers
  ipcMain.handle(
    "create-checkpoint",
    async (
      _,
      data: {
        accountId: string;
        date: string;
        balance: number;
        description?: string;
      }
    ) => {
      console.log("Handling create-checkpoint request:", data);
      try {
        const result = await databaseService.createCheckpoint({
          ...data,
          date: new Date(data.date),
        });
        return { success: true, checkpoint: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-checkpoints-for-account",
    async (_, accountId: string) => {
      console.log(
        "Handling get-checkpoints-for-account request for:",
        accountId
      );
      try {
        const checkpoints = await databaseService.getCheckpointsForAccount(
          accountId
        );
        return { success: true, checkpoints };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-latest-checkpoint-for-account",
    async (_, accountId: string) => {
      console.log(
        "Handling get-latest-checkpoint-for-account request for:",
        accountId
      );
      try {
        const checkpoint = await databaseService.getLatestCheckpointForAccount(
          accountId
        );
        return { success: true, checkpoint };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle("delete-checkpoint", async (_, checkpointId: string) => {
    console.log("Handling delete-checkpoint request for:", checkpointId);
    try {
      const result = await databaseService.deleteCheckpoint(checkpointId);
      return { success: true, deletedCheckpoint: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("get-account-balance", async (_, accountId: string) => {
    console.log("Handling get-account-balance request for:", accountId);
    try {
      const balance = await databaseService.getAccountBalance(accountId);
      return { success: true, balance };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Category-specific handlers
  ipcMain.handle(
    "get-category-balances-by-currency",
    async (_, categoryId: string) => {
      console.log("Handling get-category-balances-by-currency request for:", categoryId);
      try {
        const balances = await databaseService.getCategoryBalancesByCurrency(categoryId);
        return { success: true, balances };
      } catch (error) {
        console.error("Error getting category balances by currency:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-accounts-by-type",
    async (_, accountType: string, includeArchived: boolean = false) => {
      console.log("Handling get-accounts-by-type request for type:", accountType);
      try {
        const allAccounts = await databaseService.getAccounts(includeArchived);
        const filteredAccounts = allAccounts.filter(
          (account) => account.type === accountType
        );
        return { success: true, accounts: filteredAccounts };
      } catch (error) {
        console.error("Error getting accounts by type:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-category-accounts",
    async (_, includeArchived: boolean = false) => {
      console.log("Handling get-category-accounts request");
      try {
        const allAccounts = await databaseService.getAccountsWithBalances(includeArchived);
        const categoryAccounts = allAccounts.filter(
          (account) => account.type === "category"
        );
        return { success: true, accounts: categoryAccounts };
      } catch (error) {
        console.error("Error getting category accounts:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle("reconcile-checkpoint", async (_, checkpointId: string) => {
    try {
      const result = await databaseService.reconcileCheckpoint(checkpointId);
      return { success: true, checkpoint: result };
    } catch (error) {
      console.error("Error in reconcile-checkpoint:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Credit Card handlers
  ipcMain.handle(
    "setup-credit-card",
    async (_, { accountId, properties }) => {
      console.log("Handling setup-credit-card request:", { accountId, properties });
      try {
        const result = await creditCardService.setupCreditCard(accountId, properties);
        return { success: true, properties: result };
      } catch (error) {
        console.error("Error setting up credit card:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "update-credit-card-properties",
    async (_, { accountId, properties }) => {
      console.log("Handling update-credit-card-properties request:", { accountId, properties });
      try {
        const result = await creditCardService.updateCreditCardProperties(accountId, properties);
        return { success: true, properties: result };
      } catch (error) {
        console.error("Error updating credit card properties:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-credit-card-properties",
    async (_, accountId: string) => {
      console.log("Handling get-credit-card-properties request for:", accountId);
      try {
        const properties = await creditCardService.getCurrentCreditCardProperties(accountId);
        return { success: true, properties };
      } catch (error) {
        console.error("Error getting credit card properties:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-credit-card-metrics",
    async (_, accountId: string) => {
      console.log("Handling get-credit-card-metrics request for:", accountId);
      try {
        const properties = await creditCardService.getCurrentCreditCardProperties(accountId);
        if (!properties) {
          return { success: false, error: "No credit card properties found" };
        }

        const [availableCredit, utilization, minimumPayment, rawBalance] = await Promise.all([
          creditCardService.getAvailableCredit(accountId),
          creditCardService.getCreditUtilization(accountId),
          creditCardService.getMinimumPayment(accountId),
          databaseService.getAccountBalance(accountId),
        ]);

        // For liability accounts, negate the balance for user-friendly display
        // (negative database balance = debt owed, should display as positive)
        const displayBalance = -rawBalance;

        return {
          success: true,
          metrics: {
            accountId,
            currentBalance: displayBalance,
            availableCredit,
            creditUtilization: utilization,
            minimumPayment,
            creditLimit: properties.creditLimit,
          },
        };
      } catch (error) {
        console.error("Error getting credit card metrics:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Account Group handlers
  ipcMain.handle(
    "create-account-group",
    async (_, data: { name: string; accountType: string }) => {
      console.log("Handling create-account-group request:", data);
      try {
        const result = await databaseService.createAccountGroup(data);
        return { success: true, group: result };
      } catch (error) {
        console.error("Error creating account group:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-account-groups",
    async (_, accountType?: string) => {
      console.log("Handling get-account-groups request, accountType:", accountType);
      try {
        const groups = await databaseService.getAccountGroups(accountType);
        return { success: true, groups };
      } catch (error) {
        console.error("Error getting account groups:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "update-account-group",
    async (_, { id, data }: { id: string; data: { name?: string; displayOrder?: number } }) => {
      console.log("Handling update-account-group request:", { id, data });
      try {
        const result = await databaseService.updateAccountGroup(id, data);
        return { success: true, group: result };
      } catch (error) {
        console.error("Error updating account group:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "delete-account-group",
    async (_, id: string) => {
      console.log("Handling delete-account-group request:", id);
      try {
        const result = await databaseService.deleteAccountGroup(id);
        return { success: true, group: result };
      } catch (error) {
        console.error("Error deleting account group:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "add-account-to-group",
    async (_, { accountId, groupId }: { accountId: string; groupId: string }) => {
      console.log("Handling add-account-to-group request:", { accountId, groupId });
      try {
        const result = await databaseService.addAccountToGroup(accountId, groupId);
        return { success: true, account: result };
      } catch (error) {
        console.error("Error adding account to group:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "remove-account-from-group",
    async (_, accountId: string) => {
      console.log("Handling remove-account-from-group request:", accountId);
      try {
        const result = await databaseService.removeAccountFromGroup(accountId);
        return { success: true, account: result };
      } catch (error) {
        console.error("Error removing account from group:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-accounts-with-groups",
    async (_, { includeArchived, accountType }: { includeArchived?: boolean; accountType?: string }) => {
      console.log("Handling get-accounts-with-groups request:", { includeArchived, accountType });
      try {
        const result = await databaseService.getAccountsWithGroups(
          includeArchived ?? false,
          accountType
        );
        return { success: true, data: result };
      } catch (error) {
        console.error("Error getting accounts with groups:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "reorder-account-groups",
    async (_, groupOrders: Array<{ id: string; displayOrder: number }>) => {
      console.log("Handling reorder-account-groups request:", groupOrders);
      try {
        await databaseService.reorderAccountGroups(groupOrders);
        return { success: true };
      } catch (error) {
        console.error("Error reordering account groups:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-group-aggregate-balance",
    async (_, groupId: string) => {
      console.log("Handling get-group-aggregate-balance request:", groupId);
      try {
        const balance = await databaseService.getGroupAggregateBalance(groupId);
        return balance;
      } catch (error) {
        console.error("Error getting group aggregate balance:", error);
        throw error;
      }
    }
  );

  // Setup investment IPC handlers
  setupInvestmentIpcHandlers();
  setupOverviewIpcHandlers();

  console.log("All IPC handlers registered");
  // DEV ONLY: Reset all data to initial state
  ipcMain.handle("reset-all-data", async () => {
    try {
      await databaseService.resetAllData();
      return { success: true };
    } catch (error) {
      console.error("Error resetting all data:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

}

// Create the browser window
function createWindow() {
  console.log(
    "Creating window with preload script:",
    MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY
  );
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  // Set CSP headers
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: ws: wss: http: https:",
            "connect-src 'self' ws: wss: http: https:",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self' data: https:",
          ].join("; "),
        },
      });
    }
  );

  // Load the index.html of the app
  const appUrl = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../renderer/index.html")}`;
  console.log("Loading app URL:", appUrl);
  mainWindow.loadURL(appUrl);

  // Open DevTools in development
  if (isDev && process.env.PLAYWRIGHT_TEST !== "1") {
    console.log("Opening DevTools...");
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  console.log("Electron app is ready, starting initialization...");
  initialize().catch((error) => {
    console.error("Failed to initialize app:", error);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log("No windows found, creating new window...");
      createWindow();
    }
  });
});

app.on("window-all-closed", async function () {
  if (process.platform !== "darwin") {
    await databaseService.disconnect();
    app.quit();
  }
});
