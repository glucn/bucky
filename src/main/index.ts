import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as isDev from "electron-is-dev";
import Store from "electron-store";

// Add this at the top of the file for type safety with the injected variable
// eslint-disable-next-line no-var
// @ts-ignore
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// Initialize electron store
const store = new Store();

// Define types
interface Account {
  id: number;
  name: string;
  balance: number;
  currency: string;
}

interface Transaction {
  id: number;
  accountId: number;
  amount: number;
  description: string;
  date: string;
}

// Mock data for development
const mockAccounts: Account[] = [
  { id: 1, name: "Checking", balance: 5000, currency: "USD" },
  { id: 2, name: "Savings", balance: 10000, currency: "USD" },
];

const mockTransactions: Transaction[] = [
  {
    id: 1,
    accountId: 1,
    amount: -50,
    description: "Grocery shopping",
    date: new Date().toISOString(),
  },
  {
    id: 2,
    accountId: 1,
    amount: 1000,
    description: "Salary",
    date: new Date().toISOString(),
  },
];

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  // Load the index.html from a url
  mainWindow.loadURL(
    isDev
      ? "http://localhost:3000"
      : `file://${path.join(__dirname, "../renderer/index.html")}`
  );

  // Open the DevTools in development.
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  createWindow();

  // Set up IPC handlers
  ipcMain.handle("get-accounts", async () => {
    // In a real app, this would fetch from a database
    return mockAccounts;
  });

  ipcMain.handle("get-transactions", async () => {
    // In a real app, this would fetch from a database
    return mockTransactions;
  });

  ipcMain.handle("add-account", async (_, account) => {
    const accounts = store.get("accounts", []) as Account[];
    accounts.push({ ...account, id: Date.now().toString() });
    store.set("accounts", accounts);
    return accounts;
  });

  ipcMain.handle("add-transaction", async (_, transaction) => {
    const transactions = store.get("transactions", []) as Transaction[];
    transactions.push({ ...transaction, id: Date.now().toString() });
    store.set("transactions", transactions);
    return transactions;
  });

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS.
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
