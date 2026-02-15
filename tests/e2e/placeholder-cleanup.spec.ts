import { expect, test } from "@playwright/test";
import sqlite3 from "sqlite3";
import path from "path";
import crypto from "crypto";
import {
  attachDebugLogging,
  captureScreenshot,
  closeApp,
  getMainWindow,
  launchApp,
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

const readRemainingCount = async (text: string | null): Promise<number> => {
  if (!text) {
    return 0;
  }
  const value = Number.parseInt(text, 10);
  return Number.isNaN(value) ? 0 : value;
};

test("cleanup mode reassigns placeholder rows to category and user account", async () => {
  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "placeholder-cleanup");

  try {
    await page.setViewportSize({ width: 1400, height: 900 });

    const accountId = await ensureAccount({
      name: `F010 Source Account ${Date.now()}`,
      type: "user",
      subtype: "asset",
    });
    const uncategorizedExpenseId = await ensureAccount({
      name: "Uncategorized Expense",
      type: "category",
      subtype: "liability",
    });

    const categoryName = `F010 Category ${Date.now()}`;
    const userAccountName = `F010 Transfer Destination ${Date.now()}`;
    const categoryId = crypto.randomUUID();
    const destinationAccountId = crypto.randomUUID();
    const now = new Date().toISOString();

    await runSql(
      "INSERT INTO Account (id, name, type, subtype, currency, isArchived, groupId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [categoryId, categoryName, "category", "liability", "USD", 0, null, now, now]
    );
    await runSql(
      "INSERT INTO Account (id, name, type, subtype, currency, isArchived, groupId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [destinationAccountId, userAccountName, "user", "asset", "USD", 0, null, now, now]
    );

    await seedPlaceholderEntry({
      accountId,
      placeholderAccountId: uncategorizedExpenseId,
      amount: -42.25,
      description: "COFFEE SHOP",
      date: "2025-08-03",
    });
    await seedPlaceholderEntry({
      accountId,
      placeholderAccountId: uncategorizedExpenseId,
      amount: -18.5,
      description: "GROCERY MARKET",
      date: "2025-08-04",
    });

    await page.goto(`http://localhost:3000/accounts/${accountId}/transactions`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("transactions-page").waitFor();
    await page.getByTestId("cleanup-mode-toggle").click();

    const remaining = page.getByTestId("cleanup-remaining-count");
    await remaining.waitFor();

    const initialCount = await readRemainingCount(await remaining.textContent());
    expect(initialCount).toBeGreaterThanOrEqual(2);

    const firstRow = page.locator('[data-testid^="cleanup-row-"]').first();
    await firstRow
      .getByTestId("cleanup-destination-picker")
      .selectOption({ label: `Category: ${categoryName}` });
    await firstRow.getByTestId("cleanup-apply-button").click();

    await expect
      .poll(async () => readRemainingCount(await remaining.textContent()))
      .toBe(initialCount - 1);

    const nextRow = page.locator('[data-testid^="cleanup-row-"]').first();
    await nextRow.getByTestId("cleanup-show-all-toggle").click();
    await nextRow
      .getByTestId("cleanup-destination-picker")
      .selectOption({ label: `Account: ${userAccountName}` });
    await nextRow.getByTestId("cleanup-apply-button").click();

    await expect
      .poll(async () => readRemainingCount(await remaining.textContent()))
      .toBe(initialCount - 2);

    await page.getByTestId("cleanup-mode-toggle").click();
    await page.getByRole("button", { name: "Edit" }).first().click();
    const destinationPicker = page.getByTestId("manual-transaction-category");
    await destinationPicker.waitFor();
    const pickerText = await destinationPicker.textContent();
    expect(pickerText).toContain(`Category: ${categoryName}`);
    expect(pickerText).toContain(`Account: ${userAccountName}`);
  } catch (error) {
    await captureScreenshot(page, "placeholder-cleanup-failure");
    throw error;
  } finally {
    await closeApp(app);
  }
});
