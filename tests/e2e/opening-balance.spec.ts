import { test, expect, type ElectronApplication } from "@playwright/test";
import { closeApp, launchApp } from "./helpers/importFlow";

const waitForHandler = async (app: ElectronApplication, channel: string) => {
  for (let i = 0; i < 40; i += 1) {
    const exists = await app.evaluate(({ ipcMain }, ch) => {
      const handlers = (ipcMain as any)._invokeHandlers as Map<string, Function>;
      return handlers?.has(ch) ?? false;
    }, channel);
    if (exists) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`IPC handler not ready: ${channel}`);
};

const invoke = async <T>(
  app: ElectronApplication,
  channel: string,
  arg?: unknown
): Promise<T> => {
  return app.evaluate(
    async ({ ipcMain }, payload: { channel: string; arg: unknown }) => {
      const handlers = (ipcMain as any)._invokeHandlers as Map<string, Function>;
      const handler = handlers?.get(payload.channel);
      if (!handler) {
        throw new Error(`Handler not found: ${payload.channel}`);
      }
      return handler({} as any, payload.arg);
    },
    { channel, arg }
  );
};

test("opening balance adjusts for older transaction mutations", async () => {
  test.setTimeout(180000);
  const app = await launchApp();

  try {
    await waitForHandler(app, "add-account");

    const accountName = `E2E Opening ${Date.now()}`;
    const created: any = await invoke(app, "add-account", {
      name: accountName,
      type: "user",
      subtype: "asset",
      currency: "USD",
    });
    const accountId = created.account.id;

    await invoke(app, "set-opening-balance", {
      accountId,
      displayAmount: 100,
      asOfDate: "2024-02-01",
    });

    const allAccounts: any[] = await invoke(app, "get-accounts", false);
    const categories = allAccounts.filter((account) => account.type === "category");
    const uncategorizedIncome = categories.find(
      (account: any) => account.name === "Uncategorized Income"
    );
    expect(uncategorizedIncome).toBeTruthy();

    const createdEntryResp: any = await invoke(app, "add-transaction", {
      date: "2024-01-15",
      description: "Older income",
      fromAccountId: uncategorizedIncome.id,
      toAccountId: accountId,
      amount: 50,
    });
    const createdEntry = createdEntryResp.entry;
    const primaryLine = createdEntry.lines.find((line: any) => line.accountId === accountId);

    const balanceAfterInsertResult: any = await invoke(app, "get-account-balance", accountId);
    const balanceAfterInsert = balanceAfterInsertResult.balance;
    const openingAfterInsert = await invoke<{ displayAmount: number } | null>(
      app,
      "get-opening-balance",
      accountId
    );

    await invoke(app, "update-transaction", {
      lineId: primaryLine.id,
      fromAccountId: uncategorizedIncome.id,
      toAccountId: accountId,
      amount: 50,
      date: "2024-02-15",
      description: "Moved later",
    });

    const balanceAfterMoveLaterResult: any = await invoke(app, "get-account-balance", accountId);
    const balanceAfterMoveLater = balanceAfterMoveLaterResult.balance;
    const openingAfterMoveLater = await invoke<{ displayAmount: number } | null>(
      app,
      "get-opening-balance",
      accountId
    );

    await invoke(app, "update-transaction", {
      lineId: primaryLine.id,
      fromAccountId: uncategorizedIncome.id,
      toAccountId: accountId,
      amount: 50,
      date: "2024-01-20",
      description: "Moved earlier",
    });

    const balanceAfterMoveEarlierResult: any = await invoke(app, "get-account-balance", accountId);
    const balanceAfterMoveEarlier = balanceAfterMoveEarlierResult.balance;
    const openingAfterMoveEarlier = await invoke<{ displayAmount: number } | null>(
      app,
      "get-opening-balance",
      accountId
    );

    await invoke(app, "delete-transaction", createdEntry.id);

    const balanceAfterDeleteResult: any = await invoke(app, "get-account-balance", accountId);
    const balanceAfterDelete = balanceAfterDeleteResult.balance;
    const openingAfterDelete = await invoke<{ displayAmount: number } | null>(
      app,
      "get-opening-balance",
      accountId
    );

    expect(balanceAfterInsert).toBe(100);
    expect(openingAfterInsert?.displayAmount).toBe(50);

    expect(balanceAfterMoveLater).toBe(150);
    expect(openingAfterMoveLater?.displayAmount).toBe(100);

    expect(balanceAfterMoveEarlier).toBe(100);
    expect(openingAfterMoveEarlier?.displayAmount).toBe(50);

    expect(balanceAfterDelete).toBe(100);
    expect(openingAfterDelete?.displayAmount).toBe(100);
  } finally {
    await closeApp(app);
  }
});
