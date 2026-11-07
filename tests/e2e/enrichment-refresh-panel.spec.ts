import { appBaseUrl } from "./helpers/server";
import { expect, test } from "@playwright/test";
import crypto from "crypto";
import sqlite3 from "sqlite3";
import {
  attachDebugLogging,
  captureScreenshot,
  closeApp,
  getMainWindow,
  launchApp,
  testDbPath,
} from "./helpers/importFlow";

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

const seedPortfolioSecurityWithoutPrice = async (resolved = true) => {
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
    "INSERT INTO InvestmentProperties (id, accountId, tickerSymbol, market, securityType, quantity, costBasisMethod, lots, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [investmentPropsId, securityAccountId, "AAPL", resolved ? "NASDAQ" : null, "stock", 10, "FIFO", null, now, now]
  );
  await runSql(
    "INSERT INTO SecurityMetadata (id, ticker, market, quoteCurrency, lastFetchedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ticker, market) DO UPDATE SET quoteCurrency = excluded.quoteCurrency",
    [crypto.randomUUID(), "AAPL", "NASDAQ", "USD", now, now, now]
  );
  await runSql("DELETE FROM SecurityDailyPrice WHERE ticker = ? AND market = ?", ["AAPL", "NASDAQ"]);

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
      `${appBaseUrl}/investments/${seeded.portfolioId}/position/${seeded.tickerSymbol}`,
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

test("unresolved listing opens market review without inferring its market from ticker metadata", async () => {
  const app = await launchApp(), page = await getMainWindow(app);
  attachDebugLogging(page, "unresolved-market-cta");
  try {
    const seeded = await seedPortfolioSecurityWithoutPrice(false);
    await page.goto(`${appBaseUrl}/investments/${seeded.portfolioId}/position/${seeded.tickerSymbol}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("missing-enrichment-cta")).toContainText("Assign this holding's market");
    await expect(page.getByTestId("missing-enrichment-refresh-now")).toHaveCount(0);
    await page.getByRole("button", { name: "Review market currency" }).click();
    const dialog = page.getByTestId("security-price-dialog");
    await expect(dialog.getByText("AAPL · Market needs review · USD", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Price in USD")).toHaveCount(0);
    const accounts = await page.evaluate((portfolioId) => (window as any).electron.ipcRenderer.invoke("get-portfolio-accounts", portfolioId), seeded.portfolioId);
    expect(accounts.accounts.securities[0].investmentProperties.market).toBeNull();
  } catch (error) {
    await captureScreenshot(page, "unresolved-market-cta-failure"); throw error;
  } finally { await closeApp(app); }
});

test("completed-with-issues summary is visible in refresh panel", async () => {
  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "enrichment-summary");

  try {
    await page.goto(`${appBaseUrl}/`, { waitUntil: "domcontentloaded" });

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
    await page.goto(`${appBaseUrl}/`, { waitUntil: "domcontentloaded" });
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
    await page.goto(`${appBaseUrl}/`, { waitUntil: "domcontentloaded" });
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
