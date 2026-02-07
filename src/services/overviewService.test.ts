import { beforeEach, describe, expect, it } from "vitest";
import { AccountSubtype, AccountType } from "../shared/accountTypes";
import { databaseService } from "./database";
import { resetTestDatabase } from "./database.test.utils";
import { investmentService } from "./investmentService";
import { overviewService } from "./overviewService";

function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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
});
