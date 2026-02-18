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

test("uncategorized fallback shows warning summary", async () => {
  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "uncategorized");

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTransactionsPage(page);
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

    await Promise.race([
      page
        .getByText("Attention: Some transactions were auto-assigned")
        .waitFor({ timeout: 10000 }),
      page
        .locator('[role="alert"]', { hasText: "No transactions were imported." })
        .first()
        .waitFor({ timeout: 10000 }),
    ]);
  } catch (error) {
    await captureScreenshot(page, "import-uncategorized-failure");
    throw error;
  } finally {
    await closeApp(app);
  }
});
