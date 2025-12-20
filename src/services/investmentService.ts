import { databaseService } from "./database";
import { AccountType, AccountSubtype } from "../shared/accountTypes";

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
      name: `Trade Cash - ${name}`,
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
  public async recordBuy(params: {
    portfolioId: string;
    tickerSymbol: string;
    quantity: number;
    pricePerShare: number;
    date: string;
    fee?: number;
    description?: string;
  }): Promise<any> {
    // Validate required fields (Requirements 2.1)
    if (!params.portfolioId) {
      throw new Error("Portfolio ID is required");
    }
    if (!params.tickerSymbol || params.tickerSymbol.trim() === "") {
      throw new Error("Ticker symbol is required");
    }
    if (typeof params.quantity !== "number" || params.quantity <= 0) {
      throw new Error("Quantity must be a positive number");
    }
    if (typeof params.pricePerShare !== "number" || params.pricePerShare <= 0) {
      throw new Error("Price per share must be a positive number");
    }
    if (!params.date || params.date.trim() === "") {
      throw new Error("Transaction date is required");
    }
    if (params.fee !== undefined && (typeof params.fee !== "number" || params.fee < 0)) {
      throw new Error("Fee must be a non-negative number");
    }

    // Calculate total cost: (quantity × price) + fees (Requirements 2.2)
    const fee = params.fee || 0;
    const totalCost = params.quantity * params.pricePerShare + fee;
    const roundedTotalCost = Math.round(totalCost * 100) / 100;

    // Get the portfolio to find the trade cash account
    const portfolioAccounts = await this.getPortfolioAccounts(params.portfolioId);
    if (!portfolioAccounts.tradeCash) {
      throw new Error("Trade Cash account not found in portfolio");
    }

    // Create or get security account (Requirements 2.3)
    let securityAccount = await this.getSecurityAccount(params.portfolioId, params.tickerSymbol);
    if (!securityAccount) {
      securityAccount = await this.createSecurityAccount(
        params.portfolioId,
        params.tickerSymbol
      );
    }

    // Get the Investment Expense Category account if there are fees
    let investmentExpenseAccount = null;
    if (fee > 0) {
      investmentExpenseAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Investment Expenses", type: AccountType.Category },
      });
      if (!investmentExpenseAccount) {
        throw new Error("Investment Expenses category account not found");
      }
    }

    // Create journal entry with multiple lines (Requirements 2.4, 2.5)
    const description = params.description || `Buy ${params.quantity} shares of ${params.tickerSymbol} @ $${params.pricePerShare}`;
    
    // Prepare journal lines
    const journalLines = [];
    
    // Line 1: Debit Security Account for total cost (including fees)
    journalLines.push({
      accountId: securityAccount.id,
      amount: roundedTotalCost, // Positive for debit (asset increase)
      currency: securityAccount.currency,
      description: description,
    });

    // Line 2: Credit Trade Cash Account for purchase amount (without fees)
    const purchaseAmount = params.quantity * params.pricePerShare;
    const roundedPurchaseAmount = Math.round(purchaseAmount * 100) / 100;
    journalLines.push({
      accountId: portfolioAccounts.tradeCash.id,
      amount: -roundedPurchaseAmount, // Negative for credit (asset decrease)
      currency: portfolioAccounts.tradeCash.currency,
      description: description,
    });

    // Line 3: If fees exist, credit Trade Cash Account for fee amount
    if (fee > 0 && investmentExpenseAccount) {
      const roundedFee = Math.round(fee * 100) / 100;
      journalLines.push({
        accountId: portfolioAccounts.tradeCash.id,
        amount: -roundedFee, // Negative for credit (asset decrease)
        currency: portfolioAccounts.tradeCash.currency,
        description: `Fee for ${description}`,
      });
      
      // Line 4: Debit Investment Expense Category for fee amount
      journalLines.push({
        accountId: investmentExpenseAccount.id,
        amount: roundedFee, // Positive for debit (expense increase)
        currency: portfolioAccounts.tradeCash.currency,
        description: `Fee for ${description}`,
      });
    }

    // Create the journal entry
    const journalEntry = await databaseService.prismaClient.journalEntry.create({
      data: {
        date: params.date,
        description: description,
        type: InvestmentTransactionType.BUY,
        displayOrder: Date.now(),
        lines: {
          create: journalLines,
        },
      },
      include: { lines: true },
    });

    // Update InvestmentProperties quantity and lots (for FIFO)
    const investmentProps = securityAccount.investmentProperties;
    const newQuantity = investmentProps.quantity + params.quantity;
    
    let updatedLots = null;
    if (investmentProps.costBasisMethod === 'FIFO') {
      // Parse existing lots
      const existingLots = investmentProps.lots ? JSON.parse(investmentProps.lots) : [];
      
      // Add new lot
      const newLot = {
        date: params.date,
        quantity: params.quantity,
        pricePerShare: params.pricePerShare,
        amount: roundedTotalCost, // Include fees in the lot cost
      };
      existingLots.push(newLot);
      
      updatedLots = JSON.stringify(existingLots);
    }

    // Update the investment properties
    await databaseService.prismaClient.investmentProperties.update({
      where: { id: investmentProps.id },
      data: {
        quantity: newQuantity,
        lots: updatedLots,
      },
    });

    return journalEntry;
  }

  /**
   * Calculate cost basis for selling a specified quantity of shares.
   * Uses the portfolio's cost basis method (FIFO or AVERAGE_COST).
   * 
   * @param accountId - ID of the security account
   * @param quantity - Number of shares to sell
   * @returns Object containing total cost basis and lots used (for FIFO)
   * 
   * Requirements: 6.2, 6.3, 6.4, 6.5
   */
  private async calculateCostBasis(
    accountId: string,
    quantity: number
  ): Promise<{
    totalCost: number;
    lotsUsed?: Array<{ date: string; quantity: number; cost: number }>;
  }> {
    // Get the account with investment properties
    const account = await databaseService.prismaClient.account.findUnique({
      where: { id: accountId },
      include: { investmentProperties: true },
    });

    if (!account || !account.investmentProperties) {
      throw new Error("Security account not found");
    }

    const investmentProps = account.investmentProperties;

    // Validate sufficient quantity
    if (investmentProps.quantity < quantity) {
      throw new Error(
        `Insufficient shares: trying to sell ${quantity} but only ${investmentProps.quantity} available`
      );
    }

    if (investmentProps.costBasisMethod === 'FIFO') {
      // FIFO: Select oldest lots first (Requirements 6.3)
      const lots = investmentProps.lots ? JSON.parse(investmentProps.lots) : [];
      
      if (lots.length === 0) {
        throw new Error("No lots available for FIFO cost basis calculation");
      }

      let remainingQuantity = quantity;
      let totalCost = 0;
      const lotsUsed: Array<{ date: string; quantity: number; cost: number }> = [];

      for (const lot of lots) {
        if (remainingQuantity <= 0) break;

        const quantityFromLot = Math.min(remainingQuantity, lot.quantity);
        const costFromLot = (lot.amount / lot.quantity) * quantityFromLot;

        lotsUsed.push({
          date: lot.date,
          quantity: quantityFromLot,
          cost: costFromLot,
        });

        totalCost += costFromLot;
        remainingQuantity -= quantityFromLot;
      }

      if (remainingQuantity > 0) {
        throw new Error("Insufficient lot data for FIFO cost basis calculation");
      }

      return {
        totalCost: Math.round(totalCost * 100) / 100,
        lotsUsed,
      };
    } else {
      // AVERAGE_COST: Use (account balance / quantity) (Requirements 6.4)
      // Get the account balance by summing journal lines
      const balance = await databaseService.getAccountBalance(accountId);
      
      if (balance <= 0) {
        throw new Error("Account has zero or negative balance");
      }

      const averageCostPerShare = balance / investmentProps.quantity;
      const totalCost = averageCostPerShare * quantity;

      return {
        totalCost: Math.round(totalCost * 100) / 100,
      };
    }
  }

  /**
   * Record a sell transaction for a security.
   * Calculates cost basis using the portfolio's method, creates journal entry,
   * and records realized gain/loss.
   * 
   * @param params - Sell transaction parameters
   * @returns The created journal entry
   * 
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
   */
  public async recordSell(params: {
    portfolioId: string;
    tickerSymbol: string;
    quantity: number;
    pricePerShare: number;
    date: string;
    fee?: number;
    description?: string;
  }): Promise<any> {
    // Validate required fields (Requirements 3.1)
    if (!params.portfolioId) {
      throw new Error("Portfolio ID is required");
    }
    if (!params.tickerSymbol || params.tickerSymbol.trim() === "") {
      throw new Error("Ticker symbol is required");
    }
    if (typeof params.quantity !== "number" || params.quantity <= 0) {
      throw new Error("Quantity must be a positive number");
    }
    if (typeof params.pricePerShare !== "number" || params.pricePerShare <= 0) {
      throw new Error("Price per share must be a positive number");
    }
    if (!params.date || params.date.trim() === "") {
      throw new Error("Transaction date is required");
    }
    if (params.fee !== undefined && (typeof params.fee !== "number" || params.fee < 0)) {
      throw new Error("Fee must be a non-negative number");
    }

    // Calculate sale proceeds: (quantity × price) - fees (Requirements 3.2)
    const fee = params.fee || 0;
    const saleProceeds = params.quantity * params.pricePerShare - fee;
    const roundedSaleProceeds = Math.round(saleProceeds * 100) / 100;

    // Get the portfolio to find the trade cash account
    const portfolioAccounts = await this.getPortfolioAccounts(params.portfolioId);
    if (!portfolioAccounts.tradeCash) {
      throw new Error("Trade Cash account not found in portfolio");
    }

    // Get the security account
    const securityAccount = await this.getSecurityAccount(params.portfolioId, params.tickerSymbol);
    if (!securityAccount) {
      throw new Error(`Security account for ${params.tickerSymbol} not found in portfolio`);
    }

    // Calculate cost basis using portfolio's cost basis method (Requirements 3.3)
    const costBasisResult = await this.calculateCostBasis(
      securityAccount.id,
      params.quantity
    );
    const costBasis = costBasisResult.totalCost;

    // Calculate realized gain/loss: proceeds - cost basis (Requirements 3.5)
    const realizedGainLoss = roundedSaleProceeds - costBasis;
    const roundedGainLoss = Math.round(realizedGainLoss * 100) / 100;

    // Get the Realized Gain/Loss Category account
    const realizedGainLossAccount = await databaseService.prismaClient.account.findFirst({
      where: { name: "Realized Gains/Losses", type: AccountType.Category },
    });
    if (!realizedGainLossAccount) {
      throw new Error("Realized Gains/Losses category account not found");
    }

    // Get the Investment Expense Category account if there are fees
    let investmentExpenseAccount = null;
    if (fee > 0) {
      investmentExpenseAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Investment Expenses", type: AccountType.Category },
      });
      if (!investmentExpenseAccount) {
        throw new Error("Investment Expenses category account not found");
      }
    }

    // Create journal entry (Requirements 3.4)
    const description = params.description || `Sell ${params.quantity} shares of ${params.tickerSymbol} @ ${params.pricePerShare}`;
    
    // Prepare journal lines
    const journalLines = [];
    
    // Line 1: Credit Security Account for cost basis (asset decrease)
    journalLines.push({
      accountId: securityAccount.id,
      amount: -costBasis, // Negative for credit
      currency: securityAccount.currency,
      description: description,
    });

    // Line 2: Debit Trade Cash Account for sale proceeds (asset increase)
    journalLines.push({
      accountId: portfolioAccounts.tradeCash.id,
      amount: roundedSaleProceeds, // Positive for debit
      currency: portfolioAccounts.tradeCash.currency,
      description: description,
    });

    // Line 3: If gain/loss exists, add journal line to Realized Gain/Loss Category (Requirements 3.5)
    if (Math.abs(roundedGainLoss) > 0.01) { // Use small threshold to avoid floating point issues
      journalLines.push({
        accountId: realizedGainLossAccount.id,
        amount: -roundedGainLoss, // Negative if gain (credit), positive if loss (debit)
        currency: portfolioAccounts.tradeCash.currency,
        description: `${roundedGainLoss >= 0 ? 'Gain' : 'Loss'} on ${description}`,
      });
    }

    // Line 4: If fees exist, debit Investment Expense Category and credit Trade Cash
    if (fee > 0 && investmentExpenseAccount) {
      const roundedFee = Math.round(fee * 100) / 100;
      
      // Debit Investment Expense Category
      journalLines.push({
        accountId: investmentExpenseAccount.id,
        amount: roundedFee, // Positive for debit (expense increase)
        currency: portfolioAccounts.tradeCash.currency,
        description: `Fee for ${description}`,
      });
      
      // Credit Trade Cash Account for fee
      journalLines.push({
        accountId: portfolioAccounts.tradeCash.id,
        amount: -roundedFee, // Negative for credit (asset decrease)
        currency: portfolioAccounts.tradeCash.currency,
        description: `Fee for ${description}`,
      });
    }

    // Create the journal entry
    const journalEntry = await databaseService.prismaClient.journalEntry.create({
      data: {
        date: params.date,
        description: description,
        type: InvestmentTransactionType.SELL,
        displayOrder: Date.now(),
        lines: {
          create: journalLines,
        },
      },
      include: { lines: true },
    });

    // Update InvestmentProperties quantity and lots (for FIFO)
    const investmentProps = securityAccount.investmentProperties;
    const newQuantity = investmentProps.quantity - params.quantity;
    
    let updatedLots = null;
    if (investmentProps.costBasisMethod === 'FIFO' && costBasisResult.lotsUsed) {
      // Parse existing lots
      const existingLots = investmentProps.lots ? JSON.parse(investmentProps.lots) : [];
      
      // Remove sold shares from lots (oldest first)
      let remainingToRemove = params.quantity;
      const updatedLotsArray = [];
      
      for (const lot of existingLots) {
        if (remainingToRemove <= 0) {
          // Keep this lot as-is
          updatedLotsArray.push(lot);
        } else if (lot.quantity <= remainingToRemove) {
          // This lot is fully consumed, skip it
          remainingToRemove -= lot.quantity;
        } else {
          // This lot is partially consumed
          const remainingQuantity = lot.quantity - remainingToRemove;
          const remainingAmount = (lot.amount / lot.quantity) * remainingQuantity;
          
          updatedLotsArray.push({
            date: lot.date,
            quantity: remainingQuantity,
            pricePerShare: lot.pricePerShare,
            amount: Math.round(remainingAmount * 100) / 100,
          });
          
          remainingToRemove = 0;
        }
      }
      
      updatedLots = JSON.stringify(updatedLotsArray);
    }

    // Update the investment properties
    await databaseService.prismaClient.investmentProperties.update({
      where: { id: investmentProps.id },
      data: {
        quantity: newQuantity,
        lots: updatedLots,
      },
    });

    return journalEntry;
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
  public async recordDividend(params: {
    portfolioId: string;
    tickerSymbol: string;
    amount: number;
    date: string;
    isReturnOfCapital?: boolean;
    description?: string;
  }): Promise<any> {
    // Validate required fields (Requirements 4.1)
    if (!params.portfolioId) {
      throw new Error("Portfolio ID is required");
    }
    if (!params.tickerSymbol || params.tickerSymbol.trim() === "") {
      throw new Error("Ticker symbol is required");
    }
    if (typeof params.amount !== "number" || params.amount <= 0) {
      throw new Error("Dividend amount must be a positive number");
    }
    if (!params.date || params.date.trim() === "") {
      throw new Error("Transaction date is required");
    }

    const roundedAmount = Math.round(params.amount * 100) / 100;

    // Get the portfolio to find the trade cash account
    const portfolioAccounts = await this.getPortfolioAccounts(params.portfolioId);
    if (!portfolioAccounts.tradeCash) {
      throw new Error("Trade Cash account not found in portfolio");
    }

    // Prepare journal lines based on categorization (Requirements 4.2, 4.3, 4.4)
    const journalLines = [];
    let description = params.description || `Dividend from ${params.tickerSymbol}`;

    if (params.isReturnOfCapital) {
      description = params.description || `Dividend from ${params.tickerSymbol} (Return of Capital)`;
      // Return of capital: debit Trade Cash, credit Security Account (Requirements 4.4)
      const securityAccount = await this.getSecurityAccount(params.portfolioId, params.tickerSymbol);
      if (!securityAccount) {
        throw new Error(`Security account for ${params.tickerSymbol} not found in portfolio`);
      }

      // Line 1: Debit trade cash Account (asset increase)
      journalLines.push({
        accountId: portfolioAccounts.tradeCash.id,
        amount: roundedAmount, // Positive for debit
        currency: portfolioAccounts.tradeCash.currency,
        description: description,
      });

      // Line 2: Credit Security Account (cost basis decrease)
      journalLines.push({
        accountId: securityAccount.id,
        amount: -roundedAmount, // Negative for credit
        currency: securityAccount.currency,
        description: description,
      });
    } else {
      // Investment income: debit Trade Cash, credit Dividend Income Category (Requirements 4.3)
      const dividendIncomeAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Dividend Income", type: AccountType.Category },
      });
      if (!dividendIncomeAccount) {
        throw new Error("Dividend Income category account not found");
      }

      // Line 1: Debit Trade Cash Account (asset increase)
      journalLines.push({
        accountId: portfolioAccounts.tradeCash.id,
        amount: roundedAmount, // Positive for debit
        currency: portfolioAccounts.tradeCash.currency,
        description: description,
      });

      // Line 2: Credit Dividend Income Category
      // Use the trade cash account's currency for the transaction
      journalLines.push({
        accountId: dividendIncomeAccount.id,
        amount: -roundedAmount, // Negative for credit
        currency: portfolioAccounts.tradeCash.currency,
        description: description,
      });
    }

    // Create the journal entry with ticker symbol in description (Requirements 4.5)
    const journalEntry = await databaseService.prismaClient.journalEntry.create({
      data: {
        date: params.date,
        description: description,
        type: InvestmentTransactionType.DIVIDEND_CASH,
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
   * Record a reinvested dividend.
   * Calculates shares purchased and creates journal entries based on whether the dividend
   * is recorded as income or as a cost basis reduction.
   * 
   * @param params - Reinvested dividend parameters
   * @returns The created journal entry
   * 
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
   */
  public async recordReinvestedDividend(params: {
    portfolioId: string;
    tickerSymbol: string;
    dividendAmount: number;
    reinvestmentPrice: number;
    date: string;
    recordAsIncome: boolean;
    description?: string;
  }): Promise<any> {
    // Validate required fields (Requirements 5.1)
    if (!params.portfolioId) {
      throw new Error("Portfolio ID is required");
    }
    if (!params.tickerSymbol || params.tickerSymbol.trim() === "") {
      throw new Error("Ticker symbol is required");
    }
    if (typeof params.dividendAmount !== "number" || params.dividendAmount <= 0) {
      throw new Error("Dividend amount must be a positive number");
    }
    if (typeof params.reinvestmentPrice !== "number" || params.reinvestmentPrice <= 0) {
      throw new Error("Reinvestment price must be a positive number");
    }
    if (!params.date || params.date.trim() === "") {
      throw new Error("Transaction date is required");
    }

    // Calculate shares purchased: amount ÷ reinvestment price (Requirements 5.2)
    const sharesPurchased = params.dividendAmount / params.reinvestmentPrice;
    const roundedShares = Math.round(sharesPurchased * 1000000) / 1000000; // Round to 6 decimal places
    const roundedAmount = Math.round(params.dividendAmount * 100) / 100;

    // Get the portfolio to find the trade cash account
    const portfolioAccounts = await this.getPortfolioAccounts(params.portfolioId);
    if (!portfolioAccounts.tradeCash) {
      throw new Error("Trade cash account not found in portfolio");
    }

    // Get or create security account
    let securityAccount = await this.getSecurityAccount(params.portfolioId, params.tickerSymbol);
    if (!securityAccount) {
      securityAccount = await this.createSecurityAccount(
        params.portfolioId,
        params.tickerSymbol
      );
    }

    const description = params.description || `Reinvested dividend from ${params.tickerSymbol}`;

    // Create journal entries based on recordAsIncome flag (Requirements 5.3, 5.4, 5.5)
    if (params.recordAsIncome) {
      // Record as income: create two journal entries (Requirements 5.4)
      // First entry: dividend income
      const dividendIncomeAccount = await databaseService.prismaClient.account.findFirst({
        where: { name: "Dividend Income", type: AccountType.Category },
      });
      if (!dividendIncomeAccount) {
        throw new Error("Dividend Income category account not found");
      }

      await databaseService.prismaClient.journalEntry.create({
        data: {
          date: params.date,
          description: `${description} - Income`,
          type: InvestmentTransactionType.DIVIDEND_CASH,
          displayOrder: Date.now(),
          lines: {
            create: [
              {
                accountId: portfolioAccounts.tradeCash.id,
                amount: roundedAmount, // Debit cash
                currency: portfolioAccounts.tradeCash.currency,
                description: `${description} - Income`,
              },
              {
                accountId: dividendIncomeAccount.id,
                amount: -roundedAmount, // Credit income
                currency: portfolioAccounts.tradeCash.currency,
                description: `${description} - Income`,
              },
            ],
          },
        },
        include: { lines: true },
      });

      // Second entry: purchase shares
      const journalLines = [
        {
          accountId: securityAccount.id,
          amount: roundedAmount, // Debit security account
          currency: securityAccount.currency,
          description: `${description} - Purchase`,
        },
        {
          accountId: portfolioAccounts.tradeCash.id,
          amount: -roundedAmount, // Credit cash
          currency: portfolioAccounts.tradeCash.currency,
          description: `${description} - Purchase`,
        },
      ];

      const journalEntry = await databaseService.prismaClient.journalEntry.create({
        data: {
          date: params.date,
          description: `${description} - Purchase`,
          type: InvestmentTransactionType.DIVIDEND_REINVEST,
          displayOrder: Date.now() + 1, // Ensure this comes after the income entry
          lines: {
            create: journalLines,
          },
        },
        include: { lines: true },
      });

      // Update InvestmentProperties quantity and lots
      await this.updateInvestmentPropertiesForPurchase(
        securityAccount,
        roundedShares,
        params.reinvestmentPrice,
        roundedAmount,
        params.date
      );

      return journalEntry;
    } else {
      // Record as cost basis reduction: single journal entry (Requirements 5.5)
      const journalLines = [
        {
          accountId: securityAccount.id,
          amount: roundedAmount, // Debit security account
          currency: securityAccount.currency,
          description: `${description} (Cost Basis Reduction)`,
        },
      ];

      // For cost basis reduction, we need to balance the entry
      // The dividend doesn't come from anywhere, it just increases the security account
      // This is effectively a non-cash transaction that increases cost basis
      // We need a balancing entry - typically this would be to a special equity account
      // or we can use the security account itself with offsetting entries
      // However, based on the requirements, we should just debit the security account
      // Let's use a contra-account approach or Opening Balance Equity
      const openingBalanceEquity = await databaseService.prismaClient.account.findFirst({
        where: { name: "Opening Balance Equity" },
      });
      if (!openingBalanceEquity) {
        throw new Error("Opening Balance Equity account not found");
      }

      journalLines.push({
        accountId: openingBalanceEquity.id,
        amount: -roundedAmount, // Credit equity
        currency: openingBalanceEquity.currency,
        description: `${description} (Cost Basis Reduction)`,
      });

      const journalEntry = await databaseService.prismaClient.journalEntry.create({
        data: {
          date: params.date,
          description: `${description} (Cost Basis Reduction)`,
          type: InvestmentTransactionType.DIVIDEND_REINVEST,
          displayOrder: Date.now(),
          lines: {
            create: journalLines,
          },
        },
        include: { lines: true },
      });

      // Update InvestmentProperties quantity and lots
      await this.updateInvestmentPropertiesForPurchase(
        securityAccount,
        roundedShares,
        params.reinvestmentPrice,
        roundedAmount,
        params.date
      );

      return journalEntry;
    }
  }

  /**
   * Helper function to update investment properties after a purchase (buy or reinvested dividend).
   * Updates quantity and lots (for FIFO method).
   * 
   * @param securityAccount - The security account with investment properties
   * @param quantity - Number of shares purchased
   * @param pricePerShare - Price per share
   * @param totalAmount - Total amount (for lot tracking)
   * @param date - Transaction date
   */
  private async updateInvestmentPropertiesForPurchase(
    securityAccount: any,
    quantity: number,
    pricePerShare: number,
    totalAmount: number,
    date: string
  ): Promise<void> {
    const investmentProps = securityAccount.investmentProperties;
    const newQuantity = investmentProps.quantity + quantity;

    let updatedLots = null;
    if (investmentProps.costBasisMethod === 'FIFO') {
      // Parse existing lots
      const existingLots = investmentProps.lots ? JSON.parse(investmentProps.lots) : [];

      // Add new lot
      const newLot = {
        date: date,
        quantity: quantity,
        pricePerShare: pricePerShare,
        amount: totalAmount,
      };
      existingLots.push(newLot);

      updatedLots = JSON.stringify(existingLots);
    }

    // Update the investment properties
    await databaseService.prismaClient.investmentProperties.update({
      where: { id: investmentProps.id },
      data: {
        quantity: newQuantity,
        lots: updatedLots,
      },
    });
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
  public async recordStockSplit(
    accountId: string,
    splitRatio: number,
    date: string,
    description?: string
  ): Promise<any> {
    // Validate required fields (Requirements 10.1)
    if (!accountId || accountId.trim() === "") {
      throw new Error("Account ID is required");
    }
    if (typeof splitRatio !== "number" || splitRatio <= 0) {
      throw new Error("Split ratio must be a positive number");
    }
    if (!date || date.trim() === "") {
      throw new Error("Transaction date is required");
    }

    // Get the account with investment properties
    const account = await databaseService.prismaClient.account.findUnique({
      where: { id: accountId },
      include: { investmentProperties: true },
    });

    if (!account || !account.investmentProperties) {
      throw new Error("Security account not found");
    }

    const investmentProps = account.investmentProperties;

    // Get the account balance before the split (Requirements 10.3, 10.5)
    const balanceBefore = await databaseService.getAccountBalance(accountId);

    // Update InvestmentProperties quantity: multiply by split ratio (Requirements 10.2)
    const newQuantity = investmentProps.quantity * splitRatio;

    // Update lots for FIFO (Requirements 10.4)
    let updatedLots = null;
    if (investmentProps.costBasisMethod === 'FIFO') {
      const lots = investmentProps.lots ? JSON.parse(investmentProps.lots) : [];
      
      // Update all lot quantities and prices
      const updatedLotsArray = lots.map((lot: any) => ({
        date: lot.date,
        quantity: lot.quantity * splitRatio, // Multiply quantity by split ratio
        pricePerShare: lot.pricePerShare / splitRatio, // Divide price by split ratio
        amount: lot.amount, // Amount (cost basis) remains unchanged
      }));

      updatedLots = JSON.stringify(updatedLotsArray);
    }

    // Update the investment properties
    await databaseService.prismaClient.investmentProperties.update({
      where: { id: investmentProps.id },
      data: {
        quantity: newQuantity,
        lots: updatedLots,
      },
    });

    // Verify Security Account balance remains unchanged (Requirements 10.3, 10.5)
    const balanceAfter = await databaseService.getAccountBalance(accountId);
    if (Math.abs(balanceAfter - balanceBefore) > 0.01) {
      throw new Error(
        `Stock split validation failed: account balance changed from ${balanceBefore} to ${balanceAfter}`
      );
    }

    // Store split details in journal entry description (no journal lines needed) (Requirements 10.5)
    const desc = description || `Stock split ${splitRatio}:1 for ${investmentProps.tickerSymbol}`;
    
    const journalEntry = await databaseService.prismaClient.journalEntry.create({
      data: {
        date: date,
        description: desc,
        type: InvestmentTransactionType.STOCK_SPLIT,
        displayOrder: Date.now(),
        // No lines needed for stock split - it's just a record-keeping entry
      },
      include: { lines: true },
    });

    return journalEntry;
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

    // Query SecurityPriceHistory by ticker and date
    const priceHistory = await databaseService.prismaClient.securityPriceHistory.findUnique({
      where: {
        tickerSymbol_date: {
          tickerSymbol: tickerSymbol,
          date: date,
        },
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

    // Calculate cost basis from account balance
    const costBasis = await databaseService.getAccountBalance(accountId);

    // Calculate cost per share: cost basis / quantity
    const costPerShare = investmentProps.quantity > 0 
      ? costBasis / investmentProps.quantity 
      : 0;

    // Get latest market price from SecurityPriceHistory
    let marketPrice: number | null = null;
    if (asOfDate) {
      marketPrice = await this.getMarketPrice(investmentProps.tickerSymbol, asOfDate);
    } else {
      const latestPrice = await this.getLatestMarketPrice(investmentProps.tickerSymbol);
      marketPrice = latestPrice ? latestPrice.price : null;
    }

    // Calculate market value: quantity × market price
    const marketValue = marketPrice !== null 
      ? investmentProps.quantity * marketPrice 
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
      tickerSymbol: investmentProps.tickerSymbol,
      quantity: investmentProps.quantity,
      costBasis: fixPrecision(costBasis),
      costPerShare: fixPrecision(costPerShare),
      marketPrice: marketPrice !== null ? fixPrecision(marketPrice) : null,
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
    tickerSymbol: string;
    quantity: number;
    costBasis: number;
    costPerShare: number;
    marketPrice: number | null;
    marketValue: number | null;
    unrealizedGain: number | null;
    unrealizedGainPercent: number | null;
  }>> {
    // Get all security accounts in portfolio
    const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);

    // Call getPositionDetails for each
    const positions = [];
    for (const securityAccount of portfolioAccounts.securities) {
      const positionDetails = await this.getPositionDetails(securityAccount.id, asOfDate);
      positions.push(positionDetails);
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
    totalCostBasis: number;
    totalMarketValue: number;
    totalUnrealizedGain: number;
    totalUnrealizedGainPercent: number;
    cashBalance: number;
    cashBalancesByCurrency: Record<string, number>;
  }> {
    // Get all trade cash Account balances
    const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);
    
    let cashBalance = 0;
    const cashBalancesByCurrency: Record<string, number> = {};
    
    for (const tradeCashAccount of portfolioAccounts.tradeCashAccounts) {
      const balance = await databaseService.getAccountBalance(tradeCashAccount.id);
      cashBalance += balance; // Note: This assumes all currencies have same value, which is not ideal
      cashBalancesByCurrency[tradeCashAccount.currency] = balance;
    }

    // Get all Security Account balances (cost basis) and position market values
    let totalCostBasis = 0;
    let totalMarketValue = 0;

    for (const securityAccount of portfolioAccounts.securities) {
      const positionDetails = await this.getPositionDetails(securityAccount.id);
      totalCostBasis += positionDetails.costBasis;
      
      if (positionDetails.marketValue !== null) {
        totalMarketValue += positionDetails.marketValue;
      } else {
        // If no market price available, use cost basis
        totalMarketValue += positionDetails.costBasis;
      }
    }

    // Calculate total unrealized gain
    const totalUnrealizedGain = totalMarketValue - totalCostBasis;

    // Calculate unrealized gain percent
    const totalUnrealizedGainPercent = totalCostBasis > 0
      ? (totalUnrealizedGain / totalCostBasis) * 100
      : 0;

    // Fix floating-point precision issues: treat very small numbers as zero
    // This prevents "-0.00" display for balances like -6.7302587114515e-13
    const fixPrecision = (value: number): number => {
      const rounded = Math.round(value * 100) / 100;
      return Math.abs(rounded) < 0.0001 ? 0 : rounded;
    };

    return {
      totalCostBasis: fixPrecision(totalCostBasis),
      totalMarketValue: fixPrecision(totalMarketValue),
      totalUnrealizedGain: fixPrecision(totalUnrealizedGain),
      totalUnrealizedGainPercent: fixPrecision(totalUnrealizedGainPercent),
      cashBalance: fixPrecision(cashBalance),
      cashBalancesByCurrency,
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
    tickerSymbol: string;
    marketValue: number;
    percentOfPortfolio: number;
  }>> {
    // Get all positions with market values
    const positions = await this.getAllPositions(portfolioId);

    // Calculate total portfolio value
    const portfolioValue = await this.getPortfolioValue(portfolioId);
    const totalValue = portfolioValue.totalMarketValue + portfolioValue.cashBalance;

    // Calculate each position as percentage of total
    const allocations = positions.map((position) => {
      const marketValue = position.marketValue !== null ? position.marketValue : position.costBasis;
      const percentOfPortfolio = totalValue > 0 ? (marketValue / totalValue) * 100 : 0;

      return {
        tickerSymbol: position.tickerSymbol,
        marketValue: Math.round(marketValue * 100) / 100,
        percentOfPortfolio: Math.round(percentOfPortfolio * 100) / 100,
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
    totalReturn: number;
    totalReturnPercent: number;
    realizedGains: number;
    unrealizedGains: number;
    dividendIncome: number;
    interestIncome: number;
    fees: number;
    deposits: number;
    withdrawals: number;
    currentValue: number;
  }> {
    // Get current portfolio value
    const portfolioValue = await this.getPortfolioValue(portfolioId);
    const currentValue = portfolioValue.totalMarketValue + portfolioValue.cashBalance;

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
    const totalReturn = deposits > 0 
      ? currentValue + withdrawals - deposits 
      : 0;
    
    const totalReturnPercent = deposits > 0 
      ? (totalReturn / deposits) * 100 
      : 0;

    return {
      totalReturn: Math.round(totalReturn * 100) / 100,
      totalReturnPercent: Math.round(totalReturnPercent * 100) / 100,
      realizedGains: Math.round(realizedGains * 100) / 100,
      unrealizedGains: Math.round(unrealizedGains * 100) / 100,
      dividendIncome: Math.round(dividendIncome * 100) / 100,
      interestIncome: Math.round(interestIncome * 100) / 100,
      fees: Math.round(fees * 100) / 100,
      deposits: Math.round(deposits * 100) / 100,
      withdrawals: Math.round(withdrawals * 100) / 100,
      currentValue: Math.round(currentValue * 100) / 100,
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
  public async validateImportData(
    csvData: string,
    mapping: {
      date: string;
      type: string;
      ticker: string;
      quantity?: string;
      price?: string;
      amount: string;
      fee?: string;
      description?: string;
    }
  ): Promise<{
    valid: boolean;
    errors: Array<{ row: number; field: string; error: string }>;
    rowCount: number;
  }> {
    const errors: Array<{ row: number; field: string; error: string }> = [];

    // Parse CSV data
    const lines = csvData.trim().split('\n');
    if (lines.length === 0) {
      return {
        valid: false,
        errors: [{ row: 0, field: 'csv', error: 'CSV data is empty' }],
        rowCount: 0,
      };
    }

    // Parse header row
    const headerLine = lines[0];
    const headers = this.parseCSVLine(headerLine);

    // Validate column mapping - check required fields are present
    const requiredMappings = ['date', 'type', 'ticker', 'amount'];
    for (const required of requiredMappings) {
      const columnName = mapping[required as keyof typeof mapping];
      if (!columnName || !headers.includes(columnName)) {
        errors.push({
          row: 0,
          field: required,
          error: `Required column '${columnName}' not found in CSV headers`,
        });
      }
    }

    if (errors.length > 0) {
      return {
        valid: false,
        errors,
        rowCount: lines.length - 1,
      };
    }

    // Create column index map
    const columnIndexes: Record<string, number> = {};
    for (const [key, columnName] of Object.entries(mapping)) {
      if (columnName) {
        const index = headers.indexOf(columnName);
        if (index !== -1) {
          columnIndexes[key] = index;
        }
      }
    }

    // Validate each data row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = this.parseCSVLine(line);
      const rowNumber = i + 1;

      // Validate date field
      const dateValue = values[columnIndexes.date];
      if (!dateValue || dateValue.trim() === '') {
        errors.push({
          row: rowNumber,
          field: 'date',
          error: 'Date is required',
        });
      } else {
        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateValue)) {
          errors.push({
            row: rowNumber,
            field: 'date',
            error: `Invalid date format '${dateValue}'. Expected YYYY-MM-DD`,
          });
        }
      }

      // Validate type field
      const typeValue = values[columnIndexes.type];
      if (!typeValue || typeValue.trim() === '') {
        errors.push({
          row: rowNumber,
          field: 'type',
          error: 'Transaction type is required',
        });
      } else {
        const validTypes = ['buy', 'sell', 'dividend', 'dividend_reinvest', 'interest', 'fee', 'split'];
        if (!validTypes.includes(typeValue.toLowerCase())) {
          errors.push({
            row: rowNumber,
            field: 'type',
            error: `Invalid transaction type '${typeValue}'. Must be one of: ${validTypes.join(', ')}`,
          });
        }
      }

      // Validate ticker field
      const tickerValue = values[columnIndexes.ticker];
      if (!tickerValue || tickerValue.trim() === '') {
        errors.push({
          row: rowNumber,
          field: 'ticker',
          error: 'Ticker symbol is required',
        });
      }

      // Validate amount field
      const amountValue = values[columnIndexes.amount];
      if (!amountValue || amountValue.trim() === '') {
        errors.push({
          row: rowNumber,
          field: 'amount',
          error: 'Amount is required',
        });
      } else {
        const amount = parseFloat(amountValue);
        if (isNaN(amount) || amount <= 0) {
          errors.push({
            row: rowNumber,
            field: 'amount',
            error: `Invalid amount '${amountValue}'. Must be a positive number`,
          });
        }
      }

      // Validate quantity field if present
      if (columnIndexes.quantity !== undefined) {
        const quantityValue = values[columnIndexes.quantity];
        if (quantityValue && quantityValue.trim() !== '') {
          const quantity = parseFloat(quantityValue);
          if (isNaN(quantity) || quantity <= 0) {
            errors.push({
              row: rowNumber,
              field: 'quantity',
              error: `Invalid quantity '${quantityValue}'. Must be a positive number`,
            });
          }
        }
      }

      // Validate price field if present
      if (columnIndexes.price !== undefined) {
        const priceValue = values[columnIndexes.price];
        if (priceValue && priceValue.trim() !== '') {
          const price = parseFloat(priceValue);
          if (isNaN(price) || price <= 0) {
            errors.push({
              row: rowNumber,
              field: 'price',
              error: `Invalid price '${priceValue}'. Must be a positive number`,
            });
          }
        }
      }

      // Validate fee field if present
      if (columnIndexes.fee !== undefined) {
        const feeValue = values[columnIndexes.fee];
        if (feeValue && feeValue.trim() !== '') {
          const fee = parseFloat(feeValue);
          if (isNaN(fee) || fee < 0) {
            errors.push({
              row: rowNumber,
              field: 'fee',
              error: `Invalid fee '${feeValue}'. Must be a non-negative number`,
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      rowCount: lines.length - 1,
    };
  }

  /**
   * Import investment transactions from CSV data.
   * Parses CSV with column mapping, validates each row, detects duplicates,
   * maps to transaction types, and calls appropriate record functions.
   * Creates security accounts automatically for new tickers.
   * 
   * @param portfolioId - ID of the portfolio to import transactions into
   * @param csvData - CSV data as a string
   * @param mapping - Column mapping configuration
   * @returns Import summary with counts of imported, skipped, and errors
   * 
   * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
   */
  public async importInvestmentTransactions(
    portfolioId: string,
    csvData: string,
    mapping: {
      date: string;
      type: string;
      ticker: string;
      quantity?: string;
      price?: string;
      amount: string;
      fee?: string;
      description?: string;
    }
  ): Promise<{
    imported: number;
    skipped: number;
    errors: Array<{ row: number; error: string }>;
  }> {
    // Validate portfolio exists
    const portfolio = await databaseService.getAccountGroupById(portfolioId);
    if (!portfolio) {
      throw new Error("Portfolio not found");
    }

    // Validate import data first (Requirements 12.2)
    const validation = await this.validateImportData(csvData, mapping);
    if (!validation.valid) {
      return {
        imported: 0,
        skipped: validation.rowCount,
        errors: validation.errors.map(e => ({
          row: e.row,
          error: `${e.field}: ${e.error}`,
        })),
      };
    }

    // Parse CSV with column mapping (Requirements 12.1)
    const lines = csvData.trim().split('\n');
    const headerLine = lines[0];
    const headers = this.parseCSVLine(headerLine);

    // Create column index map
    const columnIndexes: Record<string, number> = {};
    for (const [key, columnName] of Object.entries(mapping)) {
      if (columnName) {
        const index = headers.indexOf(columnName);
        if (index !== -1) {
          columnIndexes[key] = index;
        }
      }
    }

    // Get existing transactions for duplicate detection (Requirements 12.4)
    const portfolioAccounts = await this.getPortfolioAccounts(portfolioId);
    const accountIds = [
      portfolioAccounts.tradeCash?.id,
      ...portfolioAccounts.securities.map(s => s.id),
    ].filter(Boolean) as string[];

    const existingEntries = await databaseService.prismaClient.journalEntry.findMany({
      where: {
        lines: {
          some: {
            accountId: {
              in: accountIds,
            },
          },
        },
      },
      include: {
        lines: true,
      },
    });

    // Create a set of transaction signatures for duplicate detection
    const existingSignatures = new Set<string>();
    for (const entry of existingEntries) {
      // Create signature: date|ticker|quantity|amount
      const description = entry.description || '';
      const tickerMatch = description.match(/([A-Z]+)/);
      const ticker = tickerMatch ? tickerMatch[1] : '';
      
      const quantityMatch = description.match(/([\d.]+) shares/);
      const quantity = quantityMatch ? quantityMatch[1] : '';
      
      // Get amount from first line
      const amount = entry.lines[0]?.amount || 0;
      
      const signature = `${entry.date}|${ticker}|${quantity}|${Math.abs(amount)}`;
      existingSignatures.add(signature);
    }

    let imported = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];

    // Process each row (Requirements 12.3)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = this.parseCSVLine(line);
      const rowNumber = i + 1;

      try {
        // Extract values
        const date = values[columnIndexes.date];
        const type = values[columnIndexes.type].toLowerCase();
        const ticker = values[columnIndexes.ticker].toUpperCase();
        const amount = parseFloat(values[columnIndexes.amount]);
        
        const quantity = columnIndexes.quantity !== undefined && values[columnIndexes.quantity]
          ? parseFloat(values[columnIndexes.quantity])
          : undefined;
        
        const price = columnIndexes.price !== undefined && values[columnIndexes.price]
          ? parseFloat(values[columnIndexes.price])
          : undefined;
        
        const fee = columnIndexes.fee !== undefined && values[columnIndexes.fee]
          ? parseFloat(values[columnIndexes.fee])
          : undefined;
        
        const description = columnIndexes.description !== undefined && values[columnIndexes.description]
          ? values[columnIndexes.description]
          : undefined;

        // Detect duplicates (Requirements 12.4)
        const signature = `${date}|${ticker}|${quantity || ''}|${amount}`;
        if (existingSignatures.has(signature)) {
          skipped++;
          continue;
        }

        // Map to transaction type and call appropriate record function (Requirements 12.3)
        switch (type) {
          case 'buy':
            if (!quantity || !price) {
              errors.push({
                row: rowNumber,
                error: 'Buy transactions require quantity and price',
              });
              skipped++;
              break;
            }
            
            // Create security account automatically for new tickers (Requirements 12.5)
            await this.recordBuy({
              portfolioId,
              tickerSymbol: ticker,
              quantity,
              pricePerShare: price,
              date,
              fee,
              description,
            });
            imported++;
            break;

          case 'sell':
            if (!quantity || !price) {
              errors.push({
                row: rowNumber,
                error: 'Sell transactions require quantity and price',
              });
              skipped++;
              break;
            }
            
            await this.recordSell({
              portfolioId,
              tickerSymbol: ticker,
              quantity,
              pricePerShare: price,
              date,
              fee,
              description,
            });
            imported++;
            break;

          case 'dividend':
            await this.recordDividend({
              portfolioId,
              tickerSymbol: ticker,
              amount,
              date,
              isReturnOfCapital: false,
              description,
            });
            imported++;
            break;

          case 'dividend_reinvest':
            if (!price) {
              errors.push({
                row: rowNumber,
                error: 'Dividend reinvestment requires price',
              });
              skipped++;
              break;
            }
            
            await this.recordReinvestedDividend({
              portfolioId,
              tickerSymbol: ticker,
              dividendAmount: amount,
              reinvestmentPrice: price,
              date,
              recordAsIncome: true,
              description,
            });
            imported++;
            break;

          case 'interest':
            await this.recordInterest(
              portfolioId,
              amount,
              date,
              description || `Interest income - ${ticker}`
            );
            imported++;
            break;

          case 'fee':
            await this.recordFee(
              portfolioId,
              amount,
              description || `Investment fee - ${ticker}`,
              date
            );
            imported++;
            break;

          case 'split':
            // For stock splits, amount represents the split ratio
            const securityAccount = await this.getSecurityAccount(portfolioId, ticker);
            if (!securityAccount) {
              errors.push({
                row: rowNumber,
                error: `Security account for ${ticker} not found`,
              });
              skipped++;
              break;
            }
            
            await this.recordStockSplit(
              securityAccount.id,
              amount,
              date,
              description
            );
            imported++;
            break;

          default:
            errors.push({
              row: rowNumber,
              error: `Unknown transaction type: ${type}`,
            });
            skipped++;
            break;
        }

        // Add to existing signatures to prevent duplicates within the same import
        existingSignatures.add(signature);

      } catch (error) {
        errors.push({
          row: rowNumber,
          error: error instanceof Error ? error.message : String(error),
        });
        skipped++;
      }
    }

    return {
      imported,
      skipped,
      errors,
    };
  }

  /**
   * Helper function to parse a CSV line, handling quoted values.
   * 
   * @param line - CSV line to parse
   * @returns Array of values
   */
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let currentValue = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Add the last value
    values.push(currentValue.trim());

    return values;
  }
}

// Export singleton instance
export const investmentService = InvestmentService.getInstance();
