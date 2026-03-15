import { test, expect } from "@playwright/test";

const trendPayload = {
  range: {
    preset: "LAST_6_MONTHS",
    startMonthKey: "2025-10",
    endMonthKey: "2026-03",
  },
  months: [
    { monthKey: "2025-10", income: 1000, expense: 800, netIncome: 200 },
    { monthKey: "2025-11", income: 1200, expense: 900, netIncome: 300 },
    { monthKey: "2025-12", income: 1500, expense: 1200, netIncome: 300 },
    { monthKey: "2026-01", income: 1100, expense: 850, netIncome: 250 },
    { monthKey: "2026-02", income: 1300, expense: 1000, netIncome: 300 },
    { monthKey: "2026-03", income: 1400, expense: 1100, netIncome: 300 },
  ],
  metadata: {
    includesUnassignedImplicitly: true,
  },
};

const breakdownPayload = {
  range: {
    preset: "THIS_MONTH",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
  },
  kpis: {
    incomeTotal: 5000,
    expenseTotal: 3500,
    netIncome: 1500,
  },
  incomeRows: [
    { categoryId: "salary", categoryName: "Salary", amount: 4000, ratio: 0.8 },
    { categoryId: "bonus", categoryName: "Bonus", amount: 1000, ratio: 0.2 },
  ],
  expenseRows: [
    { categoryId: "rent", categoryName: "Rent", amount: 1500, ratio: 0.42857 },
    { categoryId: "food", categoryName: "Food", amount: 1000, ratio: 0.28571 },
    { categoryId: "utilities", categoryName: "Utilities", amount: 500, ratio: 0.14286 },
    { categoryId: "transport", categoryName: "Transport", amount: 500, ratio: 0.14286 },
  ],
};

