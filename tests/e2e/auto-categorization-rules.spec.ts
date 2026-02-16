import { expect, test } from "@playwright/test";
import crypto from "crypto";
import path from "path";
import sqlite3 from "sqlite3";
import {
  attachDebugLogging,
  captureScreenshot,
  closeApp,
  getMainWindow,
  launchApp,
  openImportWizard,
  uploadCsv,
} from "./helpers/importFlow";

const testDbPath = path.join(__dirname, "..", "..", "prisma", "test.db");

const runSql = async (sql: string, params: unknown[] = []) => {
  const db = new sqlite3.Database(testDbPath);
  await new Promise<void>((resolve, reject) => {
    db.run(sql, params, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  db.close();
};

const readOne = async <T>(sql: string, params: unknown[] = []) => {
  const db = new sqlite3.Database(testDbPath);
  const row = await new Promise<T>((resolve, reject) => {
    db.get(sql, params, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result as T);
    });
  });
  db.close();
  return row;
};

const ensureAccount = async ({
  name,
  type,
  subtype,
}: {
  name: string;
  type: "user" | "category";
  subtype: "asset" | "liability";
}) => {
  const existing = await readOne<{ id: string } | undefined>(
    "SELECT id FROM Account WHERE name = ? LIMIT 1",
    [name]
  );

  if (existing?.id) {
    return existing.id;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await runSql(
    "INSERT INTO Account (id, name, type, subtype, currency, isArchived, groupId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, name, type, subtype, "USD", 0, null, now, now]
  );

  return id;
};

const seedPlaceholderEntry = async ({
  accountId,
  placeholderAccountId,
  amount,
  description,
  date,
}: {
  accountId: string;
  placeholderAccountId: string;
  amount: number;
  description: string;
  date: string;
}) => {
  const entryId = crypto.randomUUID();
  const fromLineId = crypto.randomUUID();
  const toLineId = crypto.randomUUID();
  const now = new Date().toISOString();

  await runSql(
    "INSERT INTO JournalEntry (id, date, description, type, entryType, postingDate, displayOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [entryId, date, description, null, null, null, Date.now(), now, now]
  );

  await runSql(
    "INSERT INTO JournalLine (id, entryId, accountId, amount, currency, exchangeRate, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [fromLineId, entryId, accountId, amount, "USD", null, description]
  );

  await runSql(
    "INSERT INTO JournalLine (id, entryId, accountId, amount, currency, exchangeRate, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [toLineId, entryId, placeholderAccountId, amount, "USD", null, description]
  );
};

const seedExactRule = async ({
  normalizedPattern,
  targetCategoryAccountId,
}: {
  normalizedPattern: string;
  targetCategoryAccountId: string;
}) => {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await runSql(
    "INSERT INTO AutoCategorizationRule (id, normalizedPattern, matchType, targetCategoryAccountId, lastConfirmedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, normalizedPattern, "exact", targetCategoryAccountId, now, now, now]
  );

  return id;
};

const importSampleCsv = async (page: Parameters<typeof openImportWizard>[0]) => {
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
  await page.getByText("Import completed successfully.").waitFor();
};

const readSummaryCount = async (page: Parameters<typeof openImportWizard>[0], label: string) => {
  const row = page.locator(`xpath=//strong[normalize-space()='${label}:']/parent::*`).first();
  await row.waitFor();
  const text = await row.textContent();
  const matched = text?.match(/\d+/);
  return matched ? Number.parseInt(matched[0], 10) : 0;
};

test("learned cleanup confirmation is auto-applied on later import", async () => {
  const sourceAccountId = await ensureAccount({
    name: `F011 Cleanup Source ${Date.now()}`,
    type: "user",
    subtype: "asset",
  });
  const learnedCategoryName = `F011 Learned Category ${Date.now()}`;
  const learnedCategoryId = await ensureAccount({
    name: learnedCategoryName,
    type: "category",
    subtype: "liability",
  });
  const uncategorizedExpenseId = await ensureAccount({
    name: "Uncategorized Expense",
    type: "category",
    subtype: "liability",
  });
  const importAccountId = await ensureAccount({
    name: `F011 Import Account ${Date.now()}`,
    type: "user",
    subtype: "asset",
  });

  await seedPlaceholderEntry({
    accountId: sourceAccountId,
    placeholderAccountId: uncategorizedExpenseId,
    amount: -12.45,
    description: "COFFEE BEAN VANCOUVER BC",
    date: "2025-08-01",
  });

  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "auto-categorization-learning");

  try {
    await page.setViewportSize({ width: 1400, height: 900 });

    await page.goto(`http://localhost:3000/accounts/${sourceAccountId}/transactions`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("transactions-page").waitFor();
    await page.getByTestId("cleanup-mode-toggle").click();

    const cleanupRow = page.locator('[data-testid^="cleanup-row-"]').first();
    await cleanupRow
      .getByTestId("cleanup-destination-picker")
      .selectOption({ label: `Category: ${learnedCategoryName}` });
    await cleanupRow.getByTestId("cleanup-apply-button").click();
    await expect(page.locator('[data-testid^="cleanup-row-"]')).toHaveCount(0);

    const learnedRule = await readOne<{ id: string } | undefined>(
      "SELECT id FROM AutoCategorizationRule WHERE normalizedPattern = ? AND matchType = 'exact' LIMIT 1",
      ["coffee bean vancouver bc"]
    );
    expect(learnedRule?.id).toBeTruthy();

    await page.goto(`http://localhost:3000/accounts/${importAccountId}/transactions`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("transactions-page").waitFor();

    await importSampleCsv(page);
    expect(await readSummaryCount(page, "Exact auto-applied")).toBe(2);
  } catch (error) {
    await captureScreenshot(page, "auto-categorization-learning-failure");
    throw error;
  } finally {
    await closeApp(app);
  }
});

test("deleting a rule from settings changes later import behavior", async () => {
  await runSql(
    "DELETE FROM AutoCategorizationRule WHERE normalizedPattern = ? AND matchType = 'exact'",
    ["coffee bean vancouver bc"]
  );

  const categoryId = await ensureAccount({
    name: `F011 Rule Category ${Date.now()}`,
    type: "category",
    subtype: "liability",
  });
  await seedExactRule({
    normalizedPattern: "coffee bean vancouver bc",
    targetCategoryAccountId: categoryId,
  });
  const importAccountId = await ensureAccount({
    name: `F011 Delete Rule Import Account ${Date.now()}`,
    type: "user",
    subtype: "asset",
  });

  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "auto-categorization-delete");

  try {
    await page.setViewportSize({ width: 1400, height: 900 });

    await page.goto("http://localhost:3000/settings/auto-categorization", {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("auto-categorization-settings-page").waitFor();
    await page.getByText("coffee bean vancouver bc").first().waitFor();

    const ruleRow = page
      .locator("tr", { hasText: "coffee bean vancouver bc" })
      .first();
    await ruleRow.getByRole("button", { name: "Delete" }).click();
    await page.getByTestId("auto-categorization-delete-confirmation").waitFor();
    await page.getByTestId("auto-categorization-delete-confirm-button").click();
    await expect(page.locator("tr", { hasText: "coffee bean vancouver bc" })).toHaveCount(0);

    await page.goto(`http://localhost:3000/accounts/${importAccountId}/transactions`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("transactions-page").waitFor();

    await importSampleCsv(page);
    expect(await readSummaryCount(page, "Exact auto-applied")).toBe(0);
  } catch (error) {
    await captureScreenshot(page, "auto-categorization-delete-failure");
    throw error;
  } finally {
    await closeApp(app);
  }
});
