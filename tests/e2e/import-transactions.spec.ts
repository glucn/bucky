import { test, expect, ElectronApplication, Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import crypto from "crypto";

const appEntry = path.join(__dirname, "..", "..", ".webpack", "main", "index.js");
const testDbPath = path.join(__dirname, "..", "..", "prisma", "test.db");
const artifactsDir = path.join(__dirname, "artifacts");

const ensureArtifactsDir = () => {
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
};

const captureScreenshot = async (page: Page, name: string) => {
  ensureArtifactsDir();
  const filename = `${Date.now()}-${name}.png`;
  const filePath = path.join(artifactsDir, filename);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`[E2E] Screenshot saved: ${filePath}`);
};

const attachDebugLogging = (page: Page, label: string) => {
  page.on("console", (msg) => {
    console.log(`[E2E:${label}] console.${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (error) => {
    console.error(`[E2E:${label}] pageerror: ${error.message}`);
  });
};

const launchApp = async (): Promise<ElectronApplication> => {
  return electron.launch({
    args: [appEntry],
    env: {
      ...process.env,
      NODE_ENV: "test",
      VITEST: "true",
      ELECTRON_IS_DEV: "1",
    },
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

const getMainWindow = async (app: ElectronApplication): Promise<Page> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const windows = app.windows();
    for (const window of windows) {
      const url = await window.url();
      if (url.includes("localhost:3000")) {
        await window.waitForLoadState("domcontentloaded");
        return window;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return page;
};

const openTransactionsPage = async (page: Page) => {
  const accountId = await ensureSeedAccounts();
  await page.goto(`http://localhost:3000/accounts/${accountId}/transactions`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(new RegExp(`/accounts/${accountId}/transactions`));
  await page.evaluate(() => window.scrollTo(0, 0));
  const importButton = page.getByTestId("import-transactions-button");
  await importButton.waitFor({ state: "attached" });
  await importButton.scrollIntoViewIfNeeded();
};

const openImportWizard = async (page: Page) => {
  const importButton = page.getByTestId("import-transactions-button");
  await importButton.waitFor({ state: "attached" });
  await importButton.scrollIntoViewIfNeeded();
  await importButton.evaluate((node) => {
    (node as HTMLButtonElement).click();
  });
  await page.getByTestId("import-wizard-title").waitFor({ state: "visible" });
};

const uploadCsv = async (page: Page, filename: string) => {
  const fileInput = page.locator("input[type=\"file\"]");
  await fileInput.setInputFiles(
    path.join(
      __dirname,
      "..",
      "..",
      "doc",
      "F-008-offline-import-foundation",
      "samples",
      filename
    )
  );
};

test("imports headered CSV with read-only preview", async () => {
  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "headered");

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTransactionsPage(page);
    await captureScreenshot(page, "headered-transactions-page");

    await openImportWizard(page);
    await captureScreenshot(page, "headered-wizard-open");

    await uploadCsv(page, "fake-credit-statement-with-header.csv");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Map CSV Columns to System Fields" }).waitFor();
    await page.locator("#map-date").selectOption({ label: "Transaction Date" });
    await page.locator("#map-amount").selectOption({ label: "Transaction Amount" });
    await page.locator("#map-description").selectOption({ label: "Description" });
    await captureScreenshot(page, "headered-map-step");

    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Preview Transactions" }).waitFor();
    await captureScreenshot(page, "headered-preview-step");

    const previewInputs = page.locator("tbody tr input");
    await expect(previewInputs).toHaveCount(0);

    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Confirm Import" }).waitFor();
    await captureScreenshot(page, "headered-confirm-step");

    await page.getByRole("button", { name: "Confirm & Import" }).click();
    await page.getByText("Import completed successfully.").waitFor();
    await captureScreenshot(page, "headered-import-success");

    await page.getByRole("button", { name: "Done" }).click();
    await page.getByText("COFFEE BEAN VANCOUVER BC").first().waitFor();
  } catch (error) {
    await captureScreenshot(page, "headered-failure");
    throw error;
  } finally {
    await app.close();
  }
});

test("headerless CSV import completes with manual mapping", async () => {
  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "headerless");

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTransactionsPage(page);
    await captureScreenshot(page, "headerless-transactions-page");

    await openImportWizard(page);
    await captureScreenshot(page, "headerless-wizard-open");

    const headerCheckbox = page.getByTestId("csv-has-header-row");
    await headerCheckbox.uncheck();
    await uploadCsv(page, "fake-credit-statement-headerless.csv");
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("heading", { name: "Map CSV Columns to System Fields" }).waitFor();
    await page.getByText("This CSV file does not have a header row").waitFor();
    await captureScreenshot(page, "headerless-map-step");

    await page.locator("#map-date").selectOption("Column 1");
    await page.locator("#map-description").selectOption("Column 2");
    await page.locator("#map-debit").selectOption("Column 3");
    await page.locator("#map-credit").selectOption("Column 4");

    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Preview Transactions" }).waitFor();
    await captureScreenshot(page, "headerless-preview-step");
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("heading", { name: "Confirm Import" }).waitFor();
    await captureScreenshot(page, "headerless-confirm-step");
    await page.getByRole("button", { name: "Confirm & Import" }).click();
    await page.getByText("Import completed successfully.").waitFor();
    await captureScreenshot(page, "headerless-import-success");
    const doneButton = page.getByRole("button", { name: "Done" });
    await doneButton.evaluate((node) => (node as HTMLButtonElement).click());

    await page.getByTestId("transactions-page").waitFor();
  } catch (error) {
    await captureScreenshot(page, "headerless-failure");
    throw error;
  } finally {
    await app.close();
  }
});

