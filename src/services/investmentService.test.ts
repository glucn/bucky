import { describe, it, expect, beforeEach } from "vitest";
import { investmentService } from "./investmentService";
import { databaseService } from "./database";

describe("InvestmentService - Portfolio Management", () => {
  beforeEach(async () => {
    // Reset database before each test
    await databaseService.resetAllData();
  });

  describe("createInvestmentPortfolio", () => {
    it("should create an investment portfolio with a trade cash account", async () => {
      const result = await investmentService.createInvestmentPortfolio(
        "Test Portfolio",
        "USD"
      );

      // Verify group was created
      expect(result.group).toBeDefined();
      expect(result.group.name).toBe("Test Portfolio");
      expect(result.group.accountType).toBe("user");

      // Verify trade cash account was created
      expect(result.tradeCashAccount).toBeDefined();
      expect(result.tradeCashAccount.name).toBe("Trade Cash - Test Portfolio");
      expect(result.tradeCashAccount.type).toBe("user");
      expect(result.tradeCashAccount.subtype).toBe("asset");
      expect(result.tradeCashAccount.currency).toBe("USD");

      // Verify the account is linked to the group
      const portfolio = await databaseService.getAccountGroupById(result.group.id);
      expect(portfolio?.accounts).toHaveLength(1);
      expect(portfolio?.accounts[0].id).toBe(result.tradeCashAccount.id);
    });

    it("should create portfolio with custom currency", async () => {
      const result = await investmentService.createInvestmentPortfolio(
        "Euro Portfolio",
        "EUR"
      );

      expect(result.tradeCashAccount.currency).toBe("EUR");
    });

    it("should create portfolio with default USD currency", async () => {
      const result = await investmentService.createInvestmentPortfolio(
        "Default Portfolio"
      );

      expect(result.tradeCashAccount.currency).toBe("USD");
    });
  });

  describe("getInvestmentPortfolios", () => {
    it("should return empty array when no portfolios exist", async () => {
      const portfolios = await investmentService.getInvestmentPortfolios();
      expect(portfolios).toEqual([]);
    });

    it("should return all investment portfolios", async () => {
      // Create multiple portfolios
      await investmentService.createInvestmentPortfolio("Portfolio 1");
      await investmentService.createInvestmentPortfolio("Portfolio 2");
      await investmentService.createInvestmentPortfolio("Portfolio 3");

      const portfolios = await investmentService.getInvestmentPortfolios();
      
      expect(portfolios).toHaveLength(3);
      expect(portfolios[0].name).toBe("Portfolio 1");
      expect(portfolios[1].name).toBe("Portfolio 2");
      expect(portfolios[2].name).toBe("Portfolio 3");
    });

    it("should only return user account type groups", async () => {
      // Create an investment portfolio
      await investmentService.createInvestmentPortfolio("Investment Portfolio");
      
      // Create a category group (should not be returned)
      await databaseService.createAccountGroup({
        name: "Category Group",
        accountType: "category",
      });

      const portfolios = await investmentService.getInvestmentPortfolios();
      
      expect(portfolios).toHaveLength(1);
      expect(portfolios[0].name).toBe("Investment Portfolio");
    });

    it("should filter out non-investment account groups (e.g., banking groups)", async () => {
      // Create an investment portfolio (has Trade Cash account)
      await investmentService.createInvestmentPortfolio("Investment Portfolio");
      
      // Create a regular banking account group (no Trade Cash or securities)
      const bankingGroup = await databaseService.createAccountGroup({
        name: "Banking Accounts",
        accountType: "user",
      });

      // Add a regular checking account to the banking group
      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      await databaseService.addAccountToGroup(checkingAccount.id, bankingGroup.id);

      const portfolios = await investmentService.getInvestmentPortfolios();
      
      // Should only return the investment portfolio, not the banking group
      expect(portfolios).toHaveLength(1);
      expect(portfolios[0].name).toBe("Investment Portfolio");
    });
  });

  describe("getPortfolioAccounts", () => {
    it("should return trade cash and empty securities array for new portfolio", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      const accounts = await investmentService.getPortfolioAccounts(group.id);

      expect(accounts.tradeCash).toBeDefined();
      expect(accounts.tradeCash.name).toBe("Trade Cash - Test Portfolio");
      expect(accounts.securities).toEqual([]);
    });

    it("should throw error for non-existent portfolio", async () => {
      await expect(
        investmentService.getPortfolioAccounts("non-existent-id")
      ).rejects.toThrow("Portfolio not found");
    });

    it("should separate trade cash from security accounts", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Create a security account with investment properties
      const securityAccount = await databaseService.createAccount({
        name: "AAPL Stock",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      // Add investment properties to make it a security account
      await databaseService.prismaClient.investmentProperties.create({
        data: {
          accountId: securityAccount.id,
          tickerSymbol: "AAPL",
          quantity: 10,
          costBasisMethod: "FIFO",
        },
      });

      // Link security account to the portfolio
      await databaseService.addAccountToGroup(securityAccount.id, group.id);

      const accounts = await investmentService.getPortfolioAccounts(group.id);

      expect(accounts.tradeCash).toBeDefined();
      expect(accounts.tradeCash.id).toBe(tradeCashAccount.id);
      expect(accounts.securities).toHaveLength(1);
      expect(accounts.securities[0].id).toBe(securityAccount.id);
      expect(accounts.securities[0].investmentProperties).toBeDefined();
      expect(accounts.securities[0].investmentProperties.tickerSymbol).toBe("AAPL");
    });
  });

  describe("createSecurityAccount", () => {
    it("should create a security account with investment properties", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      const securityAccount = await investmentService.createSecurityAccount(
        group.id,
        "AAPL",
        "stock",
        "FIFO"
      );

      // Verify account was created
      expect(securityAccount).toBeDefined();
      expect(securityAccount.name).toBe("AAPL");
      expect(securityAccount.type).toBe("user");
      expect(securityAccount.subtype).toBe("asset");
      expect(securityAccount.currency).toBe("USD");

      // Verify investment properties were created
      expect(securityAccount.investmentProperties).toBeDefined();
      expect(securityAccount.investmentProperties.tickerSymbol).toBe("AAPL");
      expect(securityAccount.investmentProperties.securityType).toBe("stock");
      expect(securityAccount.investmentProperties.quantity).toBe(0);
      expect(securityAccount.investmentProperties.costBasisMethod).toBe("FIFO");
      expect(securityAccount.investmentProperties.lots).toBe("[]");

      // Verify account is linked to the portfolio
      const portfolio = await databaseService.getAccountGroupById(group.id);
      const accountIds = portfolio?.accounts.map(a => a.id);
      expect(accountIds).toContain(securityAccount.id);
    });

    it("should create security account with default FIFO cost basis method", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      const securityAccount = await investmentService.createSecurityAccount(
        group.id,
        "MSFT"
      );

      expect(securityAccount.investmentProperties.costBasisMethod).toBe("FIFO");
      expect(securityAccount.investmentProperties.lots).toBe("[]");
    });

    it("should create security account with AVERAGE_COST method", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      const securityAccount = await investmentService.createSecurityAccount(
        group.id,
        "VTSAX",
        "mutual_fund",
        "AVERAGE_COST"
      );

      expect(securityAccount.investmentProperties.costBasisMethod).toBe("AVERAGE_COST");
      expect(securityAccount.investmentProperties.lots).toBeNull();
    });

    it("should throw error if portfolio does not exist", async () => {
      await expect(
        investmentService.createSecurityAccount("non-existent-id", "AAPL")
      ).rejects.toThrow("Portfolio not found");
    });

    it("should throw error if security account already exists for ticker", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Create first security account
      await investmentService.createSecurityAccount(group.id, "AAPL");

      // Try to create duplicate
      await expect(
        investmentService.createSecurityAccount(group.id, "AAPL")
      ).rejects.toThrow("Security account for AAPL already exists in this portfolio");
    });

    it("should allow same ticker in different portfolios", async () => {
      const { group: group1 } = await investmentService.createInvestmentPortfolio("Portfolio 1");
      const { group: group2 } = await investmentService.createInvestmentPortfolio("Portfolio 2");

      const account1 = await investmentService.createSecurityAccount(group1.id, "AAPL");
      const account2 = await investmentService.createSecurityAccount(group2.id, "AAPL");

      expect(account1.id).not.toBe(account2.id);
      expect(account1.investmentProperties.tickerSymbol).toBe("AAPL");
      expect(account2.investmentProperties.tickerSymbol).toBe("AAPL");
    });
  });

  describe("getSecurityAccount", () => {
    it("should return null if security account does not exist", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      const account = await investmentService.getSecurityAccount(group.id, "AAPL");

      expect(account).toBeNull();
    });

    it("should return security account by ticker symbol", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Create security account
      const created = await investmentService.createSecurityAccount(group.id, "AAPL", "stock");

      // Retrieve it
      const retrieved = await investmentService.getSecurityAccount(group.id, "AAPL");

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.investmentProperties.tickerSymbol).toBe("AAPL");
      expect(retrieved.investmentProperties.securityType).toBe("stock");
    });

    it("should throw error if portfolio does not exist", async () => {
      await expect(
        investmentService.getSecurityAccount("non-existent-id", "AAPL")
      ).rejects.toThrow("Portfolio not found");
    });

    it("should only return security accounts from the specified portfolio", async () => {
      const { group: group1 } = await investmentService.createInvestmentPortfolio("Portfolio 1");
      const { group: group2 } = await investmentService.createInvestmentPortfolio("Portfolio 2");

      // Create AAPL in portfolio 1
      await investmentService.createSecurityAccount(group1.id, "AAPL");

      // Try to get AAPL from portfolio 2
      const account = await investmentService.getSecurityAccount(group2.id, "AAPL");

      expect(account).toBeNull();
    });

    it("should distinguish between different tickers in same portfolio", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Create multiple security accounts
      await investmentService.createSecurityAccount(group.id, "AAPL");
      await investmentService.createSecurityAccount(group.id, "MSFT");
      await investmentService.createSecurityAccount(group.id, "GOOGL");

      // Retrieve specific ticker
      const msft = await investmentService.getSecurityAccount(group.id, "MSFT");

      expect(msft).toBeDefined();
      expect(msft.investmentProperties.tickerSymbol).toBe("MSFT");
    });
  });
});

