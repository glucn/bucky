import { describe, it, expect, beforeEach } from "vitest";
import { investmentService } from "./investmentService";
import { databaseService } from "./database";

describe("InvestmentService - Stock Splits, Fees, and Interest", () => {
  beforeEach(async () => {
    // Reset database before each test
    await databaseService.resetAllData();
  });

  describe("recordStockSplit", () => {
    it("should record a stock split and update quantity", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balances" } }))!.id,
        amount: 10000,
      });

      // Buy shares
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 10,
        pricePerShare: 150,
        date: "2024-01-15",
      });

      // Get the security account
      const securityAccount = await investmentService.getSecurityAccount(group.id, "AAPL");
      const balanceBefore = await databaseService.getAccountBalance(securityAccount.id);

      // Record 2-for-1 stock split
      const journalEntry = await investmentService.recordStockSplit(
        securityAccount.id,
        2.0,
        "2024-02-15"
      );

      // Verify journal entry was created
      expect(journalEntry).toBeDefined();
      expect(journalEntry.type).toBe("stock_split");
      expect(journalEntry.description).toContain("AAPL");
      expect(journalEntry.lines).toHaveLength(0); // No journal lines for stock split

      // Verify quantity was updated
      const updatedAccount = await investmentService.getSecurityAccount(group.id, "AAPL");
      expect(updatedAccount.investmentProperties.quantity).toBe(20); // 10 * 2

      // Verify balance remained unchanged
      const balanceAfter = await databaseService.getAccountBalance(securityAccount.id);
      expect(balanceAfter).toBe(balanceBefore);

      // Verify lots were updated for FIFO
      const lots = JSON.parse(updatedAccount.investmentProperties.lots);
      expect(lots).toHaveLength(1);
      expect(lots[0].quantity).toBe(20); // 10 * 2
      expect(lots[0].pricePerShare).toBe(75); // 150 / 2
    });

    it("should validate required fields", async () => {
      await expect(
        investmentService.recordStockSplit("", 2.0, "2024-01-15")
      ).rejects.toThrow("Account ID is required");

      await expect(
        investmentService.recordStockSplit("some-id", 0, "2024-01-15")
      ).rejects.toThrow("Split ratio must be a positive number");

      await expect(
        investmentService.recordStockSplit("some-id", 2.0, "")
      ).rejects.toThrow("Transaction date is required");
    });
  });

  describe("recordFee", () => {
    it("should record an investment fee", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balances" } }))!.id,
        amount: 10000,
      });

      // Record fee
      const journalEntry = await investmentService.recordFee(
        group.id,
        25.00,
        "Annual account maintenance fee",
        "2024-01-15"
      );

      // Verify journal entry was created
      expect(journalEntry).toBeDefined();
      expect(journalEntry.type).toBe("investment_fee");
      expect(journalEntry.description).toBe("Annual account maintenance fee");
      expect(journalEntry.lines).toHaveLength(2);

      // Verify expense account was debited
      const expenseAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Investment Expenses" },
      });
      const expenseLine = journalEntry.lines.find((l: any) => l.accountId === expenseAccount!.id);
      expect(expenseLine).toBeDefined();
      expect(expenseLine.amount).toBe(25);

      // Verify trade cash was credited
      const cashLine = journalEntry.lines.find((l: any) => l.accountId === tradeCashAccount.id);
      expect(cashLine).toBeDefined();
      expect(cashLine.amount).toBe(-25);
    });

    it("should validate required fields", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await expect(
        investmentService.recordFee(group.id, -10, "Fee", "2024-01-15")
      ).rejects.toThrow("Amount must be a positive number");

      await expect(
        investmentService.recordFee(group.id, 10, "", "2024-01-15")
      ).rejects.toThrow("Description is required");

      await expect(
        investmentService.recordFee(group.id, 10, "Fee", "")
      ).rejects.toThrow("Transaction date is required");
    });
  });

  describe("recordInterest", () => {
    it("should record interest income", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Record interest
      const journalEntry = await investmentService.recordInterest(
        group.id,
        15.50,
        "2024-01-15",
        "Interest from bond holdings"
      );

      // Verify journal entry was created
      expect(journalEntry).toBeDefined();
      expect(journalEntry.type).toBe("interest_income");
      expect(journalEntry.description).toBe("Interest from bond holdings");
      expect(journalEntry.lines).toHaveLength(2);

      // Verify trade cash was debited
      const cashLine = journalEntry.lines.find((l: any) => l.accountId === tradeCashAccount.id);
      expect(cashLine).toBeDefined();
      expect(cashLine.amount).toBe(15.50);

      // Verify interest income account was credited
      const incomeAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Interest Income" },
      });
      const incomeLine = journalEntry.lines.find((l: any) => l.accountId === incomeAccount!.id);
      expect(incomeLine).toBeDefined();
      expect(incomeLine.amount).toBe(-15.50);
    });

    it("should use default description when not provided", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      const journalEntry = await investmentService.recordInterest(
        group.id,
        10.00,
        "2024-01-15"
      );

      expect(journalEntry.description).toBe("Interest income");
    });

    it("should validate required fields", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await expect(
        investmentService.recordInterest(group.id, -10, "2024-01-15")
      ).rejects.toThrow("Amount must be a positive number");

      await expect(
        investmentService.recordInterest(group.id, 10, "")
      ).rejects.toThrow("Transaction date is required");
    });
  });
});
