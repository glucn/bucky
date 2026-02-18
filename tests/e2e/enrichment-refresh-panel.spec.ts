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
  db.close();
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
      await window.electron.ipcRenderer.invoke("seed-enrichment-run-summary");
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