describe("InvestmentService - Buy Transactions", () => {
  beforeEach(async () => {
    // Reset database before each test
    await databaseService.resetAllData();
  });

  describe("recordBuy", () => {
    it("should record a buy transaction and create security account if needed", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      // Record buy transaction
      const journalEntry = await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 10,
        pricePerShare: 150.50,
        date: "2024-01-15",
      });

      // Verify journal entry was created
      expect(journalEntry).toBeDefined();
      expect(journalEntry.type).toBe("investment_buy");
      expect(journalEntry.date).toBe("2024-01-15");
      expect(journalEntry.description).toContain("AAPL");
      expect(journalEntry.lines).toHaveLength(2);

      // Verify security account was created
      const securityAccount = await investmentService.getSecurityAccount(group.id, "AAPL");
      expect(securityAccount).toBeDefined();
      expect(securityAccount.investmentProperties.quantity).toBe(10);

      // Verify lots were recorded for FIFO
      const lots = JSON.parse(securityAccount.investmentProperties.lots);
      expect(lots).toHaveLength(1);
      expect(lots[0].quantity).toBe(10);
      expect(lots[0].pricePerShare).toBe(150.50);
      expect(lots[0].date).toBe("2024-01-15");
    });

    it("should calculate total cost correctly with fees", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      // Record buy with fee: (10 × 100) + 9.99 = 1009.99
      const journalEntry = await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "MSFT",
        quantity: 10,
        pricePerShare: 100,
        date: "2024-01-15",
        fee: 9.99,
      });

      // Verify journal entry has 4 lines (security debit, cash credit for purchase, cash credit for fee, expense debit)
      expect(journalEntry.lines).toHaveLength(4);

      // Find the security account line
      const securityAccount = await investmentService.getSecurityAccount(group.id, "MSFT");
      const securityLine = journalEntry.lines.find((l: any) => l.accountId === securityAccount.id);
      expect(securityLine.amount).toBe(1009.99); // Total cost including fee

      // Verify investment properties
      expect(securityAccount.investmentProperties.quantity).toBe(10);
      const lots = JSON.parse(securityAccount.investmentProperties.lots);
      expect(lots[0].amount).toBe(1009.99); // Cost basis includes fee
    });

    it("should add to existing security account position", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      // First buy
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 10,
        pricePerShare: 150,
        date: "2024-01-15",
      });

      // Second buy
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 5,
        pricePerShare: 155,
        date: "2024-02-15",
      });

      // Verify quantity was updated
      const securityAccount = await investmentService.getSecurityAccount(group.id, "AAPL");
      expect(securityAccount.investmentProperties.quantity).toBe(15);

      // Verify both lots were recorded
      const lots = JSON.parse(securityAccount.investmentProperties.lots);
      expect(lots).toHaveLength(2);
      expect(lots[0].quantity).toBe(10);
      expect(lots[0].pricePerShare).toBe(150);
      expect(lots[1].quantity).toBe(5);
      expect(lots[1].pricePerShare).toBe(155);
    });

    it("should validate required fields", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Missing ticker
      await expect(
        investmentService.recordBuy({
          portfolioId: group.id,
          tickerSymbol: "",
          quantity: 10,
          pricePerShare: 150,
          date: "2024-01-15",
        })
      ).rejects.toThrow("Ticker symbol is required");

      // Invalid quantity
      await expect(
        investmentService.recordBuy({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          quantity: -10,
          pricePerShare: 150,
          date: "2024-01-15",
        })
      ).rejects.toThrow("Quantity must be a positive number");

      // Invalid price
      await expect(
        investmentService.recordBuy({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          quantity: 10,
          pricePerShare: 0,
          date: "2024-01-15",
        })
      ).rejects.toThrow("Price per share must be a positive number");

      // Missing date
      await expect(
        investmentService.recordBuy({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          quantity: 10,
          pricePerShare: 150,
          date: "",
        })
      ).rejects.toThrow("Transaction date is required");
    });

    it("should handle fees correctly in journal entry", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      // Record buy with fee
      const journalEntry = await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "GOOGL",
        quantity: 5,
        pricePerShare: 200,
        date: "2024-01-15",
        fee: 10,
      });

      // Verify 4 lines: security debit, cash credit (purchase), cash credit (fee), expense debit
      expect(journalEntry.lines).toHaveLength(4);

      // Find the investment expense line
      const expenseAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Investment Expenses" },
      });
      const expenseLine = journalEntry.lines.find((l: any) => l.accountId === expenseAccount!.id);
      expect(expenseLine).toBeDefined();
      expect(expenseLine.amount).toBe(10); // Fee amount

      // Verify trade cash was debited for both purchase and fee
      const cashLines = journalEntry.lines.filter((l: any) => l.accountId === tradeCashAccount.id);
      expect(cashLines).toHaveLength(2);
      const totalCashDebit = cashLines.reduce((sum: number, line: any) => sum + line.amount, 0);
      expect(totalCashDebit).toBe(-1010); // -(1000 + 10)
    });

    it("should use AVERAGE_COST method when specified", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Create security account with AVERAGE_COST method
      await investmentService.createSecurityAccount(group.id, "VTSAX", "mutual_fund", "AVERAGE_COST");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      // Record buy
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "VTSAX",
        quantity: 100,
        pricePerShare: 50,
        date: "2024-01-15",
      });

      // Verify lots are not tracked for AVERAGE_COST
      const securityAccount = await investmentService.getSecurityAccount(group.id, "VTSAX");
      expect(securityAccount.investmentProperties.lots).toBeNull();
      expect(securityAccount.investmentProperties.quantity).toBe(100);
    });

    it("should throw error if portfolio does not exist", async () => {
      await expect(
        investmentService.recordBuy({
          portfolioId: "non-existent-id",
          tickerSymbol: "AAPL",
          quantity: 10,
          pricePerShare: 150,
          date: "2024-01-15",
        })
      ).rejects.toThrow("Portfolio not found");
    });

    it("should throw error if trade cash account not found", async () => {
      // Create a portfolio but manually remove the trade cash account
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");
      
      // Archive the trade cash account to simulate it being missing
      await databaseService.prismaClient.account.update({
        where: { id: tradeCashAccount.id },
        data: { isArchived: true, groupId: null },
      });

      await expect(
        investmentService.recordBuy({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          quantity: 10,
          pricePerShare: 150,
          date: "2024-01-15",
        })
      ).rejects.toThrow("Trade Cash account not found in portfolio");
    });
  });
});

