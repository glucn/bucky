import { expect, test } from "@playwright/test";
import path from "path";
import sqlite3 from "sqlite3";
import { attachDebugLogging, closeApp, getMainWindow, launchApp } from "./helpers/importFlow";

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
  await new Promise<void>((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const resetBaseCurrencyState = async () => {
  await runSql(
    "INSERT INTO AppSetting (key, jsonValue, createdAt, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET jsonValue=excluded.jsonValue, updatedAt=CURRENT_TIMESTAMP",
    ["baseCurrency", '"USD"']
  );

  await runSql("DELETE FROM AppSetting WHERE key = ?", ["baseCurrencyReconciliationState"]);
};

test.describe.configure({ mode: "serial" });

test("base currency change shows banner, opens FX-only refresh, then clears on success", async () => {
  await resetBaseCurrencyState();

  const app = await launchApp({ ENRICHMENT_PROVIDER: "yahoo" });
  const page = await getMainWindow(app);
  attachDebugLogging(page, "base-currency-banner-resolve");

  try {
    await page.goto("http://localhost:3000/settings/auto-categorization", { waitUntil: "domcontentloaded" });
    await page.getByTestId("base-currency-settings").waitFor();

    await page.getByTestId("base-currency-select").selectOption("CAD");
    await page.getByTestId("base-currency-save").click();

    await page.getByTestId("base-currency-warning-banner").waitFor();

    await page.getByTestId("base-currency-refresh-fx").click();
    await page.getByTestId("enrichment-panel").waitFor();

    await expect(page.getByTestId("scope-security-metadata")).not.toBeChecked();
    await expect(page.getByTestId("scope-security-prices")).not.toBeChecked();
    await expect(page.getByTestId("scope-fx-rates")).toBeChecked();

    await page.getByTestId("start-enrichment-run").click();

    await page.waitForFunction(async () => {
      const state = await (window as any).electron.getBaseCurrencyImpactState();
      return state?.reconciliation?.status === "resolved";
    });

    await expect(page.getByTestId("base-currency-warning-banner")).toBeHidden();
  } finally {
    await closeApp(app);
  }
});

test("dismissed banner reappears on relaunch while reconciliation remains pending", async () => {
  await resetBaseCurrencyState();

  let app = await launchApp({ ENRICHMENT_PROVIDER: "yahoo" });
  let page = await getMainWindow(app);
  attachDebugLogging(page, "base-currency-banner-dismiss");

  try {
    await page.goto("http://localhost:3000/settings/auto-categorization", { waitUntil: "domcontentloaded" });
    await page.getByTestId("base-currency-settings").waitFor();

    await page.getByTestId("base-currency-select").selectOption("EUR");
    await page.getByTestId("base-currency-save").click();
    await page.getByTestId("base-currency-warning-banner").waitFor();

    await page.getByTestId("base-currency-dismiss").click();
    await expect(page.getByTestId("base-currency-warning-banner")).toBeHidden();
  } finally {
    await closeApp(app);
  }

  app = await launchApp({ ENRICHMENT_PROVIDER: "yahoo" });
  page = await getMainWindow(app);

  try {
    await page.goto("http://localhost:3000/settings/auto-categorization", { waitUntil: "domcontentloaded" });
    await page.getByTestId("base-currency-warning-banner").waitFor();
  } finally {
    await closeApp(app);
  }
});
