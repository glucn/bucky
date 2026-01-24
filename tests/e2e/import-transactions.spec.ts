import { test, expect, ElectronApplication, Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import path from "path";
import sqlite3 from "sqlite3";
import crypto from "crypto";

const appEntry = path.join(__dirname, "..", "..", ".webpack", "main", "index.js");
const testDbPath = path.join(__dirname, "..", "..", "prisma", "test.db");

const launchApp = async (): Promise<ElectronApplication> => {
  return electron.launch({
    args: [appEntry],
    env: {
      ...process.env,
      NODE_ENV: "test",
      VITEST: "true",
      ELECTRON_IS_DEV: "0", // Disable dev mode to prevent DevTools
    },
    // Enable console output to see errors
    executablePath: undefined,
    timeout: 30000,
  });
};

const ensureSeedAccounts = async (): Promise<string> => {
  const db = new sqlite3.Database(testDbPath);
  const now = new Date().toISOString();

  const insertAccount = (name: string, type: string, subtype: string) =>
    new Promise<void>((resolve, reject) => {
      db.run(
        "INSERT INTO Account (id, name, type, subtype, currency, isArchived, groupId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [crypto.randomUUID(), name, type, subtype, "USD", 0, null, now, now],
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        }
      );
    });

  const fetchId = (name: string) =>
    new Promise<string>((resolve, reject) => {
      db.get("SELECT id FROM Account WHERE name = ? LIMIT 1", [name], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        const record = row as { id?: string } | undefined;
        if (!record?.id) {
          reject(new Error(`Account not found: ${name}`));
          return;
        }
        resolve(record.id);
      });
    });

  try {
    await fetchId("Uncategorized Income");
  } catch {
    await insertAccount("Uncategorized Income", "category", "asset");
  }

  try {
    await fetchId("Uncategorized Expense");
  } catch {
    await insertAccount("Uncategorized Expense", "category", "liability");
  }

  let accountId = "";
  try {
    accountId = await fetchId("E2E Seed Account");
  } catch {
    await insertAccount("E2E Seed Account", "user", "asset");
    accountId = await fetchId("E2E Seed Account");
  }

  db.close();
  return accountId;
};

const openTransactionsPage = async (page: Page) => {
  const accountId = await ensureSeedAccounts();
  await page.goto(`http://localhost:3001/accounts/${accountId}/transactions`);
  await page.getByTestId("transactions-page").waitFor();
};



test("imports headered CSV with preview edits", async () => {
  console.log("Starting test...");
  
  const app = await launchApp();
  console.log("App launched");
  
  // Wait a bit for the app to initialize
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Get all windows and find the main app window (not DevTools)
  const windows = app.windows();
  console.log("Number of windows:", windows.length);
  
  let mainWindow = null;
  for (const window of windows) {
    const url = await window.url();
    console.log("Window URL:", url);
    if (url.includes('localhost:3001')) {
      mainWindow = window;
      break;
    }
  }
  
  if (!mainWindow) {
    // If no localhost window found, the app might have failed to load
    // Let's wait a bit more and try again
    await new Promise(resolve => setTimeout(resolve, 2000));
    const newWindows = app.windows();
    for (const window of newWindows) {
      const url = await window.url();
      if (url.includes('localhost:3001')) {
        mainWindow = window;
        break;
      }
    }
  }
  
  if (!mainWindow) {
    console.log("No main window found - app may have failed to load");
    await app.close();
    throw new Error("Could not find main app window");
  }
  
  console.log("Found main window, taking screenshot...");
  await mainWindow.screenshot({ path: 'test-debug.png' });
  
  // Now we can proceed with the actual test
  await openTransactionsPage(mainWindow);

  const importButton = mainWindow.getByTestId("import-transactions-button");
  await importButton.scrollIntoViewIfNeeded();
  await importButton.click();
  await mainWindow.getByTestId("import-wizard-title").waitFor({ state: "visible" });

  // Upload CSV file using the file input
  const fileInput = mainWindow.locator('input[type="file"]');
  await fileInput.setInputFiles(
    path.join(
      __dirname,
      "..",
      "..",
      "doc",
      "F-008-offline-import-foundation",
      "samples",
      "fake-credit-statement-with-header.csv"
    )
  );
  await mainWindow.getByRole("button", { name: "Next" }).click();

  await mainWindow.getByRole("heading", { name: "Map CSV Columns to System Fields" }).waitFor();

  // Take a screenshot to see the mapping step
  await mainWindow.screenshot({ path: 'test-mapping-step.png' });

  // Wait for the preview table to load
  await mainWindow.locator("tbody tr").first().waitFor({ timeout: 10000 });

  // Edit first row description - let's be more specific about which input
  const firstRow = mainWindow.locator("tbody tr").first();
  const inputs = firstRow.locator("input");
  const inputCount = await inputs.count();
  console.log("Number of inputs in first row:", inputCount);
  
  // Try to find the description input (it should be the 3rd input: date, postingDate, amount, description)
  if (inputCount >= 3) {
    const descriptionInput = inputs.nth(2);
    await descriptionInput.fill("Updated description");
  } else {
    console.log("Not enough inputs found, taking screenshot for debugging");
    await mainWindow.screenshot({ path: 'test-debug-inputs.png' });
    throw new Error(`Expected at least 3 inputs, found ${inputCount}`);
  }

  // Proceed to confirm step
  await mainWindow.getByRole("button", { name: "Next" }).click();

  await mainWindow.getByRole("heading", { name: "Confirm Import" }).waitFor();
  await mainWindow.getByRole("button", { name: "Confirm & Import" }).click();

  await mainWindow.getByText("Import completed successfully.").waitFor();

  // Close wizard
  await mainWindow.getByRole("button", { name: "Done" }).click();

  await mainWindow.getByText("COFFEE BEAN VANCOUVER BC").first().waitFor();

  await app.close();
});
