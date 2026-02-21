import { beforeEach, describe, expect, it } from "vitest";
import { AccountSubtype, AccountType } from "../shared/accountTypes";
import { appSettingsService } from "./appSettingsService";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { investmentService } from "./investmentService";
import { overviewService } from "./overviewService";

function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthDateOffset(months: number, day: number = 10): string {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  date.setDate(day);
  return date.toISOString().slice(0, 10);
}

async function seedFxRate(
  sourceCurrency: string,
  targetCurrency: string,
  marketDate: string,
  rate: number
): Promise<void> {
  await databaseService.prismaClient.fxDailyRate.create({
    data: {
      sourceCurrency,
      targetCurrency,
      marketDate,
      rate,
    },
  });
}

describe("overviewService", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("returns a single payload shape for all dashboard cards", async () => {
    const payload = await overviewService.getOverviewDashboard();

    expect(payload).toHaveProperty("asOfDate");
    expect(payload).toHaveProperty("netWorth");
    expect(payload).toHaveProperty("incomeExpenseTrend6m");
    expect(payload).toHaveProperty("investmentAllocation");
    expect(payload).toHaveProperty("metadata");
  });

  it("computes net worth as assets minus liabilities and excludes future-dated entries", async () => {
    const accounts = await databaseService.getAccounts(true);
    const openingBalanceEquity = accounts.find((account) => account.name === "Opening Balances");
    if (!openingBalanceEquity) {
      throw new Error("Expected Opening Balances account to exist");
    }

    const wallet = await databaseService.createAccount({
      name: "Wallet",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "USD",
    });

    const creditCard = await databaseService.createAccount({
      name: "Credit Card",
      type: AccountType.User,
      subtype: AccountSubtype.Liability,
      currency: "USD",
    });

    await databaseService.createJournalEntry({
      date: dateOffset(-5),
      amount: 100,
      description: "Past asset funding",
      fromAccountId: openingBalanceEquity.id,
      toAccountId: wallet.id,
    });

    await databaseService.createJournalEntry({
      date: dateOffset(-3),
      amount: 40,
      description: "Past liability funding",
      fromAccountId: creditCard.id,
      toAccountId: openingBalanceEquity.id,
    });

    await databaseService.createJournalEntry({
      date: dateOffset(3),
      amount: 500,
      description: "Future asset funding",
      fromAccountId: openingBalanceEquity.id,
      toAccountId: wallet.id,
    });

    const payload = await overviewService.getOverviewDashboard();

    expect(payload.netWorth.currency).toBe("USD");
    expect(payload.netWorth.amount).toBe(60);
  });

  it("uses configured base currency for reporting totals", async () => {
    const accounts = await databaseService.getAccounts(true);
    const openingBalanceEquity = accounts.find((account) => account.name === "Opening Balances");
    if (!openingBalanceEquity) {
      throw new Error("Expected Opening Balances account to exist");
    }

    await appSettingsService.setBaseCurrency("CAD");

    const usdWallet = await databaseService.createAccount({
      name: "USD Wallet",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "USD",
    });

    await databaseService.createJournalEntry({
      date: dateOffset(-3),
      amount: 100,
      description: "Fund USD wallet",
      fromAccountId: openingBalanceEquity.id,
      toAccountId: usdWallet.id,
    });

    await seedFxRate("USD", "CAD", dateOffset(-2), 1.3);

    const payload = await overviewService.getOverviewDashboard(dateOffset(-1));

    expect(payload.netWorth.currency).toBe("CAD");
    expect(payload.netWorth.amount).toBe(130);
  });

  it("returns N/A net worth when required conversion is unavailable", async () => {
    await appSettingsService.setBaseCurrency("USD");

    const jpyWallet = await databaseService.createAccount({
      name: "JPY Wallet",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "JPY",
    });

    await databaseService.createOpeningBalanceEntry(
      [
        {
          accountId: jpyWallet.id,
          balance: 10000,
        },
      ],
      new Date(dateOffset(-1))
    );

    const payload = await overviewService.getOverviewDashboard();

    expect(payload.netWorth.currency).toBe("USD");
    expect(payload.netWorth.amount).toBeNull();
    expect(payload.metadata.missingFxPairs).toContain("JPY->USD");
  });

  it("uses investment market value in net worth when a price exists", async () => {
    const asOfDate = dateOffset(-1);
    const accounts = await databaseService.getAccounts(true);
    const openingBalanceEquity = accounts.find((account) => account.name === "Opening Balances");
    if (!openingBalanceEquity) {
      throw new Error("Expected Opening Balances account to exist");
    }

    const externalCash = await databaseService.createAccount({
      name: "External Cash",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "USD",
    });

    await databaseService.createJournalEntry({
      date: dateOffset(-10),
      amount: 1000,
      description: "Seed external cash",
      fromAccountId: openingBalanceEquity.id,
      toAccountId: externalCash.id,
    });

    const portfolio = await investmentService.createInvestmentPortfolio("Brokerage", "USD");

    await investmentService.depositCash(
      portfolio.group.id,
      200,
      externalCash.id,
      dateOffset(-9),
      "Fund portfolio"
    );

    await investmentService.recordBuy({
      portfolioId: portfolio.group.id,
      tickerSymbol: "VTI",
      quantity: 10,
      pricePerShare: 10,
      date: dateOffset(-8),
    });

    await investmentService.recordMarketPrice("VTI", 15, asOfDate, "manual");

    const payload = await overviewService.getOverviewDashboard(asOfDate);

    expect(payload.netWorth.currency).toBe("USD");
    expect(payload.netWorth.amount).toBe(1050);
  });

  it("returns six local calendar month buckets in deterministic order", async () => {
    const payload = await overviewService.getOverviewDashboard();

    expect(payload.incomeExpenseTrend6m.months).toHaveLength(6);
    const monthKeys = payload.incomeExpenseTrend6m.months.map((month: { monthKey: string }) => month.monthKey);

    expect([...monthKeys].sort()).toEqual(monthKeys);
    expect(monthKeys[5]).toBe(new Date().toISOString().slice(0, 7));
  });

  it("includes category income/expense and excludes transfer activity and future entries", async () => {
    const accounts = await databaseService.getAccounts(true);
    const cash = accounts.find((account) => account.name === "Cash");
    const bank = accounts.find((account) => account.name === "Bank");
    const salary = accounts.find((account) => account.name === "Salary");
    const groceries = accounts.find((account) => account.name === "Groceries");

    if (!cash || !bank || !salary || !groceries) {
      throw new Error("Expected default accounts to exist");
    }

    await databaseService.createJournalEntry({
      date: monthDateOffset(0, 5),
      amount: 1000,
      description: "Salary this month",
      fromAccountId: salary.id,
      toAccountId: cash.id,
    });

    await databaseService.createJournalEntry({
      date: monthDateOffset(0, 6),
      amount: 250,
      description: "Groceries this month",
      fromAccountId: cash.id,
      toAccountId: groceries.id,
    });

    await databaseService.createJournalEntry({
      date: monthDateOffset(0, 7),
      amount: 999,
      description: "Internal transfer this month",
      fromAccountId: cash.id,
      toAccountId: bank.id,
    });

    await databaseService.createJournalEntry({
      date: monthDateOffset(1, 8),
      amount: 300,
      description: "Future income",
      fromAccountId: salary.id,
      toAccountId: cash.id,
    });

    const payload = await overviewService.getOverviewDashboard();
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentBucket = payload.incomeExpenseTrend6m.months.find(
      (month: { monthKey: string }) => month.monthKey === currentMonth
    );

    expect(currentBucket).toBeDefined();
    expect(currentBucket?.income).toBe(1000);
    expect(currentBucket?.expense).toBe(250);
  });

  it("groups investment allocation by portfolio and includes securities plus cash", async () => {
    const asOfDate = dateOffset(-1);
    const accounts = await databaseService.getAccounts(true);
    const openingBalanceEquity = accounts.find((account) => account.name === "Opening Balances");

    if (!openingBalanceEquity) {
      throw new Error("Expected Opening Balances account to exist");
    }

    const externalCash = await databaseService.createAccount({
      name: "External Cash",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "USD",
    });

    await databaseService.createJournalEntry({
      date: dateOffset(-10),
      amount: 5000,
      description: "Seed external cash",
      fromAccountId: openingBalanceEquity.id,
      toAccountId: externalCash.id,
    });

    const corePortfolio = await investmentService.createInvestmentPortfolio("Core", "USD");
    const incomePortfolio = await investmentService.createInvestmentPortfolio("Income", "USD");

    await investmentService.depositCash(corePortfolio.group.id, 1000, externalCash.id, dateOffset(-9), "Fund core");
    await investmentService.depositCash(incomePortfolio.group.id, 500, externalCash.id, dateOffset(-9), "Fund income");

    await investmentService.recordBuy({
      portfolioId: corePortfolio.group.id,
      tickerSymbol: "VTI",
      quantity: 10,
      pricePerShare: 50,
      date: dateOffset(-8),
    });

    await investmentService.recordMarketPrice("VTI", 55, asOfDate, "manual");

    const payload = await overviewService.getOverviewDashboard(asOfDate);

    expect(payload.investmentAllocation.hasData).toBe(true);
    expect(payload.investmentAllocation.slices).toHaveLength(2);
    expect(payload.investmentAllocation.total).toBe(1550);

    const byName = new Map(
      payload.investmentAllocation.slices.map((slice) => [slice.portfolioName, slice.amount])
    );

    expect(byName.get("Core")).toBe(1050);
    expect(byName.get("Income")).toBe(500);
  });

  it("returns allocation empty hint when no investment data exists", async () => {
    const payload = await overviewService.getOverviewDashboard();

    expect(payload.investmentAllocation.hasData).toBe(false);
    expect(payload.investmentAllocation.total).toBe(0);
    expect(payload.investmentAllocation.slices).toEqual([]);
    expect(payload.investmentAllocation.emptyHintKey).toBe("overview.investmentAllocation.empty");
  });

  it("converts allocation using latest FX rate and marks estimated fallback usage", async () => {
    const accounts = await databaseService.getAccounts(true);
    const openingBalanceEquity = accounts.find((account) => account.name === "Opening Balances");

    if (!openingBalanceEquity) {
      throw new Error("Expected Opening Balances account to exist");
    }

    const eurWallet = await databaseService.createAccount({
      name: "EUR Wallet",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "EUR",
    });

    await seedFxRate("USD", "EUR", dateOffset(-7), 0.8);
    await seedFxRate("USD", "EUR", dateOffset(-3), 0.9);

    const euroPortfolio = await investmentService.createInvestmentPortfolio("Euro", "EUR");
    await investmentService.depositCash(
      euroPortfolio.group.id,
      90,
      eurWallet.id,
      dateOffset(-12),
      "Fund euro portfolio"
    );

    const payloadWithLatest = await overviewService.getOverviewDashboard(dateOffset(-1));

    expect(payloadWithLatest.investmentAllocation.hasData).toBe(true);
    expect(payloadWithLatest.investmentAllocation.total).toBe(100);
    expect(payloadWithLatest.metadata.usedEstimatedFxRate).toBe(false);
    expect(payloadWithLatest.metadata.missingFxPairs).toEqual([]);

    const payloadWithFallback = await overviewService.getOverviewDashboard(dateOffset(-11));

    expect(payloadWithFallback.investmentAllocation.hasData).toBe(true);
    expect(payloadWithFallback.investmentAllocation.total).toBe(100);
    expect(payloadWithFallback.metadata.usedEstimatedFxRate).toBe(true);
    expect(payloadWithFallback.metadata.missingFxPairs).toEqual([]);
  });

  it("tracks missing FX pairs when conversion is unavailable", async () => {
    const jpyWallet = await databaseService.createAccount({
      name: "JPY Wallet",
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "JPY",
    });

    await databaseService.createOpeningBalanceEntry(
      [
        {
          accountId: jpyWallet.id,
          balance: 10000,
        },
      ],
      new Date(dateOffset(-5))
    );

    const jpyPortfolio = await investmentService.createInvestmentPortfolio("Japan", "JPY");
    await investmentService.depositCash(
      jpyPortfolio.group.id,
      10000,
      jpyWallet.id,
      dateOffset(-4),
      "Fund japan portfolio"
    );

    const payload = await overviewService.getOverviewDashboard(dateOffset(-1));

    expect(payload.investmentAllocation.hasData).toBe(true);
    expect(payload.investmentAllocation.total).toBeNull();
    expect(payload.investmentAllocation.slices[0]?.amount).toBeNull();
    expect(payload.metadata.missingFxPairs).toContain("JPY->USD");
  });
});
