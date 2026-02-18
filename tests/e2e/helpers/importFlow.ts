import type { ElectronApplication, Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import crypto from "crypto";

const appEntry = path.join(__dirname, "..", "..", "..", ".webpack", "main", "index.js");
const testDbPath = path.join(__dirname, "..", "..", "..", "test.db");
const artifactsDir = path.join(__dirname, "..", "artifacts");

const closeDatabase = (db: sqlite3.Database) =>
  new Promise<void>((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

export const launchApp = async (): Promise<ElectronApplication> => {
  return electron.launch({
    args: [appEntry],
    env: {
      ...process.env,
      NODE_ENV: "test",
      VITEST: "true",
      ELECTRON_IS_DEV: "1",
      PLAYWRIGHT_TEST: "1",
      PLAYWRIGHT_PREPARE_ONLY: "0",
    },
  });
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const closeApp = async (app: ElectronApplication): Promise<void> => {
  const processHandle = app.process();

  const waitForExit =
    processHandle && processHandle.exitCode === null
      ? new Promise<void>((resolve) => {
          processHandle.once("exit", () => resolve());
        })
      : Promise.resolve();

  if (processHandle && processHandle.exitCode === null) {
    processHandle.kill("SIGKILL");
    await Promise.race([waitForExit, wait(1500)]);
  }

  try {
    await app.close();
  } catch {
    // Connection can already be gone after force-kill.
  }
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
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      console.log(`[E2E:${label}] navigated: ${frame.url()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() === 404) {
      console.log(`[E2E:${label}] 404: ${response.url()}`);
    }
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
  try {
    await page.screenshot({ path: filePath, fullPage: true });
  } catch {
    // Ignore screenshot failures when the page is already closed.
  }
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

    const seedName = `E2E Seed Account ${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    await insertAccount(seedName, "user", "asset");
    return await fetchId(seedName);
  } finally {
    await closeDatabase(db);
  }
};

export const openTransactionsPage = async (page: Page) => {
  const accountId = await ensureSeedAccounts();
  const targetUrl = `http://localhost:3000/accounts/${accountId}/transactions`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
      await page.waitForURL(new RegExp(`/accounts/${accountId}/transactions`), {
        timeout: 5000,
      });
      break;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
      await page.waitForTimeout(500);
    }
  }

  await page.waitForURL(new RegExp(`/accounts/${accountId}/transactions`));
  await page.getByTestId("import-transactions-button").waitFor({ state: "visible" });
};

export const openImportWizard = async (page: Page) => {
  const importButton = page.getByTestId("import-transactions-button");
  await importButton.waitFor({ state: "visible" });

  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      await importButton.click({ force: true, noWaitAfter: true });
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
