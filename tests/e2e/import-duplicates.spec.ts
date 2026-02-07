import { test, expect } from "@playwright/test";
import {
  attachDebugLogging,
  captureScreenshot,
  getMainWindow,
  launchApp,
  openImportWizard,
  openTransactionsPage,
  uploadCsv,
} from "./helpers/importFlow";

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

    await page.getByRole("button", { name: "Skip duplicates" }).click();
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
    await captureScreenshot(page, "import-duplicates-failure");
    throw error;
  } finally {
    await app.close();
  }
});