describe("InvestmentService - Sell Transactions", () => {
  beforeEach(async () => {
    // Reset database before each test
    await databaseService.resetAllData();
  });

  describe("recordSell", () => {
    it("should record a sell transaction with FIFO cost basis", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
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

      // Sell some shares at a higher price
      const journalEntry = await investmentService.recordSell({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 5,
        pricePerShare: 160,
        date: "2024-02-15",
      });

      // Verify journal entry was created
      expect(journalEntry).toBeDefined();
      expect(journalEntry.type).toBe("investment_sell");
      expect(journalEntry.date).toBe("2024-02-15");
      expect(journalEntry.description).toContain("AAPL");

      // Verify security account quantity was updated
      const securityAccount = await investmentService.getSecurityAccount(group.id, "AAPL");
      expect(securityAccount.investmentProperties.quantity).toBe(5);

      // Verify lots were updated for FIFO
      const lots = JSON.parse(securityAccount.investmentProperties.lots);
      expect(lots).toHaveLength(1);
      expect(lots[0].quantity).toBe(5); // 10 - 5 = 5 remaining
    });

    it("should calculate sale proceeds correctly with fees", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      // Buy shares
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "MSFT",
        quantity: 10,
        pricePerShare: 100,
        date: "2024-01-15",
      });

      // Sell with fee: (10 × 110) - 9.99 = 1090.01
      const journalEntry = await investmentService.recordSell({
        portfolioId: group.id,
        tickerSymbol: "MSFT",
        quantity: 10,
        pricePerShare: 110,
        date: "2024-02-15",
        fee: 9.99,
      });

      // Verify journal entry has correct lines
      expect(journalEntry.lines.length).toBeGreaterThanOrEqual(3); // At least security credit, cash debit, gain/loss

      // Find the trade cash line for proceeds
      const cashLines = journalEntry.lines.filter((l: any) => l.accountId === tradeCashAccount.id);
      const proceedsLine = cashLines.find((l: any) => l.amount > 0);
      expect(proceedsLine.amount).toBe(1090.01); // Sale proceeds after fee
    });

    it("should record realized gain when selling at profit", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      // Buy at $100
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "GOOGL",
        quantity: 10,
        pricePerShare: 100,
        date: "2024-01-15",
      });

      // Sell at $120 (gain of $200)
      const journalEntry = await investmentService.recordSell({
        portfolioId: group.id,
        tickerSymbol: "GOOGL",
        quantity: 10,
        pricePerShare: 120,
        date: "2024-02-15",
      });

      // Find the realized gain/loss line
      const gainLossAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Realized Gains/Losses" },
      });
      const gainLossLine = journalEntry.lines.find((l: any) => l.accountId === gainLossAccount!.id);
      
      expect(gainLossLine).toBeDefined();
      expect(gainLossLine.amount).toBe(-200); // Negative for credit (gain)
      expect(gainLossLine.description).toContain("Gain");
    });

    it("should record realized loss when selling at loss", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      // Buy at $100
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "TSLA",
        quantity: 10,
        pricePerShare: 100,
        date: "2024-01-15",
      });

      // Sell at $80 (loss of $200)
      const journalEntry = await investmentService.recordSell({
        portfolioId: group.id,
        tickerSymbol: "TSLA",
        quantity: 10,
        pricePerShare: 80,
        date: "2024-02-15",
      });

      // Find the realized gain/loss line
      const gainLossAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Realized Gains/Losses" },
      });
      const gainLossLine = journalEntry.lines.find((l: any) => l.accountId === gainLossAccount!.id);
      
      expect(gainLossLine).toBeDefined();
      expect(gainLossLine.amount).toBe(200); // Positive for debit (loss)
      expect(gainLossLine.description).toContain("Loss");
    });

    it("should use FIFO method to select oldest lots first", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 20000,
      });

      // Buy first lot at $100
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 10,
        pricePerShare: 100,
        date: "2024-01-15",
      });

      // Buy second lot at $120
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 10,
        pricePerShare: 120,
        date: "2024-02-15",
      });

      // Sell 15 shares - should use all of first lot (10 @ $100) and 5 from second lot (5 @ $120)
      const journalEntry = await investmentService.recordSell({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 15,
        pricePerShare: 150,
        date: "2024-03-15",
      });

      // Cost basis should be: (10 × 100) + (5 × 120) = 1000 + 600 = 1600
      // Sale proceeds: 15 × 150 = 2250
      // Gain: 2250 - 1600 = 650

      const gainLossAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Realized Gains/Losses" },
      });
      const gainLossLine = journalEntry.lines.find((l: any) => l.accountId === gainLossAccount!.id);
      
      expect(gainLossLine).toBeDefined();
      expect(gainLossLine.amount).toBe(-650); // Negative for credit (gain)

      // Verify remaining lot
      const securityAccount = await investmentService.getSecurityAccount(group.id, "AAPL");
      const lots = JSON.parse(securityAccount.investmentProperties.lots);
      expect(lots).toHaveLength(1);
      expect(lots[0].quantity).toBe(5); // 5 shares remaining from second lot
      expect(lots[0].pricePerShare).toBe(120);
    });

    it("should use average cost method when specified", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Create security account with AVERAGE_COST method
      await investmentService.createSecurityAccount(group.id, "VTSAX", "mutual_fund", "AVERAGE_COST");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 20000,
      });

      // Buy first lot at $50
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "VTSAX",
        quantity: 100,
        pricePerShare: 50,
        date: "2024-01-15",
      });

      // Buy second lot at $60
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "VTSAX",
        quantity: 100,
        pricePerShare: 60,
        date: "2024-02-15",
      });

      // Total cost: (100 × 50) + (100 × 60) = 5000 + 6000 = 11000
      // Total shares: 200
      // Average cost per share: 11000 / 200 = 55

      // Sell 100 shares at $70
      const journalEntry = await investmentService.recordSell({
        portfolioId: group.id,
        tickerSymbol: "VTSAX",
        quantity: 100,
        pricePerShare: 70,
        date: "2024-03-15",
      });

      // Cost basis should be: 100 × 55 = 5500
      // Sale proceeds: 100 × 70 = 7000
      // Gain: 7000 - 5500 = 1500

      const gainLossAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Realized Gains/Losses" },
      });
      const gainLossLine = journalEntry.lines.find((l: any) => l.accountId === gainLossAccount!.id);
      
      expect(gainLossLine).toBeDefined();
      expect(gainLossLine.amount).toBe(-1500); // Negative for credit (gain)

      // Verify quantity was updated
      const securityAccount = await investmentService.getSecurityAccount(group.id, "VTSAX");
      expect(securityAccount.investmentProperties.quantity).toBe(100);
    });

    it("should validate required fields", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Missing ticker
      await expect(
        investmentService.recordSell({
          portfolioId: group.id,
          tickerSymbol: "",
          quantity: 10,
          pricePerShare: 150,
          date: "2024-01-15",
        })
      ).rejects.toThrow("Ticker symbol is required");

      // Invalid quantity
      await expect(
        investmentService.recordSell({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          quantity: -10,
          pricePerShare: 150,
          date: "2024-01-15",
        })
      ).rejects.toThrow("Quantity must be a positive number");

      // Invalid price
      await expect(
        investmentService.recordSell({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          quantity: 10,
          pricePerShare: 0,
          date: "2024-01-15",
        })
      ).rejects.toThrow("Price per share must be a positive number");

      // Missing date
      await expect(
        investmentService.recordSell({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          quantity: 10,
          pricePerShare: 150,
          date: "",
        })
      ).rejects.toThrow("Transaction date is required");
    });

    it("should throw error if security account does not exist", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await expect(
        investmentService.recordSell({
          portfolioId: group.id,
          tickerSymbol: "NONEXISTENT",
          quantity: 10,
          pricePerShare: 150,
          date: "2024-01-15",
        })
      ).rejects.toThrow("Security account for NONEXISTENT not found in portfolio");
    });

    it("should throw error if trying to sell more shares than owned", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      // Buy 10 shares
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 10,
        pricePerShare: 100,
        date: "2024-01-15",
      });

      // Try to sell 15 shares
      await expect(
        investmentService.recordSell({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          quantity: 15,
          pricePerShare: 110,
          date: "2024-02-15",
        })
      ).rejects.toThrow("Insufficient shares");
    });

    it("should handle selling entire position", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      // Buy shares
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 10,
        pricePerShare: 100,
        date: "2024-01-15",
      });

      // Sell all shares
      await investmentService.recordSell({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 10,
        pricePerShare: 110,
        date: "2024-02-15",
      });

      // Verify quantity is zero
      const securityAccount = await investmentService.getSecurityAccount(group.id, "AAPL");
      expect(securityAccount.investmentProperties.quantity).toBe(0);

      // Verify lots are empty for FIFO
      const lots = JSON.parse(securityAccount.investmentProperties.lots);
      expect(lots).toHaveLength(0);
    });

    it("should handle fees correctly in journal entry", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      // Buy shares
      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "GOOGL",
        quantity: 5,
        pricePerShare: 200,
        date: "2024-01-15",
      });

      // Sell with fee
      const journalEntry = await investmentService.recordSell({
        portfolioId: group.id,
        tickerSymbol: "GOOGL",
        quantity: 5,
        pricePerShare: 220,
        date: "2024-02-15",
        fee: 10,
      });

      // Find the investment expense line
      const expenseAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Investment Expenses" },
      });
      const expenseLine = journalEntry.lines.find((l: any) => l.accountId === expenseAccount!.id);
      expect(expenseLine).toBeDefined();
      expect(expenseLine.amount).toBe(10); // Fee amount

      // Verify trade cash received proceeds minus fee
      const cashLines = journalEntry.lines.filter((l: any) => l.accountId === tradeCashAccount.id);
      const proceedsLine = cashLines.find((l: any) => l.amount > 0);
      expect(proceedsLine.amount).toBe(1090); // (5 × 220) - 10 = 1090
    });
  });
});

