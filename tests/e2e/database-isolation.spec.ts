import { test, expect } from "@playwright/test";
import { launchApp, getMainWindow, closeApp, openTransactionsPage } from "./helpers/importFlow";

test("the app reads the account seeded by the import fixture from the same test database", async () => {
  const app = await launchApp();
  try {
    const page = await getMainWindow(app);
    await openTransactionsPage(page);
    const accountId = new URL(page.url()).pathname.split("/")[2];
    const accounts = await page.evaluate(() =>
      (window as any).electron.ipcRenderer.invoke("get-accounts", true));
    expect(accounts.find((account: { id: string }) => account.id === accountId)?.name)
      .toMatch(/^E2E Seed Account /);
  } finally {
    await closeApp(app);
  }
});
