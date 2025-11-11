console.log("==========================================");
console.log("MAIN PROCESS STARTING - VERSION 2");
console.log("==========================================");

import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as isDev from "electron-is-dev";
import { databaseService } from "../services/database";
import { creditCardService } from "../services/creditCardService";

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

  ipcMain.handle(
    "get-accounts",
    async (_, includeArchived: boolean = false) => {
      return databaseService.getAccounts(includeArchived);
    }
  );

  ipcMain.handle(
    "get-accounts-with-balances",
    async (_, includeArchived: boolean = false) => {
      return databaseService.getAccountsWithBalances(includeArchived, undefined);
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

  ipcMain.handle("add-transaction", async (_, transaction) => {
    console.log("Handling add-transaction request:", transaction);
    // transaction should include: date, amount, description, fromAccountId, toAccountId
    return databaseService.createJournalEntry(transaction);
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
    try {

      // Ensure default accounts exist
      await databaseService.ensureDefaultAccounts();

      // Fetch all category accounts for quick lookup
      const allAccounts = await databaseService.getAccounts(true);
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

        // Determine direction based on subtype and sign
        if (userAccount.subtype === "asset") {
          if (amount > 0) {
            // Increase asset: user's account is TO
            fromAccountId = toAccountId || (uncategorizedIncome ? uncategorizedIncome.id : null);
            toAccountId = tx.fromAccountId;
            if (!fromAccountId) {
              skippedCount++;
              skippedDetails.push({
                date: tx.date,
                amount: tx.amount,
                description: tx.description,
                fromAccountId: tx.fromAccountId,
                toAccountId: tx.toAccountId,
                reason: "Missing source account for asset increase",
              });
              continue;
            }
            if (!tx.toAccountId && uncategorizedIncome) {
              usedDefault = true;
              defaultAccountName = "Uncategorized Income";
            }
          } else {
            // Decrease asset: user's account is FROM
            toAccountId = toAccountId || (uncategorizedExpense ? uncategorizedExpense.id : null);
            if (!toAccountId) {
              skippedCount++;
              skippedDetails.push({
                date: tx.date,
                amount: tx.amount,
                description: tx.description,
                fromAccountId: tx.fromAccountId,
                toAccountId: tx.toAccountId,
                reason: "Missing destination account for asset decrease",
              });
              continue;
            }
            if (!tx.toAccountId && uncategorizedExpense) {
              usedDefault = true;
              defaultAccountName = "Uncategorized Expense";
            }
          }
        } else if (userAccount.subtype === "liability") {
          if (amount > 0) {
            // Increase liability: user's account is FROM
            toAccountId = toAccountId || (uncategorizedExpense ? uncategorizedExpense.id : null);
            if (!toAccountId) {
              skippedCount++;
              skippedDetails.push({
                date: tx.date,
                amount: tx.amount,
                description: tx.description,
                fromAccountId: tx.fromAccountId,
                toAccountId: tx.toAccountId,
                reason: "Missing destination account for liability increase",
              });
              continue;
            }
            if (!tx.toAccountId && uncategorizedExpense) {
              usedDefault = true;
              defaultAccountName = "Uncategorized Expense";
            }
          } else {
            // Decrease liability: user's account is TO
            fromAccountId = toAccountId || (uncategorizedIncome ? uncategorizedIncome.id : null);
            toAccountId = tx.fromAccountId;
            if (!fromAccountId) {
              skippedCount++;
              skippedDetails.push({
                date: tx.date,
                amount: tx.amount,
                description: tx.description,
                fromAccountId: tx.fromAccountId,
                toAccountId: tx.toAccountId,
                reason: "Missing source account for liability decrease",
              });
              continue;
            }
            if (!tx.toAccountId && uncategorizedIncome) {
              usedDefault = true;
              defaultAccountName = "Uncategorized Income";
            }
          }
        } else {
          // Unknown subtype, fallback to original logic
          if (!toAccountId) {
            if (amount > 0 && uncategorizedIncome) {
              toAccountId = uncategorizedIncome.id;
              usedDefault = true;
              defaultAccountName = "Uncategorized Income";
            } else if (amount < 0 && uncategorizedExpense) {
              toAccountId = uncategorizedExpense.id;
              usedDefault = true;
              defaultAccountName = "Uncategorized Expense";
            } else {
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
          }
        }

        try {
          const result = await databaseService.createJournalEntry({
            date: tx.date,
            amount: Math.abs(amount),
            description: tx.description,
            fromAccountId,
            toAccountId,
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
      });
      return {
        success: true,
        imported: importedCount,
        skipped: skippedCount,
        skippedDetails,
        usedDefaultAccountDetails,
      };
    } catch (err) {
      console.error("Failed to import transactions", err);
      let message = "Unknown error";
      if (err instanceof Error) message = err.message;
      // Always return usedDefaultAccountDetails if available
      return {
        success: false,
        error: message,
        usedDefaultAccountDetails: typeof usedDefaultAccountDetails !== "undefined" ? usedDefaultAccountDetails : [],
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

        const [availableCredit, utilization, minimumPayment, balance] = await Promise.all([
          creditCardService.getAvailableCredit(accountId),
          creditCardService.getCreditUtilization(accountId),
          creditCardService.getMinimumPayment(accountId),
          databaseService.getAccountBalance(accountId),
        ]);

        return {
          success: true,
          metrics: {
            accountId,
            currentBalance: balance,
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
    ? "http://localhost:3001"
    : `file://${path.join(__dirname, "../renderer/index.html")}`;
  console.log("Loading app URL:", appUrl);
  mainWindow.loadURL(appUrl);

  // Open DevTools in development
  if (isDev) {
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
