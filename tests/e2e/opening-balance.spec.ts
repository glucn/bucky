import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import path from "path";

const appEntry = path.join(__dirname, "..", "..", ".webpack", "main", "index.js");

const launchApp = async (): Promise<ElectronApplication> => {
  return electron.launch({
    args: [appEntry],
    env: {
      ...process.env,
      NODE_ENV: "test",
      VITEST: "true",
      ELECTRON_IS_DEV: "1",
    },
  });
};

const getMainWindow = async (app: ElectronApplication): Promise<Page> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (const window of app.windows()) {
      const url = await window.url();
      if (url.includes("localhost:3000")) {
        await window.waitForLoadState("domcontentloaded");
        return window;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return page;
};

test("opening balance adjusts for older transaction mutations", async () => {
  test.setTimeout(180000);
  const app = await launchApp();

  try {
    const page = await getMainWindow(app);
    await page.waitForFunction(() => !!(window as any).electron?.ipcRenderer);

    const state = await page.evaluate(async () => {
      const now = Date.now();
      const accountName = `E2E Opening ${now}`;

      const created = await (window as any).electron.ipcRenderer.invoke("add-account", {
        name: accountName,
        type: "user",
        subtype: "asset",
        currency: "USD",
      });
      const accountId = created.account.id;

      await (window as any).electron.setOpeningBalance({
        accountId,
        displayAmount: 100,
        asOfDate: "2024-02-01",
      });

      const categoriesResp = await (window as any).electron.ipcRenderer.invoke(
        "get-accounts-with-groups",
        { includeArchived: false, accountType: "category" }
      );
      const categories = categoriesResp.data?.ungroupedAccounts || [];
      const uncategorizedIncome = categories.find(
        (account: any) => account.name === "Uncategorized Income"
      );
      if (!uncategorizedIncome) {
        throw new Error("Uncategorized Income not found");
      }

      const createdEntryResp = await (window as any).electron.ipcRenderer.invoke(
        "create-journal-entry",
        {
          date: "2024-01-15",
          description: "Older income",
          fromAccountId: uncategorizedIncome.id,
          toAccountId: accountId,
          amount: 50,
        }
      );

      const createdEntry = createdEntryResp.entry;
      const primaryLine = createdEntry.lines.find(
        (line: any) => line.accountId === accountId
      );

      const balanceAfterInsert = await (window as any).electron.ipcRenderer.invoke(
        "get-account-balance",
        accountId
      );
      const openingAfterInsert = await (window as any).electron.getOpeningBalance(accountId);

      await (window as any).electron.ipcRenderer.invoke("update-journal-entry-line", {
        lineId: primaryLine.id,
        fromAccountId: uncategorizedIncome.id,
        toAccountId: accountId,
        amount: 50,
        date: "2024-02-15",
        description: "Moved later",
      });

      const balanceAfterMoveLater = await (window as any).electron.ipcRenderer.invoke(
        "get-account-balance",
        accountId
      );
      const openingAfterMoveLater = await (window as any).electron.getOpeningBalance(accountId);

      await (window as any).electron.ipcRenderer.invoke("update-journal-entry-line", {
        lineId: primaryLine.id,
        fromAccountId: uncategorizedIncome.id,
        toAccountId: accountId,
        amount: 50,
        date: "2024-01-20",
        description: "Moved earlier",
      });

      const balanceAfterMoveEarlier = await (window as any).electron.ipcRenderer.invoke(
        "get-account-balance",
        accountId
      );
      const openingAfterMoveEarlier = await (window as any).electron.getOpeningBalance(accountId);

      await (window as any).electron.ipcRenderer.invoke(
        "delete-journal-entry",
        createdEntry.id
      );

      const balanceAfterDelete = await (window as any).electron.ipcRenderer.invoke(
        "get-account-balance",
        accountId
      );
      const openingAfterDelete = await (window as any).electron.getOpeningBalance(accountId);

      return {
        balanceAfterInsert,
        openingAfterInsert,
        balanceAfterMoveLater,
        openingAfterMoveLater,
        balanceAfterMoveEarlier,
        openingAfterMoveEarlier,
        balanceAfterDelete,
        openingAfterDelete,
      };
    });

    expect(state.balanceAfterInsert).toBe(100);
    expect(state.openingAfterInsert?.displayAmount).toBe(50);

    expect(state.balanceAfterMoveLater).toBe(150);
    expect(state.openingAfterMoveLater?.displayAmount).toBe(100);

    expect(state.balanceAfterMoveEarlier).toBe(100);
    expect(state.openingAfterMoveEarlier?.displayAmount).toBe(50);

    expect(state.balanceAfterDelete).toBe(100);
    expect(state.openingAfterDelete?.displayAmount).toBe(100);
  } finally {
    await app.close();
  }
});
