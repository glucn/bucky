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

const seedPortfolioSecurityWithoutPrice = async () => {
  const portfolioId = crypto.randomUUID();
  const securityAccountId = crypto.randomUUID();
  const investmentPropsId = crypto.randomUUID();
  const now = new Date().toISOString();

  await runSql(
    "INSERT INTO AccountGroup (id, name, accountType, displayOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
    [portfolioId, `F017 Portfolio ${Date.now()}`, "user", 0, now, now]
  );

  await runSql(
    "INSERT INTO Account (id, name, type, subtype, currency, isArchived, groupId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [securityAccountId, "AAPL", "user", "asset", "USD", 0, portfolioId, now, now]
  );

  await runSql(
    "INSERT INTO InvestmentProperties (id, accountId, tickerSymbol, securityType, quantity, costBasisMethod, lots, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [investmentPropsId, securityAccountId, "AAPL", "stock", 10, "FIFO", null, now, now]
  );

  return {
    portfolioId,
    tickerSymbol: "AAPL",
  };
};

test("missing market data CTA opens refresh panel", async () => {
  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "enrichment-cta");

  try {
    const seeded = await seedPortfolioSecurityWithoutPrice();

    await page.goto(
      `http://localhost:3000/investments/${seeded.portfolioId}/position/${seeded.tickerSymbol}`,
      { waitUntil: "domcontentloaded" }
    );

    await page.getByTestId("missing-enrichment-cta").waitFor();
    await page.getByTestId("missing-enrichment-refresh-now").click();
    await page.getByTestId("enrichment-panel").waitFor();
  } catch (error) {
    await captureScreenshot(page, "enrichment-cta-failure");
    throw error;
  } finally {
    await closeApp(app);
  }
});

test("completed-with-issues summary is visible in refresh panel", async () => {
  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "enrichment-summary");

  try {
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });

    await page.evaluate(async () => {
      await (window as any).electron.ipcRenderer.invoke("seed-enrichment-run-summary");
    });

    await page.getByTestId("open-enrichment-panel").click();
    await page.getByTestId("enrichment-failed-items-list").waitFor();
    await expect(page.getByText("CAD/USD")).toBeVisible();
  } catch (error) {
    await captureScreenshot(page, "enrichment-summary-failure");
    throw error;
  } finally {
    await closeApp(app);
  }
});

test("refresh run completes when all categories are deselected", async () => {
  await runSql(
    "INSERT INTO AppSetting (key, jsonValue, createdAt, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET jsonValue=excluded.jsonValue, updatedAt=CURRENT_TIMESTAMP",
    ["baseCurrency", '"CAD"']
  );

  const app = await launchApp({ ENRICHMENT_PROVIDER: "yahoo" });
  const page = await getMainWindow(app);
  attachDebugLogging(page, "enrichment-run-completes");

  try {
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("open-enrichment-panel").click();
    await page.getByTestId("enrichment-panel").waitFor();

    await expect(page.getByTestId("start-enrichment-run")).toBeEnabled();

    await page.getByTestId("scope-security-metadata").uncheck();
    await page.getByTestId("scope-security-prices").uncheck();
    await page.getByTestId("scope-fx-rates").uncheck();

    await page.getByTestId("start-enrichment-run").click();

    await page.waitForFunction(async () => {
      const state = await (window as any).electron.getEnrichmentPanelState();
      return Boolean(state.latestSummary && state.latestSummary.status === "completed");
    });

    await expect(page.getByText("FX: 0/0 (Done)")).toBeVisible();
  } catch (error) {
    await captureScreenshot(page, "enrichment-run-completes-failure");
    throw error;
  } finally {
    await closeApp(app);
  }
});

test("fx-only run derives pair from account currency and base currency", async () => {
  await runSql(
    "INSERT INTO AppSetting (key, jsonValue, createdAt, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET jsonValue=excluded.jsonValue, updatedAt=CURRENT_TIMESTAMP",
    ["baseCurrency", '"CAD"']
  );

  const app = await launchApp({ ENRICHMENT_PROVIDER: "yahoo" });
  const page = await getMainWindow(app);
  attachDebugLogging(page, "enrichment-fx-pairs");

  try {
    await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
    await page.getByTestId("open-enrichment-panel").click();
    await page.getByTestId("enrichment-panel").waitFor();

    await expect(page.getByTestId("start-enrichment-run")).toBeEnabled();

    await page.getByTestId("scope-security-metadata").uncheck();
    await page.getByTestId("scope-security-prices").uncheck();
    await page.getByTestId("start-enrichment-run").click();

    await page.waitForFunction(async () => {
      const state = await (window as any).electron.getEnrichmentPanelState();
      const summary = state.latestSummary;
      return Boolean(
        summary &&
          summary.status !== "running" &&
          summary.categoryProgress?.fxRates?.total >= 1 &&
          summary.categoryProgress?.fxRates?.processed === summary.categoryProgress?.fxRates?.total
      );
    });

    await expect(page.getByText(/^FX:/)).toBeVisible();
  } catch (error) {
    await captureScreenshot(page, "enrichment-fx-pairs-failure");
    throw error;
  } finally {
    await closeApp(app);
  }
});