describe("InvestmentService - Dividend Transactions", () => {
  beforeEach(async () => {
    // Reset database before each test
    await databaseService.resetAllData();
  });

  describe("recordDividend", () => {
    it("should record a cash dividend as income", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Create a security account
      await investmentService.createSecurityAccount(group.id, "AAPL", "stock");

      // Record dividend as income
      const journalEntry = await investmentService.recordDividend({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        amount: 100,
        date: "2024-01-15",
        isReturnOfCapital: false,
      });

      // Verify journal entry was created
      expect(journalEntry).toBeDefined();
      expect(journalEntry.type).toBe("dividend_cash");
      expect(journalEntry.date).toBe("2024-01-15");
      expect(journalEntry.description).toContain("AAPL");
      expect(journalEntry.lines).toHaveLength(2);

      // Verify trade cash was debited
      const cashLine = journalEntry.lines.find((l: any) => l.accountId === tradeCashAccount.id);
      expect(cashLine).toBeDefined();
      expect(cashLine.amount).toBe(100); // Positive for debit

      // Verify dividend income was credited
      const dividendIncomeAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Dividend Income" },
      });
      const incomeLine = journalEntry.lines.find((l: any) => l.accountId === dividendIncomeAccount!.id);
      expect(incomeLine).toBeDefined();
      expect(incomeLine.amount).toBe(-100); // Negative for credit
    });

    it("should record a cash dividend as return of capital", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash and buy shares first
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 10,
        pricePerShare: 150,
        date: "2024-01-10",
      });

      // Get initial security account balance
      const securityAccount = await investmentService.getSecurityAccount(group.id, "AAPL");
      const initialBalance = await databaseService.getAccountBalance(securityAccount.id);

      // Record dividend as return of capital
      const journalEntry = await investmentService.recordDividend({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        amount: 50,
        date: "2024-01-15",
        isReturnOfCapital: true,
      });

      // Verify journal entry was created
      expect(journalEntry).toBeDefined();
      expect(journalEntry.type).toBe("dividend_cash");
      expect(journalEntry.description).toContain("AAPL");
      expect(journalEntry.description).toContain("Return of Capital");
      expect(journalEntry.lines).toHaveLength(2);

      // Verify trade cash was debited
      const cashLine = journalEntry.lines.find((l: any) => l.accountId === tradeCashAccount.id);
      expect(cashLine).toBeDefined();
      expect(cashLine.amount).toBe(50); // Positive for debit

      // Verify security account was credited (cost basis reduced)
      const securityLine = journalEntry.lines.find((l: any) => l.accountId === securityAccount.id);
      expect(securityLine).toBeDefined();
      expect(securityLine.amount).toBe(-50); // Negative for credit

      // Verify cost basis was reduced
      const newBalance = await databaseService.getAccountBalance(securityAccount.id);
      expect(newBalance).toBe(initialBalance - 50);
    });

    it("should validate required fields", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Missing ticker
      await expect(
        investmentService.recordDividend({
          portfolioId: group.id,
          tickerSymbol: "",
          amount: 100,
          date: "2024-01-15",
        })
      ).rejects.toThrow("Ticker symbol is required");

      // Invalid amount
      await expect(
        investmentService.recordDividend({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          amount: -100,
          date: "2024-01-15",
        })
      ).rejects.toThrow("Dividend amount must be a positive number");

      // Missing date
      await expect(
        investmentService.recordDividend({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          amount: 100,
          date: "",
        })
      ).rejects.toThrow("Transaction date is required");
    });

    it("should throw error if security account not found for return of capital", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await expect(
        investmentService.recordDividend({
          portfolioId: group.id,
          tickerSymbol: "NONEXISTENT",
          amount: 100,
          date: "2024-01-15",
          isReturnOfCapital: true,
        })
      ).rejects.toThrow("Security account for NONEXISTENT not found in portfolio");
    });

    it("should store ticker symbol in journal entry description", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await investmentService.createSecurityAccount(group.id, "MSFT", "stock");

      const journalEntry = await investmentService.recordDividend({
        portfolioId: group.id,
        tickerSymbol: "MSFT",
        amount: 75.50,
        date: "2024-01-15",
      });

      expect(journalEntry.description).toContain("MSFT");
    });

    it("should handle custom description", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await investmentService.createSecurityAccount(group.id, "AAPL", "stock");

      const journalEntry = await investmentService.recordDividend({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        amount: 100,
        date: "2024-01-15",
        description: "Special dividend payment",
      });

      expect(journalEntry.description).toBe("Special dividend payment");
    });
  });

  describe("recordReinvestedDividend", () => {
    it("should record reinvested dividend as income with two journal entries", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Create a security account
      await investmentService.createSecurityAccount(group.id, "AAPL", "stock");

      // Record reinvested dividend as income
      const journalEntry = await investmentService.recordReinvestedDividend({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        dividendAmount: 100,
        reinvestmentPrice: 150,
        date: "2024-01-15",
        recordAsIncome: true,
      });

      // Verify the purchase journal entry was created
      expect(journalEntry).toBeDefined();
      expect(journalEntry.type).toBe("dividend_reinvest");
      expect(journalEntry.description).toContain("Purchase");

      // Verify shares were calculated correctly: 100 / 150 = 0.666667
      const securityAccount = await investmentService.getSecurityAccount(group.id, "AAPL");
      expect(securityAccount.investmentProperties.quantity).toBeCloseTo(0.666667, 5);

      // Verify lots were updated
      const lots = JSON.parse(securityAccount.investmentProperties.lots);
      expect(lots).toHaveLength(1);
      expect(lots[0].quantity).toBeCloseTo(0.666667, 5);
      expect(lots[0].pricePerShare).toBe(150);
    });

    it("should record reinvested dividend as cost basis reduction", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash and buy shares first
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 10,
        pricePerShare: 150,
        date: "2024-01-10",
      });

      // Get initial security account balance
      const securityAccount = await investmentService.getSecurityAccount(group.id, "AAPL");
      const initialBalance = await databaseService.getAccountBalance(securityAccount.id);

      // Record reinvested dividend as cost basis reduction
      const journalEntry = await investmentService.recordReinvestedDividend({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        dividendAmount: 100,
        reinvestmentPrice: 150,
        date: "2024-01-15",
        recordAsIncome: false,
      });

      // Verify journal entry was created
      expect(journalEntry).toBeDefined();
      expect(journalEntry.type).toBe("dividend_reinvest");
      expect(journalEntry.description).toContain("Cost Basis Reduction");

      // Verify shares were added: 100 / 150 = 0.666667
      const updatedAccount = await investmentService.getSecurityAccount(group.id, "AAPL");
      expect(updatedAccount.investmentProperties.quantity).toBeCloseTo(10.666667, 5);

      // Verify cost basis increased
      const newBalance = await databaseService.getAccountBalance(securityAccount.id);
      expect(newBalance).toBe(initialBalance + 100);
    });

    it("should calculate shares purchased correctly", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await investmentService.createSecurityAccount(group.id, "MSFT", "stock");

      // Dividend: $250, Price: $125 -> 2 shares
      await investmentService.recordReinvestedDividend({
        portfolioId: group.id,
        tickerSymbol: "MSFT",
        dividendAmount: 250,
        reinvestmentPrice: 125,
        date: "2024-01-15",
        recordAsIncome: true,
      });

      const securityAccount = await investmentService.getSecurityAccount(group.id, "MSFT");
      expect(securityAccount.investmentProperties.quantity).toBe(2);
    });

    it("should validate required fields", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Missing ticker
      await expect(
        investmentService.recordReinvestedDividend({
          portfolioId: group.id,
          tickerSymbol: "",
          dividendAmount: 100,
          reinvestmentPrice: 150,
          date: "2024-01-15",
          recordAsIncome: true,
        })
      ).rejects.toThrow("Ticker symbol is required");

      // Invalid dividend amount
      await expect(
        investmentService.recordReinvestedDividend({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          dividendAmount: -100,
          reinvestmentPrice: 150,
          date: "2024-01-15",
          recordAsIncome: true,
        })
      ).rejects.toThrow("Dividend amount must be a positive number");

      // Invalid reinvestment price
      await expect(
        investmentService.recordReinvestedDividend({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          dividendAmount: 100,
          reinvestmentPrice: 0,
          date: "2024-01-15",
          recordAsIncome: true,
        })
      ).rejects.toThrow("Reinvestment price must be a positive number");

      // Missing date
      await expect(
        investmentService.recordReinvestedDividend({
          portfolioId: group.id,
          tickerSymbol: "AAPL",
          dividendAmount: 100,
          reinvestmentPrice: 150,
          date: "",
          recordAsIncome: true,
        })
      ).rejects.toThrow("Transaction date is required");
    });

    it("should create security account if it doesn't exist", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Record reinvested dividend for a ticker that doesn't have an account yet
      await investmentService.recordReinvestedDividend({
        portfolioId: group.id,
        tickerSymbol: "GOOGL",
        dividendAmount: 200,
        reinvestmentPrice: 100,
        date: "2024-01-15",
        recordAsIncome: true,
      });

      // Verify security account was created
      const securityAccount = await investmentService.getSecurityAccount(group.id, "GOOGL");
      expect(securityAccount).toBeDefined();
      expect(securityAccount.investmentProperties.quantity).toBe(2);
    });

    it("should add to existing position when reinvesting", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash and buy shares first
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: tradeCashAccount.id,
        toAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        amount: 10000,
      });

      await investmentService.recordBuy({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        quantity: 10,
        pricePerShare: 150,
        date: "2024-01-10",
      });

      // Reinvest dividend
      await investmentService.recordReinvestedDividend({
        portfolioId: group.id,
        tickerSymbol: "AAPL",
        dividendAmount: 150,
        reinvestmentPrice: 150,
        date: "2024-01-15",
        recordAsIncome: true,
      });

      // Verify quantity increased
      const securityAccount = await investmentService.getSecurityAccount(group.id, "AAPL");
      expect(securityAccount.investmentProperties.quantity).toBe(11); // 10 + 1

      // Verify lots were updated
      const lots = JSON.parse(securityAccount.investmentProperties.lots);
      expect(lots).toHaveLength(2);
      expect(lots[0].quantity).toBe(10);
      expect(lots[1].quantity).toBe(1);
    });

    it("should handle fractional shares correctly", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await investmentService.createSecurityAccount(group.id, "VTSAX", "mutual_fund");

      // Dividend: $100, Price: $75.33 -> 1.327876 shares (but we round to 6 decimals)
      await investmentService.recordReinvestedDividend({
        portfolioId: group.id,
        tickerSymbol: "VTSAX",
        dividendAmount: 100,
        reinvestmentPrice: 75.33,
        date: "2024-01-15",
        recordAsIncome: true,
      });

      const securityAccount = await investmentService.getSecurityAccount(group.id, "VTSAX");
      // The actual calculation: 100 / 75.33 = 1.327876... but we round to 6 decimals
      const expectedShares = Math.round((100 / 75.33) * 1000000) / 1000000;
      expect(securityAccount.investmentProperties.quantity).toBeCloseTo(expectedShares, 6);
    });

    it("should work with AVERAGE_COST method", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await investmentService.createSecurityAccount(group.id, "VTSAX", "mutual_fund", "AVERAGE_COST");

      await investmentService.recordReinvestedDividend({
        portfolioId: group.id,
        tickerSymbol: "VTSAX",
        dividendAmount: 100,
        reinvestmentPrice: 50,
        date: "2024-01-15",
        recordAsIncome: true,
      });

      const securityAccount = await investmentService.getSecurityAccount(group.id, "VTSAX");
      expect(securityAccount.investmentProperties.quantity).toBe(2);
      expect(securityAccount.investmentProperties.lots).toBeNull(); // No lots for AVERAGE_COST
    });
  });
});

