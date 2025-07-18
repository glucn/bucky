console.log("==========================================");
console.log("MAIN PROCESS STARTING - VERSION 2");
console.log("==========================================");

import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as isDev from "electron-is-dev";
import { databaseService } from "../services/database";

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

  ipcMain.handle("get-transactions", async (_, accountId: string) => {
    console.log("Handling get-transactions request for account:", accountId);
    return databaseService.getJournalEntriesForAccount(accountId);
  });

  ipcMain.handle("add-account", async (_, account) => {
    console.log("Handling add-account request:", account);
    return databaseService.createAccount(account);
  });

  ipcMain.handle("add-transaction", async (_, transaction) => {
    console.log("Handling add-transaction request:", transaction);
    // transaction should include: date, amount, category, description, fromAccountId, toAccountId
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
    // Each transaction should have: date, amount, category, description, fromAccountId, toAccountId
    try {
      const results = [];
      for (const tx of transactions) {
        // Basic validation: skip if required fields are missing
        if (
          !tx.date ||
          !tx.amount ||
          !tx.fromAccountId ||
          !tx.toAccountId ||
          !tx.category
        )
          continue;
        const result = await databaseService.createJournalEntry({
          date: tx.date,
          amount: Number(tx.amount),
          category: tx.category,
          description: tx.description,
          fromAccountId: tx.fromAccountId,
          toAccountId: tx.toAccountId,
        });
        results.push(result);
      }
      return { success: true, count: results.length };
    } catch (err) {
      console.error("Failed to import transactions", err);
      let message = "Unknown error";
      if (err instanceof Error) message = err.message;
      return { success: false, error: message };
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

  console.log("All IPC handlers registered");
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
