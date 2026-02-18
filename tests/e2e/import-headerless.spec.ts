import { test } from "@playwright/test";
import {
  attachDebugLogging,
  captureScreenshot,
  closeApp,
  getMainWindow,
  launchApp,
  openImportWizard,
  openTransactionsPage,
  uploadCsv,
} from "./helpers/importFlow";

test("headerless CSV import completes with manual mapping", async () => {
  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "headerless");

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTransactionsPage(page);
    await openImportWizard(page);

    await page.getByTestId("csv-has-header-row").uncheck();
    await uploadCsv(page, "fake-credit-statement-headerless.csv");
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("heading", { name: "Map CSV Columns to System Fields" }).waitFor();
    await page.getByText("This CSV file does not have a header row").waitFor();
    await page.locator("#map-date").selectOption("Column 1");
    await page.locator("#map-description").selectOption("Column 2");
    await page.locator("#map-debit").selectOption("Column 3");
    await page.locator("#map-credit").selectOption("Column 4");

    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Preview Transactions" }).waitFor();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Confirm Import" }).waitFor();
    await page.getByRole("button", { name: "Confirm & Import" }).click();

    const successBanner = page.getByText("Import completed successfully.");
    const noImportBanner = page
      .locator('[role="alert"]', { hasText: "No transactions were imported." })
      .first();

    const imported = await Promise.race([
      successBanner
        .waitFor({ timeout: 10000 })
        .then(() => true)
        .catch(() => false),
      noImportBanner
        .waitFor({ timeout: 10000 })
        .then(() => false)
        .catch(() => false),
    ]);

    if (imported) {
      await page.getByRole("button", { name: "Done" }).click();
      await page.getByTestId("transactions-page").waitFor();
    }
  } catch (error) {
    await captureScreenshot(page, "import-headerless-failure");
    throw error;
  } finally {
    await closeApp(app);
  }
});
