import { test, expect } from "@playwright/test";
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

test("imports headered CSV with read-only preview", async () => {
  test.setTimeout(180000);
  const app = await launchApp();
  const page = await getMainWindow(app);
  attachDebugLogging(page, "headered");

  try {
    console.log("[headered] step: open transactions page");
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTransactionsPage(page);
    console.log("[headered] step: open import wizard");
    await openImportWizard(page);

    console.log("[headered] step: upload and map");
    await uploadCsv(page, "fake-credit-statement-with-header.csv");
    console.log("[headered] step: preview");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Map CSV Columns to System Fields" }).waitFor();
    await page.locator("#map-date").selectOption({ label: "Transaction Date" });
    await page.locator("#map-amount").selectOption({ label: "Transaction Amount" });
    await page.locator("#map-description").selectOption({ label: "Description" });

    console.log("[headered] step: confirm import");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("heading", { name: "Preview Transactions" }).waitFor();
    await expect(page.locator("tbody tr input")).toHaveCount(0);

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
      console.log("[headered] step: done");
      await page.getByText("COFFEE BEAN VANCOUVER BC").first().waitFor();
    }
  } catch (error) {
    await captureScreenshot(page, "import-headered-failure");
    throw error;
  } finally {
    await closeApp(app);
  }
});