test("file duplicates can be skipped in confirm step", async () => {
  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "duplicates");

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTransactionsPage(page);
    await openImportWizard(page);

    await uploadCsv(page, "fake-credit-statement-with-header-duplicates.csv");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Map CSV Columns to System Fields" }).waitFor();
    await page.locator("#map-date").selectOption({ label: "Transaction Date" });
    await page.locator("#map-amount").selectOption({ label: "Transaction Amount" });
    await page.locator("#map-description").selectOption({ label: "Description" });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Preview Transactions" }).waitFor();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Confirm Import" }).waitFor();
    await page.getByText("File duplicates detected").waitFor();
    await captureScreenshot(page, "duplicates-confirm");
    const skipDuplicates = page.getByRole("button", { name: "Skip duplicates" });
    await skipDuplicates.evaluate((node) => (node as HTMLButtonElement).click());

    const confirmImport = page.getByRole("button", { name: "Confirm & Import" });
    await expect(confirmImport).toBeEnabled();
    await confirmImport.click();
    await page
      .getByText("Import completed successfully.")
      .waitFor({ timeout: 10000 })
      .catch(async () => {
        await page
          .locator('[role="alert"]', { hasText: "No transactions were imported." })
          .first()
          .waitFor();
      });
  } catch (error) {
    await captureScreenshot(page, "duplicates-failure");
    throw error;
  } finally {
    await app.close();
  }
});

test("uncategorized fallback shows warning summary", async () => {
  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "uncategorized");

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTransactionsPage(page);
    await openImportWizard(page);

    await uploadCsv(page, "fake-credit-statement-with-header.csv");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Map CSV Columns to System Fields" }).waitFor();
    await page.locator("#map-date").selectOption({ label: "Transaction Date" });
    await page.locator("#map-amount").selectOption({ label: "Transaction Amount" });
    await page.locator("#map-description").selectOption({ label: "Description" });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Preview Transactions" }).waitFor();
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("heading", { name: "Confirm Import" }).waitFor();
    await page.getByRole("button", { name: "Confirm & Import" }).click();
    await page.getByText("Attention: Some transactions were auto-assigned").waitFor();
    await captureScreenshot(page, "uncategorized-warning");
  } catch (error) {
    await captureScreenshot(page, "uncategorized-failure");
    throw error;
  } finally {
    await app.close();
  }
});
