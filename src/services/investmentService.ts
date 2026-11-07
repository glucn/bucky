import { databaseService } from "./database";
import { createHolding } from "./securityHolding";
import type { NewHoldingInput } from "../shared/securityHolding";
import { recordInvestmentCash } from "./investmentCash";
import { investmentIncomeReport, realizedGainReport, investmentReportingBundle } from "./investmentIncomeReporting";
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
import { resolveValuationDate } from "./valuationDate";

export type InvestmentPosition = {
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
};

type PositionValuation = InvestmentPosition & { currency: string; costBasisBase: number | null; marketValueBase: number | null };
type PortfolioValuation = {
  totalCostBasis: number | null;
  totalMarketValue: number | null;
  totalUnrealizedGain: number | null;
  totalUnrealizedGainPercent: number | null;
  cashBalance: number | null;
  cashBalancesByCurrency: Record<string, number>;
  securityCostBasisByCurrency: Record<string, number>;
  securityMarketValueByCurrency: Record<string, number | null>;
};

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
    return createHolding({ portfolioId, tickerSymbol, securityType, costBasisMethod });
  }

  public async createMarketHolding(input: NewHoldingInput) {
    if (!input || typeof input.market !== "string") throw new Error("An explicit resolved market is required");
    return createHolding(input);
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

    const matches = await databaseService.prismaClient.account.findMany({
      where: { groupId: portfolio.id, investmentProperties: { tickerSymbol: tickerSymbol.trim() } },
      include: { investmentProperties: true },
    });
    if (matches.length > 1) throw new Error("Ambiguous ticker; select an explicit security account");
    return matches[0] ?? null;
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
  public async recordFee(portfolioId: string, amount: number, description: string, date: string, tradeCashAccountId?: string): Promise<any> {
    return recordInvestmentCash({ portfolioId, amount, description, date, tradeCashAccountId, kind: "fee" });
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
  public async recordInterest(portfolioId: string, amount: number, date: string, description?: string, tradeCashAccountId?: string): Promise<any> {
    return recordInvestmentCash({ portfolioId, amount, description, date, tradeCashAccountId, kind: "interest" });
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
  public async getPositionDetails(accountId: string, asOfDate?: string): Promise<InvestmentPosition> {
    return this.getPositionAtDate(accountId, resolveValuationDate(asOfDate), asOfDate !== undefined);
  }

  private async getPositionAtDate(accountId: string, effectiveDate: string, requireDatedHistory: boolean): Promise<InvestmentPosition> {
    // Query Security Account and InvestmentProperties
    const account = await databaseService.prismaClient.account.findUnique({
      where: { id: accountId },
      include: { investmentProperties: true },
    });

    if (!account || !account.investmentProperties) {
      throw new Error("Security account not found");
    }

    const investmentProps = account.investmentProperties;
    const dated = await getInvestmentSnapshot(accountId, effectiveDate);
    if (dated.status === "unavailable" && dated.reason === "inconsistent_history") throw new Error("Investment history does not match the recorded position. Review the account before valuing it.");
    if (requireDatedHistory && dated.status !== "available") throw new InvestmentHistoryUnavailableError("This account predates tracked investment history. Its historical holdings need review before valuation.");
    const quantity = dated.status === "available" ? dated.quantity : investmentProps.quantity;
    const costBasis = dated.status === "available" ? dated.costBasis : await databaseService.getAccountBalanceAtDate(accountId, effectiveDate);
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
  public async getAllPositions(portfolioId: string, asOfDate?: string): Promise<PositionValuation[]> {
    const cutoff = resolveValuationDate(asOfDate);
    const reportingCurrency = (await appSettingsService.getBaseCurrency()) || "USD";
    return this.getPositionsAtDate(portfolioId, cutoff, asOfDate !== undefined, reportingCurrency);
  }

  private async getPositionsAtDate(portfolioId: string, effectiveAsOfDate: string, requireDatedHistory: boolean, reportingCurrency: string): Promise<PositionValuation[]> {
    const conversionRateCache = new Map<string, number | null>();

    const convertToBaseCurrency = async (
      amount: number,
      sourceCurrency: string
    ): Promise<number | null> => {
      if (amount === 0) return 0;
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
      const positionDetails = await this.getPositionAtDate(securityAccount.id, effectiveAsOfDate, requireDatedHistory);
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
  public async getPortfolioValue(portfolioId: string): Promise<PortfolioValuation> {
    const cutoff = resolveValuationDate();
    const reportingCurrency = (await appSettingsService.getBaseCurrency()) || "USD";
    return this.getPortfolioAtDate(portfolioId, cutoff, reportingCurrency);
  }

  private async getPortfolioAtDate(portfolioId: string, asOfDate: string, reportingCurrency: string): Promise<PortfolioValuation> {

    const conversionRateCache = new Map<string, { rate: number | null; source: string; pair: string | null }>();

    const convertToBaseCurrency = async (
      amount: number,
      sourceCurrency: string
    ): Promise<number | null> => {
      if (amount === 0) return 0;
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
      const balance = await databaseService.getAccountBalanceAtDate(tradeCashAccount.id, asOfDate);
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
      const positionDetails = await this.getPositionAtDate(securityAccount.id, asOfDate, false);

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
    const cutoff = resolveValuationDate();
    const reportingCurrency = (await appSettingsService.getBaseCurrency()) || "USD";
    const positions = await this.getPositionsAtDate(portfolioId, cutoff, false, reportingCurrency);

    // Calculate total portfolio value
    const portfolioValue = await this.getPortfolioAtDate(portfolioId, cutoff, reportingCurrency);
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
  public async getDividendIncome(portfolioId: string | null, startDate: string, endDate: string, baseCurrency?: string) {
    return investmentIncomeReport("dividend", portfolioId, startDate, endDate, baseCurrency);
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
  public async getInterestIncome(portfolioId: string | null, startDate: string, endDate: string, baseCurrency?: string) {
    return (await investmentIncomeReport("interest", portfolioId, startDate, endDate, baseCurrency)).total;
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
  public async getRealizedGains(portfolioId: string, startDate: string, endDate: string, baseCurrency?: string) {
    return realizedGainReport(portfolioId, startDate, endDate, baseCurrency);
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
    baseCurrency: string;
    incomeByCurrency: { dividends: Record<string, number>; interest: Record<string, number>; fees: Record<string, number> };
    totalReturn: number | null;
    totalReturnPercent: number | null;
    realizedGains: number | null;
    unrealizedGains: number | null;
    dividendIncome: number | null;
    interestIncome: number | null;
    fees: number | null;
    deposits: number;
    withdrawals: number;
    currentValue: number | null;
  }> {
    const baseCurrency = (await appSettingsService.getBaseCurrency()) || "USD";
    // Capture reporting currency and the current valuation cutoff once per request.
    const portfolioValue = await this.getPortfolioAtDate(portfolioId, resolveValuationDate(), baseCurrency);
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

    const income = await investmentReportingBundle(portfolioId, startDate, endDate, baseCurrency);
    const realizedGains = income.gains.reduce<number | null>((sum, row) => sum === null || row.realizedGainBase === null ? null : sum + row.realizedGainBase, 0);
    const unrealizedGains = portfolioValue.totalUnrealizedGain;
    const dividendIncome = income.dividends.total, interestIncome = income.interest.total, fees = income.fees.total;

    // Calculate total return: (current value + withdrawals - deposits) / deposits
    const totalReturn = currentValue === null ? null : deposits > 0
      ? currentValue + withdrawals - deposits 
      : 0;
    
    const totalReturnPercent = totalReturn === null ? null : deposits > 0
      ? (totalReturn / deposits) * 100 
      : 0;

    return {
      baseCurrency,
      incomeByCurrency: { dividends: income.dividends.byCurrency, interest: income.interest.byCurrency, fees: income.fees.byCurrency },
      totalReturn: totalReturn === null ? null : Math.round(totalReturn * 100) / 100,
      totalReturnPercent: totalReturnPercent === null ? null : Math.round(totalReturnPercent * 100) / 100,
      realizedGains: realizedGains === null ? null : Math.round(realizedGains * 100) / 100,
      unrealizedGains: unrealizedGains === null ? null : Math.round(unrealizedGains * 100) / 100,
      dividendIncome: dividendIncome === null ? null : Math.round(dividendIncome * 100) / 100,
      interestIncome: interestIncome === null ? null : Math.round(interestIncome * 100) / 100,
      fees: fees === null ? null : Math.round(fees * 100) / 100,
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