describe("InvestmentService - Cash Management", () => {
  beforeEach(async () => {
    // Reset database before each test
    await databaseService.resetAllData();
  });

  describe("depositCash", () => {
    it("should deposit cash into trading account from external account", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Create a source account (e.g., checking account)
      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      // Add money to checking account (debit checking, credit opening balance equity)
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial balance",
        fromAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        toAccountId: checkingAccount.id,
        amount: 10000,
      });

      // Deposit cash into portfolio
      const journalEntry = await investmentService.depositCash(
        group.id,
        5000,
        checkingAccount.id,
        "2024-01-15",
        "Transfer to investment account"
      );

      // Verify journal entry was created
      expect(journalEntry).toBeDefined();
      expect(journalEntry.type).toBe("investment_cash_deposit");
      expect(journalEntry.date).toBe("2024-01-15");
      expect(journalEntry.description).toBe("Transfer to investment account");
      expect(journalEntry.lines).toHaveLength(2);

      // Verify trade cash balance increased
      const tradeCashBalance = await databaseService.getAccountBalance(tradeCashAccount.id);
      expect(tradeCashBalance).toBe(5000);

      // Verify checking account balance decreased
      const checkingBalance = await databaseService.getAccountBalance(checkingAccount.id);
      expect(checkingBalance).toBe(5000); // 10000 - 5000
    });

    it("should use default description when not provided", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial balance",
        fromAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        toAccountId: checkingAccount.id,
        amount: 10000,
      });

      const journalEntry = await investmentService.depositCash(
        group.id,
        1000,
        checkingAccount.id,
        "2024-01-15"
      );

      expect(journalEntry.description).toBe("Cash deposit to investment portfolio");
    });

    it("should validate required fields", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      // Missing portfolio ID
      await expect(
        investmentService.depositCash("", 1000, checkingAccount.id, "2024-01-15")
      ).rejects.toThrow("Portfolio ID is required");

      // Invalid amount
      await expect(
        investmentService.depositCash(group.id, -1000, checkingAccount.id, "2024-01-15")
      ).rejects.toThrow("Amount must be a positive number");

      await expect(
        investmentService.depositCash(group.id, 0, checkingAccount.id, "2024-01-15")
      ).rejects.toThrow("Amount must be a positive number");

      // Missing source account
      await expect(
        investmentService.depositCash(group.id, 1000, "", "2024-01-15")
      ).rejects.toThrow("Source account ID is required");

      // Missing date
      await expect(
        investmentService.depositCash(group.id, 1000, checkingAccount.id, "")
      ).rejects.toThrow("Transaction date is required");
    });

    it("should throw error if portfolio does not exist", async () => {
      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      await expect(
        investmentService.depositCash("non-existent-id", 1000, checkingAccount.id, "2024-01-15")
      ).rejects.toThrow("Portfolio not found");
    });

    it("should throw error if source account does not exist", async () => {
      const { group } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await expect(
        investmentService.depositCash(group.id, 1000, "non-existent-id", "2024-01-15")
      ).rejects.toThrow("Source account not found");
    });

    it("should throw error if trade cash account not found", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      // Remove trade cash account from portfolio
      await databaseService.prismaClient.account.update({
        where: { id: tradeCashAccount.id },
        data: { groupId: null },
      });

      await expect(
        investmentService.depositCash(group.id, 1000, checkingAccount.id, "2024-01-15")
      ).rejects.toThrow("Trade cash account not found in portfolio");
    });

    it("should handle multiple deposits correctly", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial balance",
        fromAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        toAccountId: checkingAccount.id,
        amount: 20000,
      });

      // First deposit
      await investmentService.depositCash(group.id, 5000, checkingAccount.id, "2024-01-15");

      // Second deposit
      await investmentService.depositCash(group.id, 3000, checkingAccount.id, "2024-02-15");

      // Verify trade cash balance
      const tradeCashBalance = await databaseService.getAccountBalance(tradeCashAccount.id);
      expect(tradeCashBalance).toBe(8000);

      // Verify checking account balance
      const checkingBalance = await databaseService.getAccountBalance(checkingAccount.id);
      expect(checkingBalance).toBe(12000); // 20000 - 5000 - 3000
    });
  });

  describe("withdrawCash", () => {
    it("should withdraw cash from trading account to external account", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add cash to trading account (debit trade cash, credit opening balance equity)
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        toAccountId: tradeCashAccount.id,
        amount: 10000,
      });

      // Create a destination account (e.g., checking account)
      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      // Withdraw cash from portfolio
      const journalEntry = await investmentService.withdrawCash(
        group.id,
        3000,
        checkingAccount.id,
        "2024-01-15",
        "Withdrawal from investment account"
      );

      // Verify journal entry was created
      expect(journalEntry).toBeDefined();
      expect(journalEntry.type).toBe("investment_cash_withdrawal");
      expect(journalEntry.date).toBe("2024-01-15");
      expect(journalEntry.description).toBe("Withdrawal from investment account");
      expect(journalEntry.lines).toHaveLength(2);

      // Verify trade cash balance decreased
      const tradeCashBalance = await databaseService.getAccountBalance(tradeCashAccount.id);
      expect(tradeCashBalance).toBe(7000); // 10000 - 3000

      // Verify checking account balance increased
      const checkingBalance = await databaseService.getAccountBalance(checkingAccount.id);
      expect(checkingBalance).toBe(3000);
    });

    it("should use default description when not provided", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        toAccountId: tradeCashAccount.id,
        amount: 10000,
      });

      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      const journalEntry = await investmentService.withdrawCash(
        group.id,
        1000,
        checkingAccount.id,
        "2024-01-15"
      );

      expect(journalEntry.description).toBe("Cash withdrawal from investment portfolio");
    });

    it("should validate sufficient trade cash balance", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      // Add only $5000 to trading account
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        toAccountId: tradeCashAccount.id,
        amount: 5000,
      });

      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      // Try to withdraw more than available
      await expect(
        investmentService.withdrawCash(group.id, 6000, checkingAccount.id, "2024-01-15")
      ).rejects.toThrow("Insufficient trade cash balance: trying to withdraw 6000 but only 5000 available");
    });

    it("should validate required fields", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        toAccountId: tradeCashAccount.id,
        amount: 10000,
      });

      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      // Missing portfolio ID
      await expect(
        investmentService.withdrawCash("", 1000, checkingAccount.id, "2024-01-15")
      ).rejects.toThrow("Portfolio ID is required");

      // Invalid amount
      await expect(
        investmentService.withdrawCash(group.id, -1000, checkingAccount.id, "2024-01-15")
      ).rejects.toThrow("Amount must be a positive number");

      await expect(
        investmentService.withdrawCash(group.id, 0, checkingAccount.id, "2024-01-15")
      ).rejects.toThrow("Amount must be a positive number");

      // Missing destination account
      await expect(
        investmentService.withdrawCash(group.id, 1000, "", "2024-01-15")
      ).rejects.toThrow("Destination account ID is required");

      // Missing date
      await expect(
        investmentService.withdrawCash(group.id, 1000, checkingAccount.id, "")
      ).rejects.toThrow("Transaction date is required");
    });

    it("should throw error if portfolio does not exist", async () => {
      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      await expect(
        investmentService.withdrawCash("non-existent-id", 1000, checkingAccount.id, "2024-01-15")
      ).rejects.toThrow("Portfolio not found");
    });

    it("should throw error if destination account does not exist", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        toAccountId: tradeCashAccount.id,
        amount: 10000,
      });

      await expect(
        investmentService.withdrawCash(group.id, 1000, "non-existent-id", "2024-01-15")
      ).rejects.toThrow("Destination account not found");
    });

    it("should throw error if trade cash account not found", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      // Remove trade cash account from portfolio
      await databaseService.prismaClient.account.update({
        where: { id: tradeCashAccount.id },
        data: { groupId: null },
      });

      await expect(
        investmentService.withdrawCash(group.id, 1000, checkingAccount.id, "2024-01-15")
      ).rejects.toThrow("Trade cash account not found in portfolio");
    });

    it("should handle multiple withdrawals correctly", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        toAccountId: tradeCashAccount.id,
        amount: 20000,
      });

      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      // First withdrawal
      await investmentService.withdrawCash(group.id, 5000, checkingAccount.id, "2024-01-15");

      // Second withdrawal
      await investmentService.withdrawCash(group.id, 3000, checkingAccount.id, "2024-02-15");

      // Verify trade cash balance
      const tradeCashBalance = await databaseService.getAccountBalance(tradeCashAccount.id);
      expect(tradeCashBalance).toBe(12000); // 20000 - 5000 - 3000

      // Verify checking account balance
      const checkingBalance = await databaseService.getAccountBalance(checkingAccount.id);
      expect(checkingBalance).toBe(8000);
    });

    it("should prevent withdrawal when balance becomes insufficient after previous transactions", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial deposit",
        fromAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        toAccountId: tradeCashAccount.id,
        amount: 10000,
      });

      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      // First withdrawal
      await investmentService.withdrawCash(group.id, 7000, checkingAccount.id, "2024-01-15");

      // Try to withdraw more than remaining balance
      await expect(
        investmentService.withdrawCash(group.id, 4000, checkingAccount.id, "2024-01-16")
      ).rejects.toThrow("Insufficient trade cash balance: trying to withdraw 4000 but only 3000 available");
    });

    it("should work correctly with deposits and withdrawals combined", async () => {
      const { group, tradeCashAccount } = await investmentService.createInvestmentPortfolio("Test Portfolio");

      const checkingAccount = await databaseService.createAccount({
        name: "Checking Account",
        type: "user",
        subtype: "asset",
        currency: "USD",
      });

      // Add initial balance to checking
      await databaseService.createJournalEntry({
        date: "2024-01-01",
        description: "Initial balance",
        fromAccountId: (await databaseService.prismaClient.account.findFirst({ where: { name: "Opening Balance Equity" } }))!.id,
        toAccountId: checkingAccount.id,
        amount: 20000,
      });

      // Deposit to portfolio
      await investmentService.depositCash(group.id, 10000, checkingAccount.id, "2024-01-15");

      // Withdraw from portfolio
      await investmentService.withdrawCash(group.id, 3000, checkingAccount.id, "2024-02-15");

      // Deposit again
      await investmentService.depositCash(group.id, 5000, checkingAccount.id, "2024-03-15");

      // Verify final balances
      const tradeCashBalance = await databaseService.getAccountBalance(tradeCashAccount.id);
      expect(tradeCashBalance).toBe(12000); // 10000 - 3000 + 5000

      const checkingBalance = await databaseService.getAccountBalance(checkingAccount.id);
      expect(checkingBalance).toBe(8000); // 20000 - 10000 + 3000 - 5000
    });
  });
});
