import { test, expect } from "@playwright/test";

test("opens on overview dashboard with empty allocation hint", async ({ page }) => {
  const overviewPayload = {
    asOfDate: "2026-02-13",
    netWorth: {
      currency: "USD",
      amount: 1234.56,
    },
    incomeExpenseTrend6m: {
      currency: "USD",
      months: [
        { monthKey: "2025-09", income: 100, expense: 50 },
        { monthKey: "2025-10", income: 100, expense: 50 },
        { monthKey: "2025-11", income: 100, expense: 50 },
        { monthKey: "2025-12", income: 100, expense: 50 },
        { monthKey: "2026-01", income: 100, expense: 50 },
        { monthKey: "2026-02", income: 100, expense: 50 },
      ],
    },
    investmentAllocation: {
      hasData: false,
      currency: "USD",
      total: 0,
      slices: [],
      emptyHintKey: "overview.investmentAllocation.empty",
    },
    metadata: {
      usedEstimatedFxRate: false,
      missingFxPairs: [],
    },
  };

  await page.addInitScript((payload) => {
    (window as any).electron = {
      getOverviewDashboard: async () => payload,
      getAccountsWithGroups: async () => ({
        success: true,
        data: {
          groups: [],
          ungroupedAccounts: [],
        },
      }),
      ipcRenderer: {
        invoke: async (channel: string) => {
          if (channel === "get-accounts-with-balances") {
            return [];
          }
          if (channel === "reset-all-data") {
            return { success: true };
          }
          return null;
        },
        on: () => undefined,
      },
    };
  }, overviewPayload);

  try {
    await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
    await page.getByTestId("overview-dashboard").waitFor({ state: "visible", timeout: 20000 });
    await expect(page.getByTestId("overview-net-worth-card")).toBeVisible();
    await expect(page.getByTestId("overview-trend-card")).toBeVisible();
    await expect(page.getByTestId("overview-allocation-card")).toBeVisible();
    await expect(page.getByTestId("overview-allocation-empty")).toBeVisible();
  } finally {
    await page.close();
  }
});
