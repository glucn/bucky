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

test("imports headered CSV with read-only preview", async () => {
  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "headered");

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
    await expect(page.locator("tbody tr input")).toHaveCount(0);

    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Confirm Import" }).waitFor();
    await page.getByRole("button", { name: "Confirm & Import" }).click();
    await page.getByText("Import completed successfully.").waitFor();
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByText("COFFEE BEAN VANCOUVER BC").first().waitFor();
  } catch (error) {
    await captureScreenshot(page, "import-headered-failure");
    throw error;
  } finally {
    await app.close();
  }
});
