import { databaseService } from "./database";
import { importInvestments } from "./investmentImport";
import { parseInvestmentImport, type InvestmentImportMapping, type InvestmentImportOptions } from "../shared/investmentImport";
import { getInvestmentSnapshot } from "./investmentActivity";
import { parseToStandardDate } from "../shared/dateUtils";
import { recordInvestmentTrade, type InvestmentTrade } from "./investmentTrades";
import { recordCashDividend, recordReinvestment, recordSplit, type DividendInput, type ReinvestmentInput } from "./investmentDistributions";
import { AccountType, AccountSubtype } from "../shared/accountTypes";
import { appSettingsService } from "./appSettingsService";
import { valuationConversionService } from "./valuationConversionService";
import { securityMarketData } from "./securityMarketData";

export class InvestmentHistoryUnavailableError extends Error {}

/**
 * Investment transaction types enum
 */
export enum InvestmentTransactionType {
  BUY = 'investment_buy',
  SELL = 'investment_sell',
  DIVIDEND_CASH = 'dividend_cash',
  DIVIDEND_REINVEST = 'dividend_reinvest',
  INTEREST = 'interest_income',
  FEE = 'investment_fee',
  STOCK_SPLIT = 'stock_split',
  CASH_DEPOSIT = 'investment_cash_deposit',
  CASH_WITHDRAWAL = 'investment_cash_withdrawal'
}

/**
 * InvestmentService - Service for managing investment portfolios and transactions
 * 
 * This service provides functionality for:
 * - Creating and managing investment portfolios (AccountGroups)
 * - Managing security accounts and trade cash accounts
 * - Recording investment transactions (buy, sell, dividends, etc.)
 * - Tracking cost basis and calculating gains/losses
 * - Managing price history for securities
 */
class InvestmentService {
  private static instance: InvestmentService;

  private constructor() {}

  public static getInstance(): InvestmentService {
    if (!InvestmentService.instance) {
      InvestmentService.instance = new InvestmentService();
    }
    return InvestmentService.instance;
  }

  /**
   * Create a new investment portfolio.
   * Creates an AccountGroup with accountType "user" and a trade cash Account linked to it.
   * 
   * @param name - Name of the portfolio (e.g., "Fidelity 401(k)", "Vanguard Brokerage")
   * @param currency - Currency for the trade cash account (default: "USD")
   * @returns Object containing the created group and trade cash account
   * 
   * Requirements: 1.1, 1.2, 1.3
   */
  public async createInvestmentPortfolio(
    name: string,
    currency: string = "USD"
  ): Promise<{
    group: any;
    tradeCashAccount: any;
  }> {
    // Create the AccountGroup with accountType "user"
    const group = await databaseService.createAccountGroup({
      name,
      accountType: AccountType.User,
    });

    // Create the trade cash Account linked to the group
    const tradeCashAccount = await databaseService.createAccount({
      name: `Trade Cash - ${name} (${currency})`,
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency,
    });

    // Link the trade cash account to the group
    await databaseService.addAccountToGroup(tradeCashAccount.id, group.id);

    return {
      group,
      tradeCashAccount,
    };
  }

  /**
   * Add an additional trade cash account to an existing investment portfolio.
   * Creates a new trade cash Account in the specified currency and links it to the portfolio.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @param currency - Currency for the new trade cash account
   * @returns The created trade cash account
   * 
   * Requirements: Multi-currency support
   */
  public async addTradeCashAccount(
    portfolioId: string,
    currency: string
  ): Promise<any> {
    // Validate that the portfolio exists
    const portfolio = await databaseService.getAccountGroupById(portfolioId);
    if (!portfolio) {
      throw new Error("Portfolio not found");
    }

    // Check if a trade cash account for this currency already exists in the portfolio
    const existingTradeCash = await this.getTradeCashAccount(portfolioId, currency);
    if (existingTradeCash) {
      throw new Error(`Trade cash account for ${currency} already exists in this portfolio`);
    }

    // Create the trade cash Account
    const tradeCashAccount = await databaseService.createAccount({
      name: `Trade Cash - ${portfolio.name} (${currency})`,
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency,
    });

    // Link the trade cash account to the group
    await databaseService.addAccountToGroup(tradeCashAccount.id, portfolioId);

    return tradeCashAccount;
  }

  /**
   * Get a specific trade cash account by portfolio and currency.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @param currency - Currency code to search for
   * @returns The trade cash account, or null if not found
   */
  public async getTradeCashAccount(
    portfolioId: string,
    currency: string
  ): Promise<any | null> {
    // Get the portfolio group with its accounts
    const portfolio = await databaseService.getAccountGroupById(portfolioId);
    if (!portfolio) {
      throw new Error("Portfolio not found");
    }

    // Search through the portfolio's accounts for a trade cash account with matching currency
    for (const account of portfolio.accounts) {
      if (account.name.includes("Trade Cash") && account.currency === currency) {
        return account;
      }
    }

    return null;
  }

  /**
   * Get all investment portfolios.
   * Returns all AccountGroups with accountType "user" that contain investment-related accounts.
   * An account group is considered an investment portfolio if it contains:
   * - A trade cash account (name contains "Trade Cash"), OR
   * - Any security accounts (accounts with InvestmentProperties)
   * 
   * This filters out regular banking account groups that don't have investment accounts.
   * 
   * @returns Array of portfolio groups with their accounts
   * 
   * Requirements: 1.4
   */
  public async getInvestmentPortfolios(): Promise<any[]> {
    // Query all AccountGroups with accountType "user"
    const allGroups = await databaseService.getAccountGroups(AccountType.User);

    // Filter to only groups that contain investment-related accounts
    const investmentPortfolios: any[] = [];

    for (const group of allGroups) {
      // Check if this group has any investment-related accounts
      let hasInvestmentAccounts = false;

      for (const account of group.accounts) {
        // Check if it's a trade cash account
        if (account.name.includes("Trade Cash")) {
          hasInvestmentAccounts = true;
          break;
        }

        // Check if it has investment properties (security account)
        const accountWithProps = await databaseService.prismaClient.account.findUnique({
          where: { id: account.id },
          include: { investmentProperties: true },
        });

        if (accountWithProps?.investmentProperties) {
          hasInvestmentAccounts = true;
          break;
        }
      }

      if (hasInvestmentAccounts) {
        investmentPortfolios.push(group);
      }
    }

    return investmentPortfolios;
  }

  /**
   * Get all accounts in a portfolio, separated into trade cash and security accounts.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @returns Object containing trade cash accounts and array of security accounts with investment properties
   * 
   * Requirements: 1.4, 1.5, Multi-currency support
   */
  public async getPortfolioAccounts(portfolioId: string): Promise<{
    tradeCash: any | null; // Legacy: first trade cash account for backward compatibility
    tradeCashAccounts: any[]; // New: all trade cash accounts
    securities: any[];
  }> {
    // Get the portfolio group with its accounts
    const portfolio = await databaseService.getAccountGroupById(portfolioId);

    if (!portfolio) {
      throw new Error("Portfolio not found");
    }

    // Separate trade cash from security accounts
    const tradeCashAccounts: any[] = [];
    const securities: any[] = [];

    for (const account of portfolio.accounts) {
      // Check if account has investment properties (indicates it's a security account)
      const accountWithProps = await databaseService.prismaClient.account.findUnique({
        where: { id: account.id },
        include: { investmentProperties: true },
      });

      if (accountWithProps?.investmentProperties) {
        // This is a security account
        securities.push(accountWithProps);
      } else if (account.name.includes("Trade Cash")) {
        // This is a trade cash account
        tradeCashAccounts.push(account);
      }
    }

    return {
      tradeCash: tradeCashAccounts.length > 0 ? tradeCashAccounts[0] : null, // Legacy compatibility
      tradeCashAccounts,
      securities,
    };
  }

