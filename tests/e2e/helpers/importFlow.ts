import type { ElectronApplication, Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import crypto from "crypto";

const appEntry = path.join(__dirname, "..", "..", "..", ".webpack", "main", "index.js");
const testDbPath = path.join(__dirname, "..", "..", "..", "test.db");
const artifactsDir = path.join(__dirname, "..", "artifacts");

export const launchApp = async (): Promise<ElectronApplication> => {
  return electron.launch({
    args: [appEntry],
    env: {
      ...process.env,
      NODE_ENV: "test",
      VITEST: "true",
      ELECTRON_IS_DEV: "1",
      PLAYWRIGHT_TEST: "1",
    },
  });
};

export const getMainWindow = async (app: ElectronApplication): Promise<Page> => {
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

export const attachDebugLogging = (page: Page, label: string) => {
  if (process.env.E2E_DEBUG !== "1") {
    return;
  }
  page.on("console", (msg) => {
    console.log(`[E2E:${label}] console.${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (error) => {
    console.error(`[E2E:${label}] pageerror: ${error.message}`);
  });
};

const ensureArtifactsDir = () => {
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
};

export const captureScreenshot = async (page: Page, name: string) => {
  ensureArtifactsDir();
  const filename = `${Date.now()}-${name}.png`;
  const filePath = path.join(artifactsDir, filename);
  await page.screenshot({ path: filePath, fullPage: true });
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
          if (err) reject(err);
          else resolve();
        }
      );
    });

  const fetchId = (name: string) =>
    new Promise<string>((resolve, reject) => {
      db.get("SELECT id FROM Account WHERE name = ? LIMIT 1", [name], (err, row) => {
        if (err) return reject(err);
        const record = row as { id?: string } | undefined;
        if (!record?.id) return reject(new Error(`Account not found: ${name}`));
        return resolve(record.id);
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

export const openTransactionsPage = async (page: Page) => {
  const accountId = await ensureSeedAccounts();
  await page.goto(`http://localhost:3000/accounts/${accountId}/transactions`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(new RegExp(`/accounts/${accountId}/transactions`));
  await page.getByTestId("import-transactions-button").waitFor({ state: "visible" });
};

export const openImportWizard = async (page: Page) => {
  const importButton = page.getByTestId("import-transactions-button");
  await importButton.waitFor({ state: "visible" });

  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      await importButton.evaluate((node) => {
        (node as HTMLButtonElement).click();
      });
      await page.getByTestId("import-wizard-title").waitFor({ state: "visible", timeout: 1500 });
      return;
    } catch {
      await page.waitForTimeout(300);
    }
  }

  throw new Error("Import wizard did not open after retries");
};

export const uploadCsv = async (page: Page, filename: string) => {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(
    path.join(
      __dirname,
      "..",
      "..",
      "..",
      "doc",
      "F-008-offline-import-foundation",
      "samples",
      filename
    )
  );
};