test.describe("F-013 Reporting Basics E2E", () => {
  test("shows reports page with trend report by default", async ({ page }) => {
    await page.addInitScript((payload) => {
      (window as any).electron = {
        getIncomeExpenseTrendReport: async () => payload.trend,
        getIncomeExpenseBreakdownReport: async () => payload.breakdown,
        getAccountsWithGroups: async () => ({
          success: true,
          data: { groups: [], ungroupedAccounts: [] },
        }),
        getAppSetting: async () => null,
        setAppSetting: async () => ({ success: true }),
        ipcRenderer: {
          invoke: async (channel: string) => {
            if (channel === "get-accounts-with-balances") return [];
            if (channel === "reset-all-data") return { success: true };
            return null;
          },
          on: () => undefined,
        },
      };
    }, { trend: trendPayload, breakdown: breakdownPayload });

    await page.goto("http://localhost:3000/reports", { waitUntil: "networkidle" });
    await page.getByTestId("reports-page").waitFor({ state: "visible", timeout: 20000 });

    // Trend should be active by default
    await expect(page.getByTestId("report-switch-trend")).toBeVisible();
    await expect(page.getByTestId("reports-trend-panel")).toBeVisible();
  });

  test("switching between trend and breakdown reports", async ({ page }) => {
    await page.addInitScript((payload) => {
      (window as any).electron = {
        getIncomeExpenseTrendReport: async () => payload.trend,
        getIncomeExpenseBreakdownReport: async () => payload.breakdown,
        getAccountsWithGroups: async () => ({
          success: true,
          data: { groups: [], ungroupedAccounts: [] },
        }),
        getAppSetting: async () => null,
        setAppSetting: async () => ({ success: true }),
        ipcRenderer: {
          invoke: async (channel: string) => {
            if (channel === "get-accounts-with-balances") return [];
            if (channel === "reset-all-data") return { success: true };
            return null;
          },
          on: () => undefined,
        },
      };
    }, { trend: trendPayload, breakdown: breakdownPayload });

    await page.goto("http://localhost:3000/reports", { waitUntil: "networkidle" });
    await page.getByTestId("reports-page").waitFor({ state: "visible", timeout: 20000 });

    // Default is trend
    await expect(page.getByTestId("reports-trend-panel")).toBeVisible();
    await expect(page.getByTestId("reports-breakdown-panel")).not.toBeVisible();

    // Switch to breakdown
    await page.getByTestId("report-switch-breakdown").click();
    await expect(page.getByTestId("reports-breakdown-panel")).toBeVisible();
    await expect(page.getByTestId("reports-trend-panel")).not.toBeVisible();

    // Switch back to trend
    await page.getByTestId("report-switch-trend").click();
    await expect(page.getByTestId("reports-trend-panel")).toBeVisible();
    await expect(page.getByTestId("reports-breakdown-panel")).not.toBeVisible();
  });

  test("trend and breakdown filters are independent", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).electron = {
        getIncomeExpenseTrendReport: async (filter: { preset: string }) => {
          // Return different data based on preset to verify filter selection
          if (filter.preset === "LAST_3_MONTHS") {
            return {
              range: { preset: "LAST_3_MONTHS", startMonthKey: "2026-01", endMonthKey: "2026-03" },
              months: [
                { monthKey: "2026-01", income: 1100, expense: 850, netIncome: 250 },
                { monthKey: "2026-02", income: 1300, expense: 1000, netIncome: 300 },
                { monthKey: "2026-03", income: 1400, expense: 1100, netIncome: 300 },
              ],
              metadata: { includesUnassignedImplicitly: true },
            };
          }
          return {
            range: { preset: "LAST_6_MONTHS", startMonthKey: "2025-10", endMonthKey: "2026-03" },
            months: [
              { monthKey: "2025-10", income: 1000, expense: 800, netIncome: 200 },
              { monthKey: "2025-11", income: 1200, expense: 900, netIncome: 300 },
              { monthKey: "2025-12", income: 1500, expense: 1200, netIncome: 300 },
              { monthKey: "2026-01", income: 1100, expense: 850, netIncome: 250 },
              { monthKey: "2026-02", income: 1300, expense: 1000, netIncome: 300 },
              { monthKey: "2026-03", income: 1400, expense: 1100, netIncome: 300 },
            ],
            metadata: { includesUnassignedImplicitly: true },
          };
        },
        getIncomeExpenseBreakdownReport: async (filter: { preset: string }) => {
          if (filter.preset === "LAST_MONTH") {
            return {
              range: { preset: "LAST_MONTH", startDate: "2026-02-01", endDate: "2026-02-28" },
              kpis: { incomeTotal: 4000, expenseTotal: 3000, netIncome: 1000 },
              incomeRows: [{ categoryId: "salary", categoryName: "Salary", amount: 4000, ratio: 1 }],
              expenseRows: [{ categoryId: "rent", categoryName: "Rent", amount: 3000, ratio: 1 }],
            };
          }
          return {
            range: { preset: "THIS_MONTH", startDate: "2026-03-01", endDate: "2026-03-31" },
            kpis: { incomeTotal: 5000, expenseTotal: 3500, netIncome: 1500 },
            incomeRows: [
              { categoryId: "salary", categoryName: "Salary", amount: 4000, ratio: 0.8 },
              { categoryId: "bonus", categoryName: "Bonus", amount: 1000, ratio: 0.2 },
            ],
            expenseRows: [
              { categoryId: "rent", categoryName: "Rent", amount: 1500, ratio: 0.42857 },
              { categoryId: "food", categoryName: "Food", amount: 1000, ratio: 0.28571 },
              { categoryId: "utilities", categoryName: "Utilities", amount: 500, ratio: 0.14286 },
              { categoryId: "transport", categoryName: "Transport", amount: 500, ratio: 0.14286 },
            ],
          };
        },
        getAccountsWithGroups: async () => ({
          success: true,
          data: { groups: [], ungroupedAccounts: [] },
        }),
        getAppSetting: async () => null,
        setAppSetting: async () => ({ success: true }),
        ipcRenderer: {
          invoke: async (channel: string) => {
            if (channel === "get-accounts-with-balances") return [];
            if (channel === "reset-all-data") return { success: true };
            return null;
          },
          on: () => undefined,
        },
      };
    });

    await page.goto("http://localhost:3000/reports", { waitUntil: "networkidle" });
    await page.getByTestId("reports-page").waitFor({ state: "visible", timeout: 20000 });

    // Default trend filter is LAST_6_MONTHS
    await expect(page.getByTestId("reports-trend-panel")).toBeVisible();

    // Change trend filter to LAST_3_MONTHS
    await page.getByTestId("trend-filter-select").selectOption("LAST_3_MONTHS");

    // Switch to breakdown - should show default THIS_MONTH
    await page.getByTestId("report-switch-breakdown").click();
    await expect(page.getByTestId("reports-breakdown-panel")).toBeVisible();

    // Change breakdown filter to LAST_MONTH
    await page.getByTestId("breakdown-filter-select").selectOption("LAST_MONTH");

    // Switch back to trend - should still show LAST_3_MONTHS
    await page.getByTestId("report-switch-trend").click();
    const trendSelect = page.getByTestId("trend-filter-select");
    await expect(trendSelect).toHaveValue("LAST_3_MONTHS");

    // Switch back to breakdown - should still show LAST_MONTH
    await page.getByTestId("report-switch-breakdown").click();
    const breakdownSelect = page.getByTestId("breakdown-filter-select");
    await expect(breakdownSelect).toHaveValue("LAST_MONTH");
  });

  test("persists filter selection via app settings", async ({ page }) => {
    // Simulate persisted settings - service returns parsed objects
    const settings: Record<string, object> = {
      "reporting.trend.filter": { preset: "LAST_12_MONTHS" },
      "reporting.breakdown.filter": { preset: "LAST_3_MONTHS" },
    };

    await page.addInitScript((persistedSettings) => {
      (window as any).electron = {
        getIncomeExpenseTrendReport: async () => ({
          range: { preset: "LAST_12_MONTHS", startMonthKey: "2025-04", endMonthKey: "2026-03" },
          months: [
            { monthKey: "2025-04", income: 1000, expense: 800, netIncome: 200 },
            { monthKey: "2025-05", income: 1200, expense: 900, netIncome: 300 },
          ],
          metadata: { includesUnassignedImplicitly: true },
        }),
        getIncomeExpenseBreakdownReport: async () => ({
          range: { preset: "LAST_3_MONTHS", startDate: "2026-01-01", endDate: "2026-03-31" },
          kpis: { incomeTotal: 4000, expenseTotal: 3000, netIncome: 1000 },
          incomeRows: [{ categoryId: "salary", categoryName: "Salary", amount: 4000, ratio: 1 }],
          expenseRows: [{ categoryId: "rent", categoryName: "Rent", amount: 3000, ratio: 1 }],
        }),
        getAccountsWithGroups: async () => ({
          success: true,
          data: { groups: [], ungroupedAccounts: [] },
        }),
        getAppSetting: async (key: string) => {
          return persistedSettings[key] || null;
        },
        setAppSetting: async (key: string, value: object) => {
          persistedSettings[key] = value;
          return { success: true };
        },
        ipcRenderer: {
          invoke: async (channel: string) => {
            if (channel === "get-accounts-with-balances") return [];
            if (channel === "reset-all-data") return { success: true };
            return null;
          },
          on: () => undefined,
        },
      };
    }, settings);

    await page.goto("http://localhost:3000/reports", { waitUntil: "networkidle" });
    await page.getByTestId("reports-page").waitFor({ state: "visible", timeout: 20000 });

    // Trend should restore to LAST_12_MONTHS
    const trendSelect = page.getByTestId("trend-filter-select");
    await expect(trendSelect).toHaveValue("LAST_12_MONTHS");

    // Switch to breakdown - should restore to LAST_3_MONTHS
    await page.getByTestId("report-switch-breakdown").click();
    const breakdownSelect = page.getByTestId("breakdown-filter-select");
    await expect(breakdownSelect).toHaveValue("LAST_3_MONTHS");
  });

  test("coexists with investment performance reports route", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).electron = {
        getIncomeExpenseTrendReport: async () => ({
          range: { preset: "LAST_6_MONTHS", startMonthKey: "2025-10", endMonthKey: "2026-03" },
          months: [{ monthKey: "2026-03", income: 1400, expense: 1100, netIncome: 300 }],
          metadata: { includesUnassignedImplicitly: true },
        }),
        getIncomeExpenseBreakdownReport: async () => ({
          range: { preset: "THIS_MONTH", startDate: "2026-03-01", endDate: "2026-03-31" },
          kpis: { incomeTotal: 5000, expenseTotal: 3500, netIncome: 1500 },
          incomeRows: [{ categoryId: "salary", categoryName: "Salary", amount: 5000, ratio: 1 }],
          expenseRows: [{ categoryId: "rent", categoryName: "Rent", amount: 3500, ratio: 1 }],
        }),
        getAccountsWithGroups: async () => ({
          success: true,
          data: { groups: [], ungroupedAccounts: [] },
        }),
        getAppSetting: async () => null,
        setAppSetting: async () => ({ success: true }),
        getInvestmentPortfolio: async () => ({
          id: "portfolio-1",
          name: "Test Portfolio",
          currency: "USD",
        }),
        getInvestmentPerformanceReport: async () => ({
          period: { startDate: "2026-01-01", endDate: "2026-03-31" },
          totalReturn: { amount: 5000, currency: "USD" },
          returnPct: 10.5,
          holdings: [],
        }),
        ipcRenderer: {
          invoke: async (channel: string) => {
            if (channel === "get-accounts-with-balances") return [];
            if (channel === "reset-all-data") return { success: true };
            if (channel === "get-portfolio-performance") {
              return { success: true, performance: { totalReturn: 5000 } };
            }
            if (channel === "get-asset-allocation") {
              return { success: true, allocation: [] };
            }
            if (channel === "get-realized-gains") {
              return { success: true, gains: [] };
            }
            if (channel === "get-all-positions") {
              return { success: true, positions: [] };
            }
            return null;
          },
          on: () => undefined,
        },
      };
    });

    // Test income/expense reports route
    await page.goto("http://localhost:3000/reports", { waitUntil: "networkidle" });
    await page.getByTestId("reports-page").waitFor({ state: "visible", timeout: 20000 });
    await expect(page.getByTestId("report-switch-trend")).toBeVisible();

    // Test investment performance reports route
    await page.goto("http://localhost:3000/investments/portfolio-1/reports", { waitUntil: "networkidle" });
    await page.getByTestId("performance-reports-page").waitFor({ state: "visible", timeout: 20000 });
  });

  test("displays trend chart with grouped bars", async ({ page }) => {
    await page.addInitScript((payload) => {
      (window as any).electron = {
        getIncomeExpenseTrendReport: async () => payload.trend,
        getIncomeExpenseBreakdownReport: async () => payload.breakdown,
        getAccountsWithGroups: async () => ({
          success: true,
          data: { groups: [], ungroupedAccounts: [] },
        }),
        getAppSetting: async () => null,
        setAppSetting: async () => ({ success: true }),
        ipcRenderer: {
          invoke: async (channel: string) => {
            if (channel === "get-accounts-with-balances") return [];
            if (channel === "reset-all-data") return { success: true };
            return null;
          },
          on: () => undefined,
        },
      };
    }, { trend: trendPayload, breakdown: breakdownPayload });

    await page.goto("http://localhost:3000/reports", { waitUntil: "networkidle" });
    await page.getByTestId("reports-page").waitFor({ state: "visible", timeout: 20000 });

    // Verify trend container exists with grouped layout
    const trendContainer = page.getByTestId("reports-trend-container");
    await expect(trendContainer).toBeVisible();
    await expect(trendContainer).toHaveAttribute("data-layout", "grouped");

    // Verify income and expense bars are present
    await expect(page.getByTestId("trend-income-bar-2025-10")).toBeVisible();
    await expect(page.getByTestId("trend-expense-bar-2025-10")).toBeVisible();
  });

  test("displays breakdown with KPI and tables", async ({ page }) => {
    await page.addInitScript((payload) => {
      (window as any).electron = {
        getIncomeExpenseTrendReport: async () => payload.trend,
        getIncomeExpenseBreakdownReport: async () => payload.breakdown,
        getAccountsWithGroups: async () => ({
          success: true,
          data: { groups: [], ungroupedAccounts: [] },
        }),
        getAppSetting: async () => null,
        setAppSetting: async () => ({ success: true }),
        ipcRenderer: {
          invoke: async (channel: string) => {
            if (channel === "get-accounts-with-balances") return [];
            if (channel === "reset-all-data") return { success: true };
            return null;
          },
          on: () => undefined,
        },
      };
    }, { trend: trendPayload, breakdown: breakdownPayload });

    await page.goto("http://localhost:3000/reports", { waitUntil: "networkidle" });
    await page.getByTestId("reports-page").waitFor({ state: "visible", timeout: 20000 });

    // Switch to breakdown
    await page.getByTestId("report-switch-breakdown").click();

    // Verify KPI card
    await expect(page.getByTestId("reports-net-income-kpi-card")).toBeVisible();
    await expect(page.getByTestId("reports-net-income-kpi-value")).toBeVisible();

    // Verify income and expense tables
    await expect(page.getByTestId("reports-income-table")).toBeVisible();
    await expect(page.getByTestId("reports-expense-table")).toBeVisible();

    // Verify total rows
    await expect(page.getByTestId("reports-income-total-row")).toBeVisible();
    await expect(page.getByTestId("reports-expense-total-row")).toBeVisible();
  });
});