  /**
   * Create a new security account for a specific ticker symbol within a portfolio.
   * Creates an Account with type "user", subtype "asset" and links it to the portfolio AccountGroup.
   * Also creates an InvestmentProperties record with ticker symbol and cost basis method.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @param tickerSymbol - Ticker symbol for the security (e.g., "AAPL", "VTSAX")
   * @param securityType - Optional type of security (e.g., "stock", "bond", "mutual_fund", "etf")
   * @param costBasisMethod - Cost basis method to use ("FIFO" or "AVERAGE_COST", default: "FIFO")
   * @returns The created Account with investment properties
   * 
   * Requirements: 2.3, 6.1
   */
  public async createSecurityAccount(
    portfolioId: string,
    tickerSymbol: string,
    securityType?: string,
    costBasisMethod: 'FIFO' | 'AVERAGE_COST' = 'FIFO'
  ): Promise<any> {
    // Validate that the portfolio exists
    const portfolio = await databaseService.getAccountGroupById(portfolioId);
    if (!portfolio) {
      throw new Error("Portfolio not found");
    }

    // Check if a security account for this ticker already exists in the portfolio
    const existingAccount = await this.getSecurityAccount(portfolioId, tickerSymbol);
    if (existingAccount) {
      throw new Error(`Security account for ${tickerSymbol} already exists in this portfolio`);
    }

    // Create the Account with type "user", subtype "asset"
    const account = await databaseService.createAccount({
      name: `${tickerSymbol}`,
      type: AccountType.User,
      subtype: AccountSubtype.Asset,
      currency: "USD", // Securities are typically tracked in USD
    });

    // Link the account to the portfolio AccountGroup
    await databaseService.addAccountToGroup(account.id, portfolioId);

    // Create InvestmentProperties record
    const investmentProperties = await databaseService.prismaClient.investmentProperties.create({
      data: {
        accountId: account.id,
        tickerSymbol,
        securityType,
        quantity: 0,
        hasCompleteActivityHistory: true,
        costBasisMethod,
        lots: costBasisMethod === 'FIFO' ? JSON.stringify([]) : null,
      },
    });

    // Return the account with investment properties
    return {
      ...account,
      investmentProperties,
    };
  }

  /**
   * Get a security account by portfolio and ticker symbol.
   * Queries for an account within the specified portfolio that has investment properties
   * matching the given ticker symbol.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @param tickerSymbol - Ticker symbol to search for
   * @returns The Account with investment properties, or null if not found
   * 
   * Requirements: 2.3
   */
  public async getSecurityAccount(
    portfolioId: string,
    tickerSymbol: string
  ): Promise<any | null> {
    // Get the portfolio group with its accounts
    const portfolio = await databaseService.getAccountGroupById(portfolioId);
    if (!portfolio) {
      throw new Error("Portfolio not found");
    }

    // Search through the portfolio's accounts for one with matching ticker symbol
    for (const account of portfolio.accounts) {
      const accountWithProps = await databaseService.prismaClient.account.findUnique({
        where: { id: account.id },
        include: { investmentProperties: true },
      });

      if (
        accountWithProps?.investmentProperties &&
        accountWithProps.investmentProperties.tickerSymbol === tickerSymbol
      ) {
        return accountWithProps;
      }
    }

    return null;
  }

  /**
   * Record a buy transaction for a security.
   * Creates or gets the security account, creates a journal entry debiting the Security Account
   * and crediting the Trade Cash Account, and updates the investment properties.
   * 
   * @param params - Buy transaction parameters
   * @returns The created journal entry
   * 
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
   */
  public async recordBuy(params: InvestmentTrade): Promise<any> {
    return recordInvestmentTrade("buy", params);
  }

  public async recordSell(params: InvestmentTrade): Promise<any> {
    return recordInvestmentTrade("sell", params);
  }

  /**
   * Record a cash dividend payment.
   * Creates a journal entry debiting Trade Cash and crediting either Dividend Income Category
   * (if categorized as income) or Security Account (if categorized as return of capital).
   * 
   * @param params - Dividend parameters
   * @returns The created journal entry
   * 
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   */
  public async recordDividend(params: DividendInput): Promise<any> {
    return recordCashDividend(params);
  }

  public async recordReinvestedDividend(params: ReinvestmentInput): Promise<any> {
    return recordReinvestment(params);
  }

  /**
   * Deposit cash into an investment portfolio.
   * Creates a journal entry debiting the Trade Cash Account and crediting the source account.
   * Uses existing transfer transaction functionality.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @param amount - Amount to deposit
   * @param fromAccountId - ID of the source account
   * @param date - Transaction date
   * @param description - Optional description
   * @returns The created journal entry
   * 
   * Requirements: 7.1, 7.3, 7.5
   */
  public async depositCash(
    portfolioId: string,
    amount: number,
    fromAccountId: string,
    date: string,
    description?: string
  ): Promise<any> {
    // Validate required fields (Requirements 7.1, 7.3)
    if (!portfolioId) {
      throw new Error("Portfolio ID is required");
    }
    if (typeof amount !== "number" || amount <= 0) {
      throw new Error("Amount must be a positive number");
    }
    if (!fromAccountId || fromAccountId.trim() === "") {
      throw new Error("Source account ID is required");
    }
    if (!date || date.trim() === "") {
      throw new Error("Transaction date is required");
    }

    // Get the portfolio to find the trade cash account
    const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);
    if (!portfolioAccounts.tradeCash) {
      throw new Error("Trade cash account not found in portfolio");
    }

    // Validate that the source account exists
    const sourceAccount = await databaseService.prismaClient.account.findUnique({
      where: { id: fromAccountId },
    });
    if (!sourceAccount) {
      throw new Error("Source account not found");
    }

    // Create journal entry using existing transfer functionality (Requirements 7.5)
    // Debit Trade Cash Account (asset increase), Credit source account (asset decrease)
    const desc = description || `Cash deposit to investment portfolio`;
    
    const result = await databaseService.createJournalEntry({
      date: date,
      description: desc,
      fromAccountId: fromAccountId,
      toAccountId: portfolioAccounts.tradeCash.id,
      amount: amount,
      transactionType: "transfer",
      skipDuplicateCheck: false, // Allow manual cash deposits even if they look like duplicates
    });

    if (result.skipped) {
      throw new Error(`Failed to create deposit transaction: ${result.reason}`);
    }

