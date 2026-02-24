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

const invoke = async <T>(app: ElectronApplication, channel: string, arg?: unknown): Promise<T> => {
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

test("F-014 liability setup, conversion gating, history, and transaction semantics", async () => {
  test.setTimeout(240000);
  const app = await launchApp();

  try {
    await waitForHandler(app, "add-account");
    await waitForHandler(app, "upsert-liability-profile");
    await waitForHandler(app, "convert-liability-template");
    await waitForHandler(app, "get-liability-version-history");
    await waitForHandler(app, "get-liability-profile");
    await waitForHandler(app, "add-transaction");

    const createLiability = async (name: string) => {
      const created: any = await invoke(app, "add-account", {
        name,
        type: "user",
        subtype: "liability",
        currency: "USD",
      });
      expect(created?.account?.id).toBeTruthy();
      return created.account.id as string;
    };

    const creditCardId = await createLiability(`E2E Card ${Date.now()}`);
    const loanId = await createLiability(`E2E Loan ${Date.now()}`);
    const personalDebtId = await createLiability(`E2E Debt ${Date.now()}`);
    const blankId = await createLiability(`E2E Blank ${Date.now()}`);

    const ccResult: any = await invoke(app, "upsert-liability-profile", {
      accountId: creditCardId,
      profile: {
        template: "credit_card",
        currentAmountOwed: 1200,
        asOfDate: "2026-02-01",
        limitOrCeiling: 5000,
        statementClosingDay: 20,
        paymentDueDay: 5,
        minimumPaymentType: "percent",
        minimumPaymentPercent: 0.02,
        effectiveDate: "2026-02-01",
      },
    });
    expect(ccResult.success).toBe(true);

    const loanResult: any = await invoke(app, "upsert-liability-profile", {
      accountId: loanId,
      profile: {
        template: "loan_mortgage",
        currentAmountOwed: 210000,
        asOfDate: "2026-02-01",
        interestRate: 0.045,
        scheduledPaymentAmount: 1700,
        paymentFrequency: "monthly",
        paymentDueDay: 1,
        dueScheduleType: "monthly_day",
        dueDayOfMonth: 1,
        repaymentMethod: "fixed_payment",
        effectiveDate: "2026-02-01",
      },
    });
    expect(loanResult.success).toBe(true);

    const debtResult: any = await invoke(app, "upsert-liability-profile", {
      accountId: personalDebtId,
      profile: {
        template: "personal_debt",
        currentAmountOwed: 850,
        asOfDate: "2026-02-01",
        counterpartyName: "Morgan",
        effectiveDate: "2026-02-01",
      },
    });
    expect(debtResult.success).toBe(true);

    const blankResult: any = await invoke(app, "upsert-liability-profile", {
      accountId: blankId,
      profile: {
        template: "blank",
        currentAmountOwed: 300,
        asOfDate: "2026-02-01",
        effectiveDate: "2026-02-01",
      },
    });
    expect(blankResult.success).toBe(true);

    const blockedConversion: any = await invoke(app, "convert-liability-template", {
      accountId: blankId,
      targetTemplate: "personal_debt",
      profile: {
        effectiveDate: "2026-02-15",
      },
    });
    expect(blockedConversion.success).toBe(false);
    expect(blockedConversion.error).toContain("counterpartyName is required");

    const allowedConversion: any = await invoke(app, "convert-liability-template", {
      accountId: blankId,
      targetTemplate: "personal_debt",
      profile: {
        counterpartyName: "Riley",
        effectiveDate: "2026-02-15",
      },
    });
    expect(allowedConversion.success).toBe(true);

    await invoke(app, "save-liability-version", {
      accountId: blankId,
      profile: {
        template: "personal_debt",
        counterpartyName: "Riley",
        effectiveDate: "2026-04-01",
      },
    });
    await invoke(app, "save-liability-version", {
      accountId: blankId,
      profile: {
        template: "personal_debt",
        counterpartyName: "Riley",
        effectiveDate: "2026-03-01",
      },
    });

    const historyResult: any = await invoke(app, "get-liability-version-history", blankId);
    expect(historyResult.success).toBe(true);
    expect(historyResult.history.slice(0, 3).map((row: any) => row.effectiveDate)).toEqual([
      "2026-04-01",
      "2026-03-01",
      "2026-02-15",
    ]);

    const accounts: any[] = await invoke(app, "get-accounts", false);
    const sourceAccount = accounts.find((account) => account.id !== blankId && account.subtype === "asset");
    if (!sourceAccount) {
      throw new Error("No source asset account available for transaction setup");
    }

    await invoke(app, "add-transaction", {
      date: "2026-02-20",
      description: "Liability e2e transaction",
      fromAccountId: sourceAccount.id,
      toAccountId: blankId,
      amount: 25,
    });

    const profileResult: any = await invoke(app, "get-liability-profile", blankId);
    expect(profileResult.success).toBe(true);
    expect(profileResult.profile.hasPostedTransactions).toBe(true);
  } finally {
    await closeApp(app);
  }
});