    // Update the journal entry type to CASH_DEPOSIT
    const journalEntry = await databaseService.prismaClient.journalEntry.update({
      where: { id: result.entry.id },
      data: {
        type: InvestmentTransactionType.CASH_DEPOSIT,
      },
      include: { lines: true },
    });

    return journalEntry;
  }

  /**
   * Withdraw cash from an investment portfolio.
   * Creates a journal entry crediting the Trade Cash Account and debiting the destination account.
   * Validates sufficient Trade Cash balance before proceeding.
   * Uses existing transfer transaction functionality.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @param amount - Amount to withdraw
   * @param toAccountId - ID of the destination account
   * @param date - Transaction date
   * @param description - Optional description
   * @returns The created journal entry
   * 
   * Requirements: 7.2, 7.3, 7.4, 7.5
   */
  public async withdrawCash(
    portfolioId: string,
    amount: number,
    toAccountId: string,
    date: string,
    description?: string
  ): Promise<any> {
    // Validate required fields (Requirements 7.2, 7.3)
    if (!portfolioId) {
      throw new Error("Portfolio ID is required");
    }
    if (typeof amount !== "number" || amount <= 0) {
      throw new Error("Amount must be a positive number");
    }
    if (!toAccountId || toAccountId.trim() === "") {
      throw new Error("Destination account ID is required");
    }
    if (!date || date.trim() === "") {
      throw new Error("Transaction date is required");
    }

    // Get the portfolio to find the trade cash account
    const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);
    if (!portfolioAccounts.tradeCash) {
      throw new Error("Trade cash account not found in portfolio");
    }

    // Validate that the destination account exists
    const destinationAccount = await databaseService.prismaClient.account.findUnique({
      where: { id: toAccountId },
    });
    if (!destinationAccount) {
      throw new Error("Destination account not found");
    }

    // Validate sufficient Trade Cash balance (Requirements 7.4)
    const tradeCashBalance = await databaseService.getAccountBalance(
      portfolioAccounts.tradeCash.id
    );
    if (tradeCashBalance < amount) {
      throw new Error(
        `Insufficient trade cash balance: trying to withdraw ${amount} but only ${tradeCashBalance} available`
      );
    }

    // Create journal entry using existing transfer functionality (Requirements 7.5)
    // Credit Trade Cash Account (asset decrease), Debit destination account (asset increase)
    const desc = description || `Cash withdrawal from investment portfolio`;
    
    const result = await databaseService.createJournalEntry({
      date: date,
      description: desc,
      fromAccountId: portfolioAccounts.tradeCash.id,
      toAccountId: toAccountId,
      amount: amount,
      transactionType: "transfer",
      skipDuplicateCheck: false, // Allow manual cash withdrawals even if they look like duplicates
    });

    if (result.skipped) {
      throw new Error(`Failed to create withdrawal transaction: ${result.reason}`);
    }

    // Update the journal entry type to CASH_WITHDRAWAL
    const journalEntry = await databaseService.prismaClient.journalEntry.update({
      where: { id: result.entry.id },
      data: {
        type: InvestmentTransactionType.CASH_WITHDRAWAL,
      },
      include: { lines: true },
    });

    return journalEntry;
  }

  /**
   * Record a stock split.
   * Updates the InvestmentProperties quantity by multiplying by the split ratio,
   * updates cost per share by dividing by the split ratio, and for FIFO updates all lot quantities and prices.
   * Verifies that the Security Account balance remains unchanged.
   * Stores split details in a journal entry description (no journal lines needed).
   * 
   * @param accountId - ID of the security account
   * @param splitRatio - Split ratio (e.g., 2.0 for 2-for-1 split, 0.5 for 1-for-2 reverse split)
   * @param date - Effective date of the split
   * @param description - Optional description
   * @returns The created journal entry (with no lines, just for record keeping)
   * 
   * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
   */
  public async recordStockSplit(accountId: string, splitRatio: number, date: string, description?: string): Promise<any> {
    return recordSplit(accountId, splitRatio, date, description);
  }

  /**
   * Record an investment fee.
   * Creates a journal entry debiting the Investment Expense Category and crediting the Trade Cash Account.
   * Stores fee description in journal entry metadata.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @param amount - Fee amount
   * @param description - Description of the fee
   * @param date - Transaction date
   * @returns The created journal entry
   * 
   * Requirements: 11.1, 11.2, 11.4, 11.5
   */
  public async recordFee(
    portfolioId: string,
    amount: number,
    description: string,
    date: string
  ): Promise<any> {
    // Validate required fields (Requirements 11.1)
    if (!portfolioId) {
      throw new Error("Portfolio ID is required");
    }
    if (typeof amount !== "number" || amount <= 0) {
      throw new Error("Amount must be a positive number");
    }
    if (!description || description.trim() === "") {
      throw new Error("Description is required");
    }
    if (!date || date.trim() === "") {
      throw new Error("Transaction date is required");
    }

    const roundedAmount = Math.round(amount * 100) / 100;

    // Get the portfolio to find the trade cash account
    const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);
    if (!portfolioAccounts.tradeCash) {
      throw new Error("Trade cash account not found in portfolio");
    }

    // Get the Investment Expense Category account (Requirements 11.2)
    const investmentExpenseAccount = await databaseService.prismaClient.account.findFirst({
      where: { name: "Investment Expenses", type: AccountType.Category },
    });
    if (!investmentExpenseAccount) {
      throw new Error("Investment Expenses category account not found");
    }

    // Create journal entry debiting Investment Expense Category, crediting Trade Cash Account (Requirements 11.2)
    const journalLines = [
      {
        accountId: investmentExpenseAccount.id,
        amount: roundedAmount, // Positive for debit (expense increase)
        currency: portfolioAccounts.tradeCash.currency,
        description: description,
      },
      {
        accountId: portfolioAccounts.tradeCash.id,
        amount: -roundedAmount, // Negative for credit (asset decrease)
        currency: portfolioAccounts.tradeCash.currency,
        description: description,
      },
    ];

    // Store fee description in journal entry metadata (Requirements 11.4, 11.5)
    const journalEntry = await databaseService.prismaClient.journalEntry.create({
      data: {
        date: date,
        description: description,
        type: InvestmentTransactionType.FEE,
        displayOrder: Date.now(),
        lines: {
          create: journalLines,
        },
      },
      include: { lines: true },
    });

    return journalEntry;
  }

  /**
   * Record interest income.
   * Creates a journal entry debiting the Trade Cash Account and crediting the Interest Income Category.
   * Stores optional ticker symbol in description.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @param amount - Interest amount
   * @param date - Transaction date
   * @param description - Optional description (can include ticker symbol)
   * @returns The created journal entry
   * 
   * Requirements: 14.1, 14.2, 14.3
   */
  public async recordInterest(
    portfolioId: string,
    amount: number,
    date: string,
    description?: string
  ): Promise<any> {
    // Validate required fields (Requirements 14.1)
    if (!portfolioId) {
      throw new Error("Portfolio ID is required");
    }
    if (typeof amount !== "number" || amount <= 0) {
      throw new Error("Amount must be a positive number");
    }
    if (!date || date.trim() === "") {
      throw new Error("Transaction date is required");
    }

    const roundedAmount = Math.round(amount * 100) / 100;

    // Get the portfolio to find the trade cash account
    const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);
    if (!portfolioAccounts.tradeCash) {
      throw new Error("Trade cash account not found in portfolio");
    }

    // Get the Interest Income Category account (Requirements 14.2)
    const interestIncomeAccount = await databaseService.prismaClient.account.findFirst({
      where: { name: "Interest Income", type: AccountType.Category },
    });
    if (!interestIncomeAccount) {
      throw new Error("Interest Income category account not found");
    }

    // Create journal entry debiting Trade Cash Account, crediting Interest Income Category (Requirements 14.2)
    const desc = description || "Interest income";
    
    const journalLines = [
      {
        accountId: portfolioAccounts.tradeCash.id,
        amount: roundedAmount, // Positive for debit (asset increase)
        currency: portfolioAccounts.tradeCash.currency,
        description: desc,
      },
      {
        accountId: interestIncomeAccount.id,
        amount: -roundedAmount, // Negative for credit (income increase)
        currency: portfolioAccounts.tradeCash.currency,
        description: desc,
      },
    ];

    // Store optional ticker symbol in description (Requirements 14.3)
    const journalEntry = await databaseService.prismaClient.journalEntry.create({
      data: {
        date: date,
        description: desc,
        type: InvestmentTransactionType.INTEREST,
        displayOrder: Date.now(),
        lines: {
          create: journalLines,
        },
      },
      include: { lines: true },
    });

    return journalEntry;
  }

  /**
   * Record a market price for a security.
   * Creates or updates a SecurityPriceHistory record for the given ticker symbol and date.
   * Handles unique constraint on (tickerSymbol, date) by using upsert.
   * 
   * @param tickerSymbol - Ticker symbol for the security
   * @param price - Market price per share
   * @param date - Date of the price (YYYY-MM-DD format)
   * @param source - Optional source of the price data (e.g., "manual", "import", "api")
   * @returns The created or updated SecurityPriceHistory record
   * 
   * Requirements: 8.4
   */
  public async recordMarketPrice(
    tickerSymbol: string,
    price: number,
    date: string,
    source?: string
  ): Promise<any> {
    // Validate required fields
    if (!tickerSymbol || tickerSymbol.trim() === "") {
      throw new Error("Ticker symbol is required");
    }
    if (typeof price !== "number" || price <= 0) {
      throw new Error("Price must be a positive number");
    }
    if (!date || date.trim() === "") {
      throw new Error("Date is required");
    }

    // Create or update SecurityPriceHistory record
    // Use upsert to handle unique constraint on (tickerSymbol, date)
    const priceHistory = await databaseService.prismaClient.securityPriceHistory.upsert({
      where: {
        tickerSymbol_date: {
          tickerSymbol: tickerSymbol,
          date: date,
        },
      },
      update: {
        price: price,
        source: source,
      },
      create: {
        tickerSymbol: tickerSymbol,
        date: date,
        price: price,
        source: source,
      },
    });

    return priceHistory;
  }

  /**
   * Get the market price for a security on a specific date.
   * Queries SecurityPriceHistory by ticker symbol and date.
   * 
   * @param tickerSymbol - Ticker symbol for the security
   * @param date - Date of the price (YYYY-MM-DD format)
   * @returns The price, or null if not found
   * 
   * Requirements: 8.2
   */
  public async getMarketPrice(
    tickerSymbol: string,
    date: string
  ): Promise<number | null> {
    // Validate required fields
    if (!tickerSymbol || tickerSymbol.trim() === "") {
      throw new Error("Ticker symbol is required");
    }
    if (!date || date.trim() === "") {
      throw new Error("Date is required");
    }

    // Use exact date when available, otherwise carry forward the latest prior daily value.
    const priceHistory = await databaseService.prismaClient.securityPriceHistory.findFirst({
      where: {
        tickerSymbol: tickerSymbol,
        date: {
          lte: date,
        },
      },
      orderBy: {
        date: "desc",
      },
    });

    return priceHistory ? priceHistory.price : null;
  }

  /**
   * Get the latest market price for a security.
   * Queries the most recent SecurityPriceHistory record for the ticker symbol.
   * 
   * @param tickerSymbol - Ticker symbol for the security
   * @returns Object containing price and date, or null if not found
   * 
   * Requirements: 8.4
   */
  public async getLatestMarketPrice(
    tickerSymbol: string
  ): Promise<{ price: number; date: string } | null> {
    // Validate required fields
    if (!tickerSymbol || tickerSymbol.trim() === "") {
      throw new Error("Ticker symbol is required");
    }

    // Query most recent SecurityPriceHistory for ticker
    const priceHistory = await databaseService.prismaClient.securityPriceHistory.findFirst({
      where: {
        tickerSymbol: tickerSymbol,
      },
      orderBy: {
        date: 'desc',
      },
    });

    return priceHistory ? { price: priceHistory.price, date: priceHistory.date } : null;
  }

  /**
   * Get price history for a security within a date range.
   * Queries SecurityPriceHistory by ticker symbol and optional date range.
   * 
   * @param tickerSymbol - Ticker symbol for the security
   * @param startDate - Optional start date (YYYY-MM-DD format)
   * @param endDate - Optional end date (YYYY-MM-DD format)
   * @returns Array of price records
   * 
   * Requirements: 8.4
   */
  public async getPriceHistory(
    tickerSymbol: string,
    startDate?: string,
    endDate?: string
  ): Promise<Array<{ date: string; price: number; source?: string }>> {
    // Validate required fields
    if (!tickerSymbol || tickerSymbol.trim() === "") {
      throw new Error("Ticker symbol is required");
    }

    // Build where clause with optional date range
    const whereClause: any = {
      tickerSymbol: tickerSymbol,
    };

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) {
        whereClause.date.gte = startDate;
      }
      if (endDate) {
        whereClause.date.lte = endDate;
      }
    }

    // Query SecurityPriceHistory by ticker and date range
    const priceHistory = await databaseService.prismaClient.securityPriceHistory.findMany({
      where: whereClause,
      orderBy: {
        date: 'asc',
      },
    });

    return priceHistory.map((record) => ({
      date: record.date,
      price: record.price,
      source: record.source || undefined,
    }));
  }

  /**
   * Import multiple price records for a security.
   * Batch inserts price records, handling duplicates gracefully using upsert.
   * 
   * @param tickerSymbol - Ticker symbol for the security
   * @param prices - Array of price records with date and price
   * @returns Number of records imported
   * 
   * Requirements: 8.4
   */
  public async importPriceHistory(
    tickerSymbol: string,
    prices: Array<{ date: string; price: number }>
  ): Promise<number> {
    // Validate required fields
    if (!tickerSymbol || tickerSymbol.trim() === "") {
      throw new Error("Ticker symbol is required");
    }
    if (!Array.isArray(prices) || prices.length === 0) {
      throw new Error("Prices array is required and must not be empty");
    }

    // Validate each price record
    for (const priceRecord of prices) {
      if (!priceRecord.date || priceRecord.date.trim() === "") {
        throw new Error("Each price record must have a date");
      }
      if (typeof priceRecord.price !== "number" || priceRecord.price <= 0) {
        throw new Error("Each price record must have a positive price");
      }
    }

    // Batch insert price records using upsert to handle duplicates gracefully
    let importedCount = 0;
    for (const priceRecord of prices) {
      await databaseService.prismaClient.securityPriceHistory.upsert({
        where: {
          tickerSymbol_date: {
            tickerSymbol: tickerSymbol,
            date: priceRecord.date,
          },
        },
        update: {
          price: priceRecord.price,
          source: 'import',
        },
        create: {
          tickerSymbol: tickerSymbol,
          date: priceRecord.date,
          price: priceRecord.price,
          source: 'import',
        },
      });
      importedCount++;
    }

    return importedCount;
  }

  /**
   * Get detailed position information for a security account.
   * Calculates cost basis, market value, and unrealized gains.
   * 
   * @param accountId - ID of the security account
   * @param asOfDate - Optional date for historical valuation (defaults to latest)
   * @returns Position details including cost basis, market value, and gains
   * 
   * Requirements: 8.1, 8.2, 8.3
   */
  public async getPositionDetails(
    accountId: string,
    asOfDate?: string
  ): Promise<{
    accountId: string;
    market: string | null;
    priceDate: string | null;
    tickerSymbol: string;
    quantity: number;
    costBasis: number;
    costPerShare: number;
    marketPrice: number | null;
    marketValue: number | null;
    unrealizedGain: number | null;
    unrealizedGainPercent: number | null;
  }> {
    // Query Security Account and InvestmentProperties
    const account = await databaseService.prismaClient.account.findUnique({
      where: { id: accountId },
      include: { investmentProperties: true },
    });

    if (!account || !account.investmentProperties) {
      throw new Error("Security account not found");
    }

    const investmentProps = account.investmentProperties;
    const effectiveDate = asOfDate === undefined ? new Date().toISOString().slice(0, 10) : parseToStandardDate(asOfDate);
    if (!effectiveDate) throw new Error("Invalid investment history date");
    const dated = await getInvestmentSnapshot(accountId, effectiveDate);
    if (dated.status === "unavailable" && dated.reason === "inconsistent_history") throw new Error("Investment history does not match the recorded position. Review the account before valuing it.");
    if (asOfDate && dated.status !== "available") throw new InvestmentHistoryUnavailableError("This account predates tracked investment history. Its historical holdings need review before valuation.");
    const quantity = dated.status === "available" ? dated.quantity : investmentProps.quantity;
    const costBasis = dated.status === "available" ? dated.costBasis : await databaseService.getAccountBalance(accountId);
    const costPerShare = quantity > 0 ? costBasis / quantity : 0;

    const quote = investmentProps.market ? await securityMarketData.latest({ ticker: investmentProps.tickerSymbol, market: investmentProps.market }, effectiveDate) : null;
    const marketPrice = quote?.price ?? null;

    // Calculate market value: quantity × market price
    const marketValue = quantity === 0 ? 0 : marketPrice !== null
      ? quantity * marketPrice
      : null;

    // Calculate unrealized gain: market value - cost basis
    const unrealizedGain = marketValue !== null 
      ? marketValue - costBasis 
      : null;

    // Calculate unrealized gain percent: (unrealized gain / cost basis) × 100
    const unrealizedGainPercent = unrealizedGain !== null && costBasis > 0
      ? (unrealizedGain / costBasis) * 100
      : null;

    // Fix floating-point precision issues: treat very small numbers as zero
    // This prevents "-0.00" display for balances like -6.7302587114515e-13
    const fixPrecision = (value: number): number => {
      const rounded = Math.round(value * 100) / 100;
      return Math.abs(rounded) < 0.0001 ? 0 : rounded;
    };

    return {
      accountId,
      market: investmentProps.market,
      priceDate: quote?.date ?? null,
      tickerSymbol: investmentProps.tickerSymbol,
      quantity,
      costBasis: fixPrecision(costBasis),
      costPerShare: fixPrecision(costPerShare),
      marketPrice,
      marketValue: marketValue !== null ? fixPrecision(marketValue) : null,
      unrealizedGain: unrealizedGain !== null ? fixPrecision(unrealizedGain) : null,
      unrealizedGainPercent: unrealizedGainPercent !== null ? fixPrecision(unrealizedGainPercent) : null,
    };
  }

  /**
   * Get all positions in a portfolio with their details.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @param asOfDate - Optional date for historical valuation (defaults to latest)
   * @returns Array of position details
   * 
   * Requirements: 8.1, 8.5
   */
  public async getAllPositions(
    portfolioId: string,
    asOfDate?: string
  ): Promise<Array<{
    accountId: string;
    market: string | null;
    priceDate: string | null;
    tickerSymbol: string;
    currency: string;
    quantity: number;
    costBasis: number;
    costBasisBase: number | null;
    costPerShare: number;
    marketPrice: number | null;
    marketValue: number | null;
    marketValueBase: number | null;
    unrealizedGain: number | null;
    unrealizedGainPercent: number | null;
  }>> {
    const reportingCurrency = (await appSettingsService.getBaseCurrency()) || "USD";
    const effectiveAsOfDate = asOfDate || new Date().toISOString().slice(0, 10);
    const conversionRateCache = new Map<string, number | null>();

    const convertToBaseCurrency = async (
      amount: number,
      sourceCurrency: string
    ): Promise<number | null> => {
      const cacheKey = `${sourceCurrency}->${reportingCurrency}@${effectiveAsOfDate}`;
      if (!conversionRateCache.has(cacheKey)) {
        const conversion = await valuationConversionService.convertAmount({
          amount: 1,
          sourceCurrency,
          targetCurrency: reportingCurrency,
          asOfDate: effectiveAsOfDate,
        });
        conversionRateCache.set(cacheKey, conversion.rate);
      }

      const rate = conversionRateCache.get(cacheKey);
      if (rate === null || rate === undefined) {
        return null;
      }

      return Math.round(amount * rate * 100) / 100;
    };

    // Get all security accounts in portfolio
    const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);

    // Call getPositionDetails for each
    const positions = [];
    for (const securityAccount of portfolioAccounts.securities) {
      const positionDetails = await this.getPositionDetails(securityAccount.id, asOfDate);
      const costBasisBase = await convertToBaseCurrency(positionDetails.costBasis, securityAccount.currency);
      const marketValueBase = positionDetails.marketValue === null ? null : await convertToBaseCurrency(positionDetails.marketValue, securityAccount.currency);
      positions.push({
        ...positionDetails,
        currency: securityAccount.currency,
        costBasisBase,
        marketValueBase,
      });
    }

    return positions;
  }

  /**
   * Get portfolio value summary including cash, securities, and unrealized gains.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @returns Portfolio value summary
   * 
   * Requirements: 13.2, 15.3, Multi-currency support
   */
  public async getPortfolioValue(
    portfolioId: string
  ): Promise<{
    totalCostBasis: number | null;
    totalMarketValue: number | null;
    totalUnrealizedGain: number | null;
    totalUnrealizedGainPercent: number | null;
    cashBalance: number | null;
    cashBalancesByCurrency: Record<string, number>;
    securityCostBasisByCurrency: Record<string, number>;
    securityMarketValueByCurrency: Record<string, number | null>;
  }> {
    const reportingCurrency = (await appSettingsService.getBaseCurrency()) || "USD";
    const asOfDate = new Date().toISOString().slice(0, 10);

    const conversionRateCache = new Map<string, { rate: number | null; source: string; pair: string | null }>();

    const convertToBaseCurrency = async (
      amount: number,
      sourceCurrency: string
    ): Promise<number | null> => {
      const cacheKey = `${sourceCurrency}->${reportingCurrency}@${asOfDate}`;
      let conversion = conversionRateCache.get(cacheKey);

      if (!conversion) {
        const result = await valuationConversionService.convertAmount({
          amount: 1,
          sourceCurrency,
          targetCurrency: reportingCurrency,
          asOfDate,
        });

        conversion = {
          rate: result.rate,
          source: result.source,
          pair: result.pair,
        };
        conversionRateCache.set(cacheKey, conversion);
      }

      if (conversion.source === "unavailable" || conversion.rate === null) {
        return null;
      }

      return amount * conversion.rate;
    };

    // Get all trade cash Account balances
    const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);

    let cashBalance = 0;
    let cashSummaryUnavailable = false;
    const cashBalancesByCurrency: Record<string, number> = {};

    for (const tradeCashAccount of portfolioAccounts.tradeCashAccounts) {
      const balance = await databaseService.getAccountBalance(tradeCashAccount.id);
      const convertedBalance = await convertToBaseCurrency(balance, tradeCashAccount.currency);
      if (convertedBalance === null) {
        cashSummaryUnavailable = true;
      } else {
        cashBalance += convertedBalance;
      }
      cashBalancesByCurrency[tradeCashAccount.currency] = balance;
    }

    // Get all Security Account balances (cost basis) and position market values
    let totalCostBasis = 0;
    let totalMarketValue = 0;
    let costBasisSummaryUnavailable = false;
    let marketValueSummaryUnavailable = false;
    const securityCostBasisByCurrency: Record<string, number> = {};
    const securityMarketValueByCurrency: Record<string, number | null> = {};

    for (const securityAccount of portfolioAccounts.securities) {
      const positionDetails = await this.getPositionDetails(securityAccount.id);

      const nativeMarketValue = positionDetails.marketValue;

      securityCostBasisByCurrency[securityAccount.currency] =
        (securityCostBasisByCurrency[securityAccount.currency] || 0) + positionDetails.costBasis;
      securityMarketValueByCurrency[securityAccount.currency] =
        nativeMarketValue === null || securityMarketValueByCurrency[securityAccount.currency] === null ? null :
          (securityMarketValueByCurrency[securityAccount.currency] || 0) + nativeMarketValue;

      const convertedCostBasis = await convertToBaseCurrency(positionDetails.costBasis, securityAccount.currency);
      if (convertedCostBasis === null) {
        costBasisSummaryUnavailable = true;
      } else {
        totalCostBasis += convertedCostBasis;
      }

      const convertedMarketValue = nativeMarketValue === null ? null : await convertToBaseCurrency(nativeMarketValue, securityAccount.currency);
      if (convertedMarketValue === null) {
        marketValueSummaryUnavailable = true;
      } else {
        totalMarketValue += convertedMarketValue;
      }
    }

    // Calculate total unrealized gain
    const summarizedCostBasis = costBasisSummaryUnavailable ? null : totalCostBasis;
    const summarizedMarketValue = marketValueSummaryUnavailable ? null : totalMarketValue;
    const totalUnrealizedGain =
      summarizedMarketValue !== null && summarizedCostBasis !== null
        ? summarizedMarketValue - summarizedCostBasis
        : null;

    // Calculate unrealized gain percent
    const totalUnrealizedGainPercent =
      totalUnrealizedGain !== null && summarizedCostBasis !== null && summarizedCostBasis > 0
        ? (totalUnrealizedGain / summarizedCostBasis) * 100
        : totalUnrealizedGain !== null
          ? 0
          : null;

    // Fix floating-point precision issues: treat very small numbers as zero
    // This prevents "-0.00" display for balances like -6.7302587114515e-13
    const fixPrecision = (value: number): number => {
      const rounded = Math.round(value * 100) / 100;
      return Math.abs(rounded) < 0.0001 ? 0 : rounded;
    };

    return {
      totalCostBasis: summarizedCostBasis === null ? null : fixPrecision(summarizedCostBasis),
      totalMarketValue: summarizedMarketValue === null ? null : fixPrecision(summarizedMarketValue),
      totalUnrealizedGain: totalUnrealizedGain === null ? null : fixPrecision(totalUnrealizedGain),
      totalUnrealizedGainPercent:
        totalUnrealizedGainPercent === null ? null : fixPrecision(totalUnrealizedGainPercent),
      cashBalance: cashSummaryUnavailable ? null : fixPrecision(cashBalance),
      cashBalancesByCurrency,
      securityCostBasisByCurrency,
      securityMarketValueByCurrency,
    };
  }

  /**
   * Get asset allocation for a portfolio.
   * Calculates each position as a percentage of total portfolio value.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @returns Array of asset allocations
   * 
   * Requirements: 13.3
   */
  public async getAssetAllocation(
    portfolioId: string
  ): Promise<Array<{
    accountId: string;
    tickerSymbol: string;
    marketValue: number | null;
    percentOfPortfolio: number | null;
  }>> {
    // Get all positions with market values
    const positions = await this.getAllPositions(portfolioId);

    // Calculate total portfolio value
    const portfolioValue = await this.getPortfolioValue(portfolioId);
    const totalValue = portfolioValue.totalMarketValue === null || portfolioValue.cashBalance === null ? null : portfolioValue.totalMarketValue + portfolioValue.cashBalance;

    // Calculate each position as percentage of total
    const allocations = positions.map((position) => {
      const marketValue = position.marketValue;
      const percentOfPortfolio = totalValue === null || position.marketValueBase === null ? null : totalValue > 0 ? (position.marketValueBase / totalValue) * 100 : 0;

      return {
        accountId: position.accountId,
        tickerSymbol: position.tickerSymbol,
        marketValue: marketValue === null ? null : Math.round(marketValue * 100) / 100,
        percentOfPortfolio: percentOfPortfolio === null ? null : Math.round(percentOfPortfolio * 100) / 100,
      };
    });

    return allocations;
  }

  /**
   * Get dividend income for a portfolio within a date range.
   * Queries journal entries to Dividend Income Category and groups by ticker.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup (optional, filters by portfolio if specified)
   * @param startDate - Start date (YYYY-MM-DD format)
   * @param endDate - End date (YYYY-MM-DD format)
   * @returns Total dividend income and breakdown by ticker
   * 
   * Requirements: 13.4
   */
  public async getDividendIncome(
    portfolioId: string | null,
    startDate: string,
    endDate: string
  ): Promise<{
    total: number;
    byTicker: Record<string, number>;
  }> {
    // Get the Dividend Income Category account
    const dividendIncomeAccount = await databaseService.prismaClient.account.findFirst({
      where: { name: "Dividend Income", type: AccountType.Category },
    });

    if (!dividendIncomeAccount) {
      throw new Error("Dividend Income category account not found");
    }

    // Query journal entries to Dividend Income Category for date range
    const journalLines = await databaseService.prismaClient.journalLine.findMany({
      where: {
        accountId: dividendIncomeAccount.id,
        entry: {
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      },
      include: {
        entry: true,
      },
    });

    // Filter by portfolio if specified
    let filteredLines = journalLines;
    if (portfolioId) {
      const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);
      const portfolioAccountIds = new Set([
        portfolioAccounts.tradeCash?.id,
        ...portfolioAccounts.securities.map(s => s.id),
      ].filter(Boolean));

      // Filter to only include entries that involve portfolio accounts
      filteredLines = [];
      for (const line of journalLines) {
        const entryLines = await databaseService.prismaClient.journalLine.findMany({
          where: { entryId: line.entryId },
        });
        
        const involvesPortfolio = entryLines.some(l => portfolioAccountIds.has(l.accountId));
        if (involvesPortfolio) {
          filteredLines.push(line);
        }
      }
    }

    // Sum amounts and group by ticker
    let total = 0;
    const byTicker: Record<string, number> = {};

    for (const line of filteredLines) {
      // Amount is negative for credits to income account, so negate it
      const amount = -line.amount;
      total += amount;

      // Extract ticker from description
      const description = line.entry.description || "";
      const tickerMatch = description.match(/from ([A-Z]+)/);
      if (tickerMatch) {
        const ticker = tickerMatch[1];
        byTicker[ticker] = (byTicker[ticker] || 0) + amount;
      }
    }

    return {
      total: Math.round(total * 100) / 100,
      byTicker: Object.fromEntries(
        Object.entries(byTicker).map(([ticker, amount]) => [
          ticker,
          Math.round(amount * 100) / 100,
        ])
      ),
    };
  }

  /**
   * Get interest income for a portfolio within a date range.
   * Queries journal entries to Interest Income Category.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup (optional, filters by portfolio if specified)
   * @param startDate - Start date (YYYY-MM-DD format)
   * @param endDate - End date (YYYY-MM-DD format)
   * @returns Total interest income
   * 
   * Requirements: 14.4, 14.5
   */
  public async getInterestIncome(
    portfolioId: string | null,
    startDate: string,
    endDate: string
  ): Promise<number> {
    // Get the Interest Income Category account
    const interestIncomeAccount = await databaseService.prismaClient.account.findFirst({
      where: { name: "Interest Income", type: AccountType.Category },
    });

    if (!interestIncomeAccount) {
      throw new Error("Interest Income category account not found");
    }

    // Query journal entries to Interest Income Category for date range
    const journalLines = await databaseService.prismaClient.journalLine.findMany({
      where: {
        accountId: interestIncomeAccount.id,
        entry: {
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      },
      include: {
        entry: true,
      },
    });

    // Filter by portfolio if specified
    let filteredLines = journalLines;
    if (portfolioId) {
      const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);
      const portfolioAccountIds = new Set([
        portfolioAccounts.tradeCash?.id,
        ...portfolioAccounts.securities.map(s => s.id),
      ].filter(Boolean));

      // Filter to only include entries that involve portfolio accounts
      filteredLines = [];
      for (const line of journalLines) {
        const entryLines = await databaseService.prismaClient.journalLine.findMany({
          where: { entryId: line.entryId },
        });
        
        const involvesPortfolio = entryLines.some(l => portfolioAccountIds.has(l.accountId));
        if (involvesPortfolio) {
          filteredLines.push(line);
        }
      }
    }

    // Sum amounts
    let total = 0;
    for (const line of filteredLines) {
      // Amount is negative for credits to income account, so negate it
      total += -line.amount;
    }

    return Math.round(total * 100) / 100;
  }

  /**
   * Get realized gains and losses for a portfolio within a date range.
   * Queries journal entries to Realized Gain/Loss Category and classifies by holding period.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @param startDate - Start date (YYYY-MM-DD format)
   * @param endDate - End date (YYYY-MM-DD format)
   * @returns Array of realized gain/loss records
   * 
   * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
   */
  public async getRealizedGains(
    portfolioId: string,
    startDate: string,
    endDate: string
  ): Promise<Array<{
    date: string;
    tickerSymbol: string;
    quantity: number;
    costBasis: number;
    saleProceeds: number;
    realizedGain: number;
    holdingPeriod: 'short' | 'long' | 'unknown';
  }>> {
    // Get the Realized Gain/Loss Category account
    const realizedGainLossAccount = await databaseService.prismaClient.account.findFirst({
      where: { name: "Realized Gains/Losses", type: AccountType.Category },
    });

    if (!realizedGainLossAccount) {
      throw new Error("Realized Gains/Losses category account not found");
    }

    // Query journal entries to Realized Gain/Loss Category for date range
    const journalLines = await databaseService.prismaClient.journalLine.findMany({
      where: {
        accountId: realizedGainLossAccount.id,
        entry: {
          date: {
            gte: startDate,
            lte: endDate,
          },
          type: InvestmentTransactionType.SELL,
        },
      },
      include: {
        entry: {
          include: {
            lines: true,
          },
        },
      },
    });

    // Get portfolio accounts to filter
    const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);
    const portfolioAccountIds = new Set([
      portfolioAccounts.tradeCash?.id,
      ...portfolioAccounts.securities.map(s => s.id),
    ].filter(Boolean));

    const realizedGains = [];

    for (const line of journalLines) {
      const entry = line.entry;
      
      // Check if this entry involves portfolio accounts
      const involvesPortfolio = entry.lines.some(l => portfolioAccountIds.has(l.accountId));
      if (!involvesPortfolio) {
        continue;
      }

      // Parse transaction details from description
      const description = entry.description || "";
      const tickerMatch = description.match(/of ([A-Z]+)/);
      const quantityMatch = description.match(/Sell ([\d.]+) shares/);
      const priceMatch = description.match(/@ ([\d.]+)/);

      if (!tickerMatch || !quantityMatch || !priceMatch) {
        continue;
      }

      const tickerSymbol = tickerMatch[1];
      const quantity = parseFloat(quantityMatch[1]);
      const pricePerShare = parseFloat(priceMatch[1]);

      // Find the security account line to get cost basis
      const securityLine = entry.lines.find(l => 
        l.accountId !== realizedGainLossAccount.id &&
        l.accountId !== portfolioAccounts.tradeCash?.id &&
        l.amount < 0 // Credit to security account
      );

      const costBasis = securityLine ? -securityLine.amount : 0;

      // Find the trade cash line to get sale proceeds
      const cashLine = entry.lines.find(l => 
        l.accountId === portfolioAccounts.tradeCash?.id &&
        l.amount > 0 // Debit to cash
      );

      const saleProceeds = cashLine ? cashLine.amount : quantity * pricePerShare;

      // Realized gain is negative of the amount in the gain/loss account
      // (negative amount = credit = gain, positive amount = debit = loss)
      const realizedGain = -line.amount;

      // For FIFO portfolios, calculate holding period from lot purchase dates
      let holdingPeriod: 'short' | 'long' | 'unknown' = 'unknown';
      
      const securityAccount = portfolioAccounts.securities.find(s => 
        s.investmentProperties?.tickerSymbol === tickerSymbol
      );

      if (securityAccount?.investmentProperties?.costBasisMethod === 'FIFO') {
        const lots = securityAccount.investmentProperties.lots 
          ? JSON.parse(securityAccount.investmentProperties.lots) 
          : [];
        
        if (lots.length > 0) {
          // Use the oldest lot's purchase date
          const oldestLot = lots[0];
          const purchaseDate = new Date(oldestLot.date);
          const saleDate = new Date(entry.date);
          const daysDiff = (saleDate.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24);
          
          // Classify as short-term (< 1 year) or long-term (≥ 1 year)
          holdingPeriod = daysDiff >= 365 ? 'long' : 'short';
        }
      }

      realizedGains.push({
        date: entry.date,
        tickerSymbol,
        quantity: Math.round(quantity * 1000000) / 1000000,
        costBasis: Math.round(costBasis * 100) / 100,
        saleProceeds: Math.round(saleProceeds * 100) / 100,
        realizedGain: Math.round(realizedGain * 100) / 100,
        holdingPeriod,
      });
    }

    return realizedGains;
  }

  /**
   * Get portfolio performance metrics.
   * Calculates total return, realized gains, unrealized gains, income, and fees.
   * 
   * @param portfolioId - ID of the portfolio AccountGroup
   * @param startDate - Start date (YYYY-MM-DD format)
   * @param endDate - End date (YYYY-MM-DD format)
   * @returns Performance summary
   * 
   * Requirements: 13.1, 13.5
   */
  public async getPortfolioPerformance(
    portfolioId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    totalReturn: number | null;
    totalReturnPercent: number | null;
    realizedGains: number;
    unrealizedGains: number | null;
    dividendIncome: number;
    interestIncome: number;
    fees: number;
    deposits: number;
    withdrawals: number;
    currentValue: number | null;
  }> {
    // Get current portfolio value
    const portfolioValue = await this.getPortfolioValue(portfolioId);
    const currentValue = portfolioValue.totalMarketValue === null || portfolioValue.cashBalance === null ? null : portfolioValue.totalMarketValue + portfolioValue.cashBalance;

    // Calculate deposits (cash deposits to portfolio)
    const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);
    const tradeCashId = portfolioAccounts.tradeCash?.id;

    let deposits = 0;
    if (tradeCashId) {
      const depositEntries = await databaseService.prismaClient.journalEntry.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate,
          },
          type: InvestmentTransactionType.CASH_DEPOSIT,
          lines: {
            some: {
              accountId: tradeCashId,
            },
          },
        },
        include: {
          lines: true,
        },
      });

      for (const entry of depositEntries) {
        const cashLine = entry.lines.find(l => l.accountId === tradeCashId && l.amount > 0);
        if (cashLine) {
          deposits += cashLine.amount;
        }
      }
    }

    // Calculate withdrawals (cash withdrawals from portfolio)
    let withdrawals = 0;
    if (tradeCashId) {
      const withdrawalEntries = await databaseService.prismaClient.journalEntry.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate,
          },
          type: InvestmentTransactionType.CASH_WITHDRAWAL,
          lines: {
            some: {
              accountId: tradeCashId,
            },
          },
        },
        include: {
          lines: true,
        },
      });

      for (const entry of withdrawalEntries) {
        const cashLine = entry.lines.find(l => l.accountId === tradeCashId && l.amount < 0);
        if (cashLine) {
          withdrawals += -cashLine.amount;
        }
      }
    }

    // Get realized gains
    const realizedGainsData = await this.getRealizedGains(portfolioId, startDate, endDate);
    const realizedGains = realizedGainsData.reduce((sum, rg) => sum + rg.realizedGain, 0);

    // Get unrealized gains
    const unrealizedGains = portfolioValue.totalUnrealizedGain;

    // Get dividend income
    const dividendIncomeData = await this.getDividendIncome(portfolioId, startDate, endDate);
    const dividendIncome = dividendIncomeData.total;

    // Get interest income
    const interestIncome = await this.getInterestIncome(portfolioId, startDate, endDate);

    // Get fees
    const investmentExpenseAccount = await databaseService.prismaClient.account.findFirst({
      where: { name: "Investment Expenses", type: AccountType.Category },
    });

    let fees = 0;
    if (investmentExpenseAccount) {
      const feeLines = await databaseService.prismaClient.journalLine.findMany({
        where: {
          accountId: investmentExpenseAccount.id,
          entry: {
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
        include: {
          entry: {
            include: {
              lines: true,
            },
          },
        },
      });

      // Filter by portfolio
      const portfolioAccountIds = new Set([
        tradeCashId,
        ...portfolioAccounts.securities.map(s => s.id),
      ].filter(Boolean));

      for (const line of feeLines) {
        const involvesPortfolio = line.entry.lines.some(l => portfolioAccountIds.has(l.accountId));
        if (involvesPortfolio) {
          fees += line.amount; // Positive for debit (expense)
        }
      }
    }

    // Calculate total return: (current value + withdrawals - deposits) / deposits
    const totalReturn = currentValue === null ? null : deposits > 0
      ? currentValue + withdrawals - deposits 
      : 0;
    
    const totalReturnPercent = totalReturn === null ? null : deposits > 0
      ? (totalReturn / deposits) * 100 
      : 0;

    return {
      totalReturn: totalReturn === null ? null : Math.round(totalReturn * 100) / 100,
      totalReturnPercent: totalReturnPercent === null ? null : Math.round(totalReturnPercent * 100) / 100,
      realizedGains: Math.round(realizedGains * 100) / 100,
      unrealizedGains: unrealizedGains === null ? null : Math.round(unrealizedGains * 100) / 100,
      dividendIncome: Math.round(dividendIncome * 100) / 100,
      interestIncome: Math.round(interestIncome * 100) / 100,
      fees: Math.round(fees * 100) / 100,
      deposits: Math.round(deposits * 100) / 100,
      withdrawals: Math.round(withdrawals * 100) / 100,
      currentValue: currentValue === null ? null : Math.round(currentValue * 100) / 100,
    };
  }

  /**
   * Validate CSV import data for investment transactions.
   * Parses CSV data, validates column mapping, checks required fields, and validates data types.
   * 
   * @param csvData - CSV data as a string
   * @param mapping - Column mapping configuration
   * @returns Validation result with errors
   * 
   * Requirements: 12.2
   */
  public async validateImportData(csvData: string, mapping: InvestmentImportMapping, options: InvestmentImportOptions = {}) {
    const { valid, errors, rowCount } = parseInvestmentImport(csvData, mapping, options);
    return { valid, errors, rowCount };
  }

  public async importInvestmentTransactions(portfolioId: string, csvData: string, mapping: InvestmentImportMapping, options: InvestmentImportOptions = {}) {
    return importInvestments(portfolioId, csvData, mapping, options);
  }
}

export const investmentService = InvestmentService.getInstance();
