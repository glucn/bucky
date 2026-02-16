import { PrismaClient, Prisma } from "@prisma/client";
import path from "path";
import {
  AccountType,
  toAccountType,
  AccountSubtype,
} from "../shared/accountTypes";
import { parseToStandardDate } from "../shared/dateUtils";
import { autoCategorizationService } from "./autoCategorizationService";

// Type for transaction client
type TransactionClient = Prisma.TransactionClient;

/**
 * DatabaseService - Singleton service for database operations
 * 
 * This service automatically detects the runtime environment and routes database
 * operations to the appropriate SQLite database file:
 * 
 * - Test Environment (VITEST=true or NODE_ENV=test): Uses prisma/test.db
 * - Development Environment (NODE_ENV=development): Uses prisma/dev.db
 * - Production/Other: Uses prisma/dev.db
 * 
 * Environment Detection:
 * - Checks VITEST environment variable (set by Vitest test runner)
 * - Checks NODE_ENV environment variable
 * - Defaults to development database if environment is ambiguous
 * 
 * Database Isolation:
 * - Test database is automatically reset between test runs
 * - Development database persists between application restarts
 * - Both databases use the same schema (defined in prisma/schema.prisma)
 * 
 * Logging:
 * - Test environment: Minimal logging (errors only) unless DB_VERBOSE=true
 * - Development environment: Verbose logging (queries, info, warnings, errors)
 * - Set DB_VERBOSE=true to enable verbose logging in tests for debugging
 * 
 * Usage:
 * ```typescript
 * import { databaseService } from './database';
 * 
 * // Get accounts (automatically uses correct database)
 * const accounts = await databaseService.getAccounts();
 * ```
 * 
 * See README.md for database management commands and troubleshooting.
 */
class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;
  private databasePath: string;

  /**
   * Get the Prisma client instance for direct database access.
   * Use with caution - prefer using the service methods when possible.
   */
  public get prismaClient(): PrismaClient {
    return this.prisma;
  }

  /**
   * Reset all data in the database to the initial state.
   * Deletes all accounts, journal entries, journal lines, and checkpoints,
   * then re-creates the default accounts.
   * For development/testing use only!
   */
  public async resetAllData() {
    const prisma = this.prisma;
    await prisma.$transaction(async (tx) => {
      // Delete all journal lines
      await tx.journalLine.deleteMany({});
      // Delete all journal entries
      await tx.journalEntry.deleteMany({});
      // Delete all auto-categorization rules
      await tx.autoCategorizationRule.deleteMany({});
      // Delete all checkpoints
      await tx.checkpoint.deleteMany({});
      // Delete all investment properties (must be before accounts due to foreign key)
      await tx.investmentProperties.deleteMany({});
      // Delete all credit card properties (must be before accounts due to foreign key)
      await tx.creditCardProperties.deleteMany({});
      // Delete all security price history
      await tx.securityPriceHistory.deleteMany({});
      // Delete all accounts
      await tx.account.deleteMany({});
      // Delete all account groups
      await tx.accountGroup.deleteMany({});
      // Re-create default accounts
      await this.ensureDefaultAccounts(tx);
    });
    console.log("[DEV] All data reset to initial state.");
  }

  /**
   * Private constructor - implements singleton pattern with environment-aware database selection.
   * 
   * Environment Detection Logic:
   * 1. Check if VITEST=true or NODE_ENV=test -> Use test.db
   * 2. Check if NODE_ENV=development -> Use dev.db
   * 3. If NODE_ENV is undefined -> Default to dev.db with warning
   * 4. Otherwise (production) -> Use dev.db
   * 
   * The selected database path is logged on initialization for debugging.
   * 
   * Prisma Client Configuration:
   * - datasources.db.url: Set to the environment-specific database path
   * - log: Minimal (errors only) in tests, verbose in development
   *   - Override with DB_VERBOSE=true to enable verbose logging in tests
   */
  private constructor() {
    // Environment detection logic
    const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
    const isDev = process.env.NODE_ENV === "development";
    
    // Determine database path based on environment
    const devDbPath = path.join(process.cwd(), "prisma", "dev.db");
    const testDbPath = path.join(process.cwd(), "prisma", "test.db");

    if (isTest) {
      this.databasePath = `file:${testDbPath}`;
      console.log("[DatabaseService] Environment: TEST");
    } else if (isDev || process.env.NODE_ENV === undefined) {
      // Default to development database if environment is ambiguous
      this.databasePath = `file:${devDbPath}`;
      if (process.env.NODE_ENV === undefined) {
        console.warn("[DatabaseService] Unable to detect environment, defaulting to development database");
      } else {
        console.log("[DatabaseService] Environment: DEVELOPMENT");
      }
    } else {
      // Production or other environments
      this.databasePath = `file:${devDbPath}`;
      console.log("[DatabaseService] Environment: PRODUCTION");
    }
    
    // Log selected database path for debugging
    console.log(`[DatabaseService] Using database: ${this.databasePath}`);
    
    // Only set query engine path if not in test mode and __dirname is available
    if (!isTest && typeof __dirname !== 'undefined') {
      const queryEnginePath = isDev
        ? path.join(
            __dirname,
            "../../node_modules/@prisma/client/libquery_engine-darwin-arm64.dylib.node"
          )
        : path.join(
            process.resourcesPath,
            "libquery_engine-darwin-arm64.dylib.node"
          );

      console.log("Query engine path:", queryEnginePath);

      // Set the query engine path as an environment variable
      process.env.PRISMA_QUERY_ENGINE_BINARY = queryEnginePath;
    }

    // Configure Prisma Client with environment-specific datasource URL
    // Enable verbose logging with DB_VERBOSE=true (useful for debugging tests)
    const verboseLogging = process.env.DB_VERBOSE === "true";
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: this.databasePath,
        },
      },
      log: (isTest && !verboseLogging) ? ["error"] : ["query", "info", "warn", "error"],
    });

    // Set connection timeout
    this.prisma.$connect().catch(console.error);
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async initialize() {
    try {
      await this.prisma.$connect();
      console.log("Database connected successfully");
    } catch (error) {
      console.error("Failed to connect to database:", error);
      throw error;
    }
  }

  public async disconnect() {
    await this.prisma.$disconnect();
  }

  // Account operations
  public async createAccount(
    data: {
      name: string;
      type: AccountType | string;
      currency?: string;
      subtype?: AccountSubtype | string;
    },
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    return prisma.account.create({
      data: {
        name: data.name,
        type: data.type as AccountType,
        currency: data.currency || "USD",
        subtype: (data.subtype as AccountSubtype) || AccountSubtype.Asset,
      },
    });
  }

  public async getAccounts(
    includeArchived: boolean = false,
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    try {
      console.log("Fetching accounts from database...");
      const accounts = await prisma.account.findMany({
        where: includeArchived ? {} : { isArchived: false },
        orderBy: { createdAt: "asc" },
      });
      // Convert type to AccountType for each account
      const typedAccounts = accounts.map((acc) => ({
        ...acc,
        type: toAccountType(acc.type),
      }));
      console.log("Accounts fetched:", typedAccounts);
      return typedAccounts;
    } catch (error) {
      console.error("Error fetching accounts:", error);
      throw error;
    }
  }
  /**
   * Get all accounts with their current balances.
   * Optionally filter by currency.
   * For category accounts, returns multi-currency balances.
   * Returns: Array<{ ...account, balance: number, balances?: Record<string, number> }>
   */
  public async getAccountsWithBalances(
    includeArchived: boolean = false,
    tx?: TransactionClient,
    currency?: string // NEW: optional currency filter
  ) {
    const prisma = tx || this.prisma;
    try {
      const where: any = includeArchived ? {} : { isArchived: false };
      if (currency) {
        where.currency = currency;
      }
      const accounts = await prisma.account.findMany({
        where,
        orderBy: { createdAt: "asc" },
      });
      // For each account, get its current balance
      const results = await Promise.all(
        accounts.map(async (acc) => {
          const accountType = toAccountType(acc.type);
          
          // For category accounts, get multi-currency balances
          if (accountType === AccountType.Category) {
            const balances = await this.getCategoryBalancesByCurrency(acc.id, prisma);
            // Calculate total balance in account's primary currency (for backward compatibility)
            const balance = balances[acc.currency] || 0;
            console.log("[getAccountsWithBalances] Category Account:", acc.id, acc.name, "Balances:", balances);
            return {
              ...acc,
              type: accountType,
              balance,
              balances, // Multi-currency balances
            };
          } else {
            // For non-category accounts, use single balance
            const balance = await this.getAccountBalance(acc.id, prisma);
            console.log("[getAccountsWithBalances] Account:", acc.id, acc.name, "Balance:", balance);
            return {
              ...acc,
              type: accountType,
              balance,
            };
          }
        })
      );
      // Always return the account list with balances
      return results;
    } catch (error) {
      console.error("Error fetching accounts with balances:", error);
      throw error;
    }
  }

  public async getAccount(id: string, tx?: TransactionClient) {
    const prisma = tx || this.prisma;
    const acc = await prisma.account.findUnique({
      where: { id },
      include: { lines: { include: { entry: true } } },
    });
    if (!acc) return null;
    return { ...acc, type: toAccountType(acc.type) };
  }

  /**
   * Check if an account can be safely deleted (no transactions).
   * Returns object with canDelete boolean and transaction count.
   */
  public async canDeleteAccount(accountId: string, tx?: TransactionClient) {
    const prisma = tx || this.prisma;
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { lines: true },
    });

    if (!account) {
      throw new Error("Account not found");
    }

    const transactionCount = account.lines.length;
    const canDelete = transactionCount === 0;

    return {
      canDelete,
      transactionCount,
      account: { ...account, type: toAccountType(account.type) },
    };
  }

  /**
   * Archive an account (soft delete) by setting isArchived flag.
   */
  public async archiveAccount(accountId: string, tx?: TransactionClient) {
    const prisma = tx || this.prisma;
    return prisma.account.update({
      where: { id: accountId },
      data: {
        isArchived: true,
        archivedAt: new Date(),
      },
    });
  }

  /**
   * Hard delete an account. Only call this after verifying no transactions exist.
   */
  public async deleteAccount(accountId: string, tx?: TransactionClient) {
    const prisma = tx || this.prisma;
    // Double-check that no transactions exist
    const canDelete = await this.canDeleteAccount(accountId, prisma);
    if (!canDelete.canDelete) {
      throw new Error("Cannot delete account with existing transactions");
    }

    return prisma.account.delete({
      where: { id: accountId },
    });
  }

  /**
   * Restore an archived account (un-archive).
   */
  public async restoreAccount(accountId: string, tx?: TransactionClient) {
    const prisma = tx || this.prisma;
    return prisma.account.update({
      where: { id: accountId },
      data: {
        isArchived: false,
        archivedAt: null,
      },
    });
  }

  /**
   * Update an account's name and/or currency.
   */
  public async updateAccount(
    accountId: string,
    data: {
      name?: string;
      currency?: string;
    },
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    const updateData: any = {};
    
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.currency !== undefined) {
      updateData.currency = data.currency;
    }

    return prisma.account.update({
      where: { id: accountId },
      data: updateData,
    });
  }

  // Account Group operations
  /**
   * Create a new account group.
   * Sets displayOrder to max(existing displayOrder) + 1 for the given account type.
   * Handles unique constraint violations for duplicate names within the same account type.
   */
  public async createAccountGroup(
    data: {
      name: string;
      accountType: AccountType | string;
    },
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    
    try {
      // Get the maximum displayOrder for this account type
      const maxOrderGroup = await prisma.accountGroup.findFirst({
        where: { accountType: data.accountType as AccountType },
        orderBy: { displayOrder: 'desc' },
        select: { displayOrder: true },
      });
      
      const displayOrder = maxOrderGroup ? maxOrderGroup.displayOrder + 1 : 0;
      
      return await prisma.accountGroup.create({
        data: {
          name: data.name,
          accountType: data.accountType as AccountType,
          displayOrder,
        },
      });
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.code === 'P2002') {
        throw new Error('A group with this name already exists for this account type');
      }
      throw error;
    }
  }

  /**
   * Get all account groups, optionally filtered by account type.
   * Orders by displayOrder ascending and includes related accounts.
   */
  public async getAccountGroups(
    accountType?: AccountType | string,
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    
    const where = accountType ? { accountType: accountType as AccountType } : {};
    
    return await prisma.accountGroup.findMany({
      where,
      orderBy: { displayOrder: 'asc' },
      include: { accounts: true },
    });
  }

  /**
   * Get a specific account group by ID with its accounts.
   * Returns null if not found.
   */
  public async getAccountGroupById(
    id: string,
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    
    return await prisma.accountGroup.findUnique({
      where: { id },
      include: { accounts: true },
    });
  }

  /**
   * Update an account group's name and/or displayOrder.
   * Handles unique constraint violations on rename.
   */
  public async updateAccountGroup(
    id: string,
    data: { name?: string; displayOrder?: number },
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    
    try {
      const updateData: any = {};
      
      if (data.name !== undefined) {
        updateData.name = data.name;
      }
      if (data.displayOrder !== undefined) {
        updateData.displayOrder = data.displayOrder;
      }
      
      return await prisma.accountGroup.update({
        where: { id },
        data: updateData,
      });
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.code === 'P2002') {
        throw new Error('A group with this name already exists for this account type');
      }
      throw error;
    }
  }

  /**
   * Delete an account group.
   * Accounts in the group will have their groupId set to null (handled by onDelete: SetNull).
   */
  public async deleteAccountGroup(
    id: string,
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    
    return await prisma.accountGroup.delete({
      where: { id },
    });
  }

  /**
   * Add an account to a group.
   * Verifies that the account type matches the group type.
   * If the account is already in another group, it will be moved to the new group.
   */
  public async addAccountToGroup(
    accountId: string,
    groupId: string,
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    
    // Fetch the account and group
    const [account, group] = await Promise.all([
      prisma.account.findUnique({ where: { id: accountId } }),
      prisma.accountGroup.findUnique({ where: { id: groupId } }),
    ]);
    
    if (!account) {
      throw new Error('Account not found');
    }
    
    if (!group) {
      throw new Error('Account group not found');
    }
    
    // Verify account type matches group type
    if (account.type !== group.accountType) {
      throw new Error('Account type does not match group type');
    }
    
    // Update the account's groupId
    return await prisma.account.update({
      where: { id: accountId },
      data: { groupId },
    });
  }

  /**
   * Remove an account from its group.
   * Sets the account's groupId to null.
   */
  public async removeAccountFromGroup(
    accountId: string,
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    
    return await prisma.account.update({
      where: { id: accountId },
      data: { groupId: null },
    });
  }

  /**
   * Get all accounts organized by groups.
   * Returns groups with their accounts and ungrouped accounts separately.
   * Optionally filter by accountType.
   */
  public async getAccountsWithGroups(
    includeArchived: boolean = false,
    accountType?: AccountType | string,
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    
    // Build where clause for accounts
    const accountWhere: any = includeArchived ? {} : { isArchived: false };
    if (accountType) {
      accountWhere.type = accountType as AccountType;
    }
    
    // Fetch all groups with their accounts
    const groupWhere = accountType ? { accountType: accountType as AccountType } : {};
    const groups = await prisma.accountGroup.findMany({
      where: groupWhere,
      orderBy: { displayOrder: 'asc' },
      include: {
        accounts: {
          where: accountWhere,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    
    // Fetch all ungrouped accounts
    const ungroupedAccounts = await prisma.account.findMany({
      where: {
        ...accountWhere,
        groupId: null,
      },
      orderBy: { createdAt: 'asc' },
    });
    
    // Fetch balances for all accounts
    const groupsWithBalances = await Promise.all(
      groups.map(async (group) => {
        const accountsWithBalances = await Promise.all(
          group.accounts.map(async (acc) => {
            const balance = await this.getAccountBalance(acc.id, prisma);
            return {
              ...acc,
              type: toAccountType(acc.type),
              balance,
            };
          })
        );
        return {
          ...group,
          accounts: accountsWithBalances,
        };
      })
    );
    
    const ungroupedWithBalances = await Promise.all(
      ungroupedAccounts.map(async (acc) => {
        const balance = await this.getAccountBalance(acc.id, prisma);
        return {
          ...acc,
          type: toAccountType(acc.type),
          balance,
        };
      })
    );
    
    return {
      groups: groupsWithBalances,
      ungroupedAccounts: ungroupedWithBalances,
    };
  }

  /**
   * Get aggregate balance for an account group.
   * For single currency groups: returns a single number.
   * For multi-currency groups: returns Record<currency, sum>.
   */
  public async getGroupAggregateBalance(
    groupId: string,
    tx?: TransactionClient
  ): Promise<number | Record<string, number>> {
    const prisma = tx || this.prisma;
    
    // Fetch the group with its accounts
    const group = await prisma.accountGroup.findUnique({
      where: { id: groupId },
      include: { accounts: true },
    });
    
    if (!group) {
      throw new Error('Account group not found');
    }
    
    // Get balances for all accounts in the group
    const balances: Record<string, number> = {};
    
    for (const account of group.accounts) {
      const balance = await this.getAccountBalance(account.id, prisma);
      const currency = account.currency;
      
      balances[currency] = (balances[currency] || 0) + balance;
    }
    
    // Round all balances to 2 decimal places
    for (const currency in balances) {
      balances[currency] = Math.round(balances[currency] * 100) / 100;
    }
    
    // If single currency, return just the number
    const currencies = Object.keys(balances);
    if (currencies.length === 0) {
      return 0;
    } else if (currencies.length === 1) {
      return balances[currencies[0]];
    } else {
      // Multi-currency: return the record
      return balances;
    }
  }

  /**
   * Reorder account groups.
   * Accepts an array of {id, displayOrder} and updates all groups in a transaction.
   */
  public async reorderAccountGroups(
    groupOrders: Array<{ id: string; displayOrder: number }>,
    tx?: TransactionClient
  ): Promise<void> {
    const prisma = tx || this.prisma;
    
    // If no transaction provided, create one
    if (!tx) {
      return this.prisma.$transaction(async (trx) => {
        return this.reorderAccountGroups(groupOrders, trx);
      });
    }
    
    // Update each group's displayOrder
    for (const { id, displayOrder } of groupOrders) {
      await prisma.accountGroup.update({
        where: { id },
        data: { displayOrder },
      });
    }
  }

  // Double-entry transaction operations
  /**
   * Create a double-entry journal entry (transaction) with multi-currency support.
   * @param data
   *   For regular transactions:
   *     {
   *       date, description, fromAccountId, toAccountId, amount
   *     }
   *   For currency-transfer transactions:
   *     {
   *       date, description, fromAccountId, toAccountId,
   *       amountFrom, amountTo, exchangeRate, type: 'currency_transfer'
   *     }
   *   At least two of (amountFrom, amountTo, exchangeRate) must be provided for currency-transfer.
   */
  private static generateJournalLines(params: {
    transactionType: "income" | "expense" | "transfer";
    userAccountId: string;
    userAccountSubtype: AccountSubtype;
    counterpartyAccountId: string;
    counterpartyAccountSubtype: AccountSubtype;
    amount: number;
    currency: string;
    description?: string;
  }) {
    const {
      transactionType,
      userAccountId,
      userAccountSubtype,
      counterpartyAccountId,
      counterpartyAccountSubtype,
      amount,
      currency,
      description,
    } = params;

    let userLine = { accountId: userAccountId, amount: 0, currency, description };
    let counterpartyLine = { accountId: counterpartyAccountId, amount: 0, currency, description };

    // Logic table:
    // - For income: user account increases (debit for asset, credit for liability), counterparty decreases
    // - For expense: user account decreases (credit for asset, debit for liability), counterparty increases
    // - For transfer: asset/liability rules apply for both sides

    // Asset: natural debit balance (+ is debit, - is credit)
    // Liability: natural credit balance (+ is credit, - is debit)

    // Income
    if (transactionType === "income") {
      if (userAccountSubtype === AccountSubtype.Asset) {
        userLine.amount = amount; // Debit asset (increase) - positive amount increases asset
        counterpartyLine.amount = -amount; // Credit counterparty
      } else {
        userLine.amount = -amount; // Credit liability (decrease) - positive amount decreases liability
        counterpartyLine.amount = amount; // Debit counterparty
      }
    }
    // Expense
    else if (transactionType === "expense") {
      if (userAccountSubtype === AccountSubtype.Asset) {
        userLine.amount = -amount; // Credit asset (decrease) - positive amount decreases asset, negative amount (refund) increases asset
        counterpartyLine.amount = amount; // Debit counterparty - positive amount increases expense, negative amount (refund) decreases expense
      } else {
        userLine.amount = -amount; // Credit liability (increase debt) - positive amount increases debt, negative amount (refund) decreases debt
        counterpartyLine.amount = amount; // Debit counterparty
      }
    }
    // Transfer
    else if (transactionType === "transfer") {
      // For transfers, the "user" account is the FROM account, "counterparty" is the TO account
      // Money flows FROM user account TO counterparty account
      const absAmount = Math.abs(amount);
      
      // FROM account (user account) - money going out
      if (userAccountSubtype === AccountSubtype.Asset) {
        userLine.amount = -absAmount; // Credit asset (decrease balance)
      } else {
        userLine.amount = absAmount; // Debit liability (increase debt - borrowing money)
      }
      
      // TO account (counterparty account) - money coming in  
      if (counterpartyAccountSubtype === AccountSubtype.Asset) {
        counterpartyLine.amount = absAmount; // Debit asset (increase balance)
      } else {
        counterpartyLine.amount = absAmount; // Debit liability (decrease debt - receiving payment)
      }
    }

    return [userLine, counterpartyLine];
  }

  public async createJournalEntry(
    data: {
      date: string | Date;
      description?: string;
      fromAccountId: string;
      toAccountId: string;
      // For regular: amount (single-currency)
      amount?: number;
      // For currency-transfer: both amounts and exchange rate
      amountFrom?: number;
      amountTo?: number;
      exchangeRate?: number;
      type?: string; // 'regular' | 'currency_transfer'
      transactionType?: "income" | "expense" | "transfer";
      forceDuplicate?: boolean; // If true, allow duplicate creation
      postingDate?: string | Date; // Date posted to account (YYYY-MM-DD)
      skipDuplicateCheck?: boolean; // If false, skip duplicate checking (for manual entries)
    },
    tx?: TransactionClient
  ): Promise<{ skipped: boolean; reason?: string; entry?: any; existing?: any }> {
    const prisma = tx || this.prisma;

    // LOG: Start createJournalEntry
    console.log("[createJournalEntry] called with data:", data);

    // Parse date to standard YYYY-MM-DD format
    const dateStr = parseToStandardDate(data.date);
    if (!dateStr) {
      console.warn("[createJournalEntry] Skipped: Invalid date format", { data });
      return { skipped: true, reason: "Invalid date format" };
    }

    // Handle postingDate - allow null if not provided
    let postingDateStr: string | null = null;
    if (data.postingDate) {
      postingDateStr = parseToStandardDate(data.postingDate);
      
      // Only validate if we have a valid string
      if (postingDateStr) {
        // Validate that posting date is not before transaction date
        if (postingDateStr < dateStr) {
          console.warn("[createJournalEntry] Skipped: Posting date cannot be before transaction date", { data });
          return { skipped: true, reason: "Posting date cannot be before transaction date" };
        }
      } else if (data.postingDate) {
        // postingDate was provided but couldn't be parsed
        console.warn("[createJournalEntry] Skipped: Invalid posting date format", { data });
        return { skipped: true, reason: "Invalid posting date format" };
      }
    }

    // Fetch both accounts to get their currencies and subtypes
    const [fromAccount, toAccount] = await Promise.all([
      prisma.account.findUnique({ where: { id: data.fromAccountId } }),
      prisma.account.findUnique({ where: { id: data.toAccountId } }),
    ]);
    if (!fromAccount || !toAccount) {
      console.warn("[createJournalEntry] Skipped: Account not found", { fromAccount, toAccount });
      return { skipped: true, reason: "Account not found" };
    }

    // Determine transaction type
    const isCurrencyTransfer = data.type === "currency_transfer";
    console.log("[createJournalEntry] isCurrencyTransfer:", isCurrencyTransfer);

    if (!isCurrencyTransfer) {
      // Check if either account is a category account
      const isCategoryTransaction = 
        fromAccount.type === AccountType.Category || 
        toAccount.type === AccountType.Category;
      
      // Allow currency mismatch for category transactions
      if (!isCategoryTransaction && fromAccount.currency !== toAccount.currency) {
        console.warn("[createJournalEntry] Skipped: Both accounts must use the same currency for regular transactions", { currency: fromAccount.currency, toCurrency: toAccount.currency });
        return { skipped: true, reason: "Both accounts must use the same currency for regular transactions" };
      }
      if (typeof data.amount !== "number" || isNaN(data.amount)) {
        console.warn("[createJournalEntry] Skipped: Amount is required for regular transactions", { amount: data.amount });
        return { skipped: true, reason: "Amount is required for regular transactions" };
      }
      const roundedAmount = Math.round(data.amount * 100) / 100;

      // Improved deduplication logic
      // Only check for duplicates if this is an import operation or if explicitly requested
      // Manual transactions (without skipDuplicateCheck flag) should be allowed
      if (data.skipDuplicateCheck !== false) {
        console.log("[createJournalEntry] Deduplication check values:", {
          date: dateStr,
          description: data.description,
          fromAccountId: data.fromAccountId,
          toAccountId: data.toAccountId,
        });

        // Look for potential duplicates within a narrow time window (same day)
        // and with exact same details - this catches obvious import duplicates
        const existing = await prisma.journalEntry.findFirst({
          where: {
            date: dateStr,
            description: data.description,
            type: null,
            AND: [
              {
                lines: {
                  some: {
                    accountId: data.fromAccountId,
                    amount: fromAccount.subtype === AccountSubtype.Asset
                      ? -Math.abs(roundedAmount)
                      : Math.abs(roundedAmount),
                    currency: fromAccount.currency,
                  },
                },
              },
              {
                lines: {
                  some: {
                    accountId: data.toAccountId,
                    amount: toAccount.subtype === AccountSubtype.Asset
                      ? Math.abs(roundedAmount)
                      : -Math.abs(roundedAmount),
                    currency: toAccount.currency,
                  },
                },
              },
            ],
          },
          include: { lines: true },
        });

        if (existing && !data.forceDuplicate) {
          console.warn("[createJournalEntry] Potential duplicate detected (strict match on accounts, amounts, currency)", {
            deduplicationInput: {
              date: dateStr,
              description: data.description,
              fromAccountId: data.fromAccountId,
              toAccountId: data.toAccountId,
              amount: roundedAmount,
              currency: fromAccount.currency,
            },
            existing: {
              id: existing.id,
              date: existing.date,
              description: existing.description,
              type: existing.type,
              lines: existing.lines.map(l => ({
                id: l.id,
                accountId: l.accountId,
                amount: l.amount,
                currency: l.currency,
              })),
            }
          });
          // Return a warning with the existing entry for user confirmation
          return { skipped: true, reason: "potential_duplicate", existing };
        }
      }

      // Use new logic for journal lines
      // For all transactions, both lines use the same currency
      // For transactions involving categories, use the user account's currency (not the category's)
      // Categories will aggregate transactions in multiple currencies
      
      // If one account is a category, use the non-category account's currency
      // Otherwise, use fromAccount's currency (they should match for non-category transactions)
      const transactionCurrency = isCategoryTransaction
        ? (fromAccount.type === AccountType.Category ? toAccount.currency : fromAccount.currency)
        : fromAccount.currency;
      
      const [fromLine, toLine] = DatabaseService.generateJournalLines({
        transactionType: data.transactionType || "transfer",
        userAccountId: data.fromAccountId,
        userAccountSubtype: fromAccount.subtype as AccountSubtype,
        counterpartyAccountId: data.toAccountId,
        counterpartyAccountSubtype: toAccount.subtype as AccountSubtype,
        amount: roundedAmount,
        currency: transactionCurrency,
        description: data.description,
      });

      console.log("[createJournalEntry] Generated journal lines:", { fromLine, toLine });

      const entry = await prisma.journalEntry.create({
        data: {
          date: dateStr,
          description: data.description,
          type: null,
          postingDate: postingDateStr,
          displayOrder: Date.now(),
          lines: {
            create: [fromLine, toLine],
          },
        },
        include: { lines: true },
      });
      console.log("[createJournalEntry] Created journal entry:", entry);
      await this.adjustOpeningBalanceForEntryChange(
        {
          entryDate: dateStr,
          lines: entry.lines.map((line: any) => ({
            accountId: line.accountId,
            amount: line.amount,
          })),
          sign: 1,
        },
        prisma
      );
      return { skipped: false, entry };
    } else {
      // Currency-transfer transaction (unchanged)
      const currencyFrom = fromAccount.currency;
      const currencyTo = toAccount.currency;

      const hasAmountFrom = typeof data.amountFrom === "number" && !isNaN(data.amountFrom);
      const hasAmountTo = typeof data.amountTo === "number" && !isNaN(data.amountTo);
      const hasExchangeRate = typeof data.exchangeRate === "number" && !isNaN(data.exchangeRate);

      if (
        [hasAmountFrom, hasAmountTo, hasExchangeRate].filter(Boolean).length < 2
      ) {
        console.warn("[createJournalEntry] Skipped: At least two of amountFrom, amountTo, exchangeRate are required for currency-transfer", { amountFrom: data.amountFrom, amountTo: data.amountTo, exchangeRate: data.exchangeRate });
        return { skipped: true, reason: "At least two of amountFrom, amountTo, exchangeRate are required for currency-transfer" };
      }

      let amountFrom = hasAmountFrom ? Math.round(Math.abs(data.amountFrom!) * 100) / 100 : undefined;
      let amountTo = hasAmountTo ? Math.round(Math.abs(data.amountTo!) * 100) / 100 : undefined;
      let exchangeRate = hasExchangeRate ? data.exchangeRate! : undefined;

      if (!hasAmountFrom) {
        if (!hasAmountTo || !hasExchangeRate || exchangeRate === 0) {
          console.warn("[createJournalEntry] Skipped: Cannot calculate amountFrom", { amountTo, exchangeRate });
          return { skipped: true, reason: "Cannot calculate amountFrom" };
        }
        amountFrom = Math.round((amountTo! / exchangeRate!) * 100) / 100;
      } else if (!hasAmountTo) {
        if (!hasAmountFrom || !hasExchangeRate) {
          console.warn("[createJournalEntry] Skipped: Cannot calculate amountTo", { amountFrom, exchangeRate });
          return { skipped: true, reason: "Cannot calculate amountTo" };
        }
        amountTo = Math.round((amountFrom! * exchangeRate!) * 100) / 100;
      } else if (!hasExchangeRate) {
        if (!hasAmountFrom || !hasAmountTo || amountFrom === 0) {
          console.warn("[createJournalEntry] Skipped: Cannot calculate exchangeRate", { amountFrom, amountTo });
          return { skipped: true, reason: "Cannot calculate exchangeRate" };
        }
        exchangeRate = amountTo! / amountFrom!;
      }

      const tolerance = 0.01;
      if (Math.abs(amountTo! - amountFrom! * exchangeRate!) > tolerance) {
        console.warn("[createJournalEntry] Skipped: Amounts and exchange rate are inconsistent", { amountFrom, amountTo, exchangeRate });
        return { skipped: true, reason: "Amounts and exchange rate are inconsistent" };
      }

      // Apply same improved deduplication logic for currency transfers
      if (data.skipDuplicateCheck !== false) {
        const existing = await prisma.journalEntry.findFirst({
          where: {
            date: dateStr,
            description: data.description,
            type: "currency_transfer",
            lines: {
              some: {
                accountId: data.fromAccountId,
                amount: -(amountFrom!),
                currency: currencyFrom,
              },
            },
            AND: [
              {
                lines: {
                  some: {
                    accountId: data.toAccountId,
                    amount: amountTo,
                    currency: currencyTo,
                  },
                },
              },
            ],
          },
          include: { lines: true },
        });
        if (existing && !data.forceDuplicate) {
          console.warn("[createJournalEntry] Potential duplicate detected (currency_transfer)", { existing });
          return { skipped: true, reason: "potential_duplicate", existing };
        }
      }

      const entry = await prisma.journalEntry.create({
        data: {
          date: dateStr,
          description: data.description,
          type: "currency_transfer",
          postingDate: postingDateStr,
          displayOrder: Date.now(),
          lines: {
            create: [
              {
                accountId: data.fromAccountId,
                amount: -(amountFrom!),
                currency: currencyFrom,
                exchangeRate,
                description: data.description,
              },
              {
                accountId: data.toAccountId,
                amount: amountTo!,
                currency: currencyTo,
                exchangeRate,
                description: data.description,
              },
            ],
          },
        },
        include: { lines: true },
      });
      console.log("[createJournalEntry] Created currency_transfer journal entry:", entry);
      await this.adjustOpeningBalanceForEntryChange(
        {
          entryDate: dateStr,
          lines: entry.lines.map((line: any) => ({
            accountId: line.accountId,
            amount: line.amount,
          })),
          sign: 1,
        },
        prisma
      );
      return { skipped: false, entry };
    }
  }

  /**
   * Get all journal entries (transactions) for an account.
   * Returns lines for the account, joined with their entry.
   */
  public async getJournalEntriesForAccount(
    accountId: string,
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    const lines = await prisma.journalLine.findMany({
      where: {
        accountId,
        entry: {
        },
      },
      include: {
        entry: true, // Only include the entry id for now
        account: true
      },
      orderBy: [
        { entry: { date: "desc" } },
        { entry: { displayOrder: "desc" } }
      ],
    });

    // Get all unique entryIds
    const entryIds = Array.from(new Set(lines.map((line) => line.entryId)));

    // Fetch all entries with their lines and accounts
    const entries = await prisma.journalEntry.findMany({
      where: { id: { in: entryIds } },
      include: {
        lines: { include: { account: true } },
      },
    });

    // Map entryId to entry with lines and accounts
    const entryMap = new Map(
      entries.map((entry) => [
        entry.id,
        {
          ...entry,
          lines: entry.lines.map((l: any) => ({
            ...l,
            account: l.account
              ? { ...l.account, type: toAccountType(l.account.type) }
              : l.account,
          })),
        },
      ])
    );

    // Convert account.type to AccountType in each line and attach full entry with lines
    return lines.map((line) => {
      const entry: any = entryMap.get(line.entryId) || line.entry;
      // Only use entry.lines if it exists and is an array
      const entryLines: any[] = Array.isArray(entry?.lines) ? entry.lines : [];
      // Find the "other" line in the same entry
      const otherLine = entryLines.find((l: any) => l.id !== line.id);
      let isCurrencyTransfer = false;
      let exchangeRate: number | undefined = undefined;
      // Only check type if entry.type exists
      if (
        entry &&
        typeof entry.type === "string" &&
        entry.type === "currency_transfer" &&
        otherLine &&
        line.account?.currency &&
        otherLine.account?.currency &&
        line.account.currency !== otherLine.account.currency
      ) {
        isCurrencyTransfer = true;
        // Prefer explicit exchangeRate field, else calculate
        const lineExchangeRate = (line as any)["exchangeRate"];
        const otherLineExchangeRate = (otherLine as any)?.["exchangeRate"];
        if (typeof lineExchangeRate === "number") {
          exchangeRate = lineExchangeRate;
        } else if (typeof otherLineExchangeRate === "number") {
          exchangeRate = otherLineExchangeRate;
        } else if (Math.abs(otherLine.amount) > 0) {
          exchangeRate = Math.abs(line.amount / otherLine.amount);
        }
      }
      return {
        ...line,
        account: line.account
          ? { ...line.account, type: toAccountType(line.account.type) }
          : line.account,
        entry,
        isCurrencyTransfer,
        exchangeRate,
        otherLine: otherLine
          ? {
              id: otherLine.id,
              accountId: otherLine.accountId,
              amount: otherLine.amount,
              currency: otherLine.account?.currency,
              account: otherLine.account
                ? { ...otherLine.account, type: toAccountType(otherLine.account.type) }
                : otherLine.account,
            }
          : undefined,
      };
    });
  }

  public async createOpeningBalanceEntry(
    balances: { accountId: string; balance: number }[],
    entryDate: Date,
    tx?: TransactionClient
  ): Promise<any> {
    const prisma = tx || this.prisma;

    if (!tx) {
      return this.prisma.$transaction(async (trx) => {
        return this.createOpeningBalanceEntry(balances, entryDate, trx);
      });
    }

    const results = [];
    for (const item of balances) {
      const result = await this.setOpeningBalance(
        {
          accountId: item.accountId,
          displayAmount: item.balance,
          asOfDate: entryDate,
        },
        tx
      );
      results.push(result);
    }

    return results;
  }

  private async getOrCreateOpeningBalancesAccount(prisma: TransactionClient) {
    let equityAccount = await prisma.account.findFirst({
      where: { name: "Opening Balances", type: AccountType.System },
    });

    if (!equityAccount) {
      equityAccount = await prisma.account.findFirst({
        where: { name: "Opening Balance Equity", type: AccountType.System },
      });
    }

    if (!equityAccount) {
      equityAccount = await prisma.account.create({
        data: {
          name: "Opening Balances",
          type: AccountType.System,
          subtype: AccountSubtype.Asset,
          currency: "USD",
        },
      });
    } else if (equityAccount.name !== "Opening Balances") {
      equityAccount = await prisma.account.update({
        where: { id: equityAccount.id },
        data: { name: "Opening Balances" },
      });
    }

    return equityAccount;
  }

  private async findOpeningBalanceEntryForAccount(
    accountId: string,
    prisma: TransactionClient
  ) {
    const entries = await prisma.journalEntry.findMany({
      where: {
        OR: [
          { entryType: "opening-balance" },
          { description: "Opening Balance" },
        ],
        lines: {
          some: { accountId },
        },
      },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });

    if (entries.length === 0) {
      return null;
    }

    const [primary, ...extras] = entries;
    if (extras.length > 0) {
      await prisma.journalLine.deleteMany({
        where: { entryId: { in: extras.map((entry) => entry.id) } },
      });
      await prisma.journalEntry.deleteMany({
        where: { id: { in: extras.map((entry) => entry.id) } },
      });
    }

    if (primary.entryType !== "opening-balance") {
      return prisma.journalEntry.update({
        where: { id: primary.id },
        data: { entryType: "opening-balance" },
        include: { lines: true },
      });
    }

    return primary;
  }

  public async getOpeningBalanceForAccount(
    accountId: string,
    tx?: TransactionClient
  ): Promise<
    | {
        entryId: string;
        accountId: string;
        displayAmount: number;
        date: string;
      }
    | null
  > {
    const prisma = tx || this.prisma;
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new Error(`Account with id ${accountId} not found.`);
    }

    const entry = await this.findOpeningBalanceEntryForAccount(accountId, prisma);
    if (!entry) {
      return null;
    }

    const accountLine = entry.lines.find((line: any) => line.accountId === accountId);
    if (!accountLine) {
      return null;
    }

    const displayAmount =
      account.subtype === AccountSubtype.Liability
        ? Math.round(-accountLine.amount * 100) / 100
        : Math.round(accountLine.amount * 100) / 100;

    return {
      entryId: entry.id,
      accountId,
      displayAmount,
      date: entry.date,
    };
  }

  public async setOpeningBalance(
    data: { accountId: string; displayAmount: number; asOfDate: Date | string },
    tx?: TransactionClient
  ): Promise<any> {
    const prisma = tx || this.prisma;

    if (!tx) {
      return this.prisma.$transaction(async (trx) => {
        return this.setOpeningBalance(data, trx);
      });
    }

    const account = await prisma.account.findUnique({
      where: { id: data.accountId },
    });

    if (!account) {
      throw new Error(`Account with id ${data.accountId} not found.`);
    }

    if (account.type !== AccountType.User) {
      throw new Error("Opening balances can only be set for user accounts.");
    }

    const dateStr = parseToStandardDate(data.asOfDate);
    if (!dateStr) {
      throw new Error("Invalid opening balance date.");
    }

    const roundedDisplay = Math.round(data.displayAmount * 100) / 100;
    const rawAmount =
      account.subtype === AccountSubtype.Liability
        ? -roundedDisplay
        : roundedDisplay;

    const openingEntry = await this.findOpeningBalanceEntryForAccount(
      data.accountId,
      prisma
    );

    if (rawAmount === 0) {
      if (openingEntry) {
        await prisma.journalLine.deleteMany({
          where: { entryId: openingEntry.id },
        });
        await prisma.journalEntry.delete({ where: { id: openingEntry.id } });
      }
      return null;
    }

    const equityAccount = await this.getOrCreateOpeningBalancesAccount(prisma);

    if (!openingEntry) {
      return prisma.journalEntry.create({
        data: {
          date: dateStr,
          description: "Opening Balance",
          entryType: "opening-balance",
          displayOrder: Date.now(),
          lines: {
            create: [
              {
                accountId: account.id,
                amount: rawAmount,
                currency: account.currency,
                description: "Opening Balance",
              },
              {
                accountId: equityAccount.id,
                amount: Math.round(-rawAmount * 100) / 100,
                currency: equityAccount.currency || account.currency,
                description: "Opening Balance",
              },
            ],
          },
        },
        include: { lines: true },
      });
    }

    const accountLine = openingEntry.lines.find(
      (line) => line.accountId === account.id
    );
    const equityLine = openingEntry.lines.find(
      (line) => line.accountId !== account.id
    );

    if (!accountLine || !equityLine) {
      throw new Error("Opening balance entry is missing required lines.");
    }

    await prisma.journalEntry.update({
      where: { id: openingEntry.id },
      data: {
        date: dateStr,
        description: "Opening Balance",
        entryType: "opening-balance",
      },
    });

    await prisma.journalLine.update({
      where: { id: accountLine.id },
      data: {
        amount: rawAmount,
        currency: account.currency,
        description: "Opening Balance",
      },
    });

    await prisma.journalLine.update({
      where: { id: equityLine.id },
      data: {
        amount: Math.round(-rawAmount * 100) / 100,
        currency: equityAccount.currency || account.currency,
        description: "Opening Balance",
      },
    });

    return prisma.journalEntry.findUnique({
      where: { id: openingEntry.id },
      include: { lines: true },
    });
  }

  private async applyOpeningBalanceDelta(
    openingEntryId: string,
    accountId: string,
    delta: number,
    prisma: TransactionClient
  ) {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: openingEntryId },
      include: { lines: true },
    });

    if (!entry) {
      return;
    }

    const accountLine = entry.lines.find((line: any) => line.accountId === accountId);
    const equityLine = entry.lines.find((line: any) => line.accountId !== accountId);

    if (!accountLine || !equityLine) {
      throw new Error("Opening balance entry is missing required lines.");
    }

    const nextAccountAmount = Math.round((accountLine.amount + delta) * 100) / 100;
    const nextEquityAmount = Math.round((equityLine.amount - delta) * 100) / 100;

    if (nextAccountAmount === 0) {
      await prisma.journalLine.deleteMany({ where: { entryId: entry.id } });
      await prisma.journalEntry.delete({ where: { id: entry.id } });
      return;
    }

    await prisma.journalLine.update({
      where: { id: accountLine.id },
      data: { amount: nextAccountAmount },
    });

    await prisma.journalLine.update({
      where: { id: equityLine.id },
      data: { amount: nextEquityAmount },
    });
  }

  private async adjustOpeningBalanceForEntryChange(
    data: {
      entryDate: string;
      lines: { accountId: string; amount: number }[];
      sign: 1 | -1;
    },
    prisma: TransactionClient
  ) {
    if (!data.lines.length) {
      return;
    }

    const uniqueAccountIds = Array.from(
      new Set(data.lines.map((line) => line.accountId))
    );
    const accounts = await prisma.account.findMany({
      where: { id: { in: uniqueAccountIds } },
    });
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    for (const line of data.lines) {
      const account = accountMap.get(line.accountId);
      if (!account || account.type !== AccountType.User) {
        continue;
      }

      const openingEntry = await this.findOpeningBalanceEntryForAccount(
        line.accountId,
        prisma
      );

      if (!openingEntry) {
        continue;
      }

      const openingDate = parseToStandardDate(openingEntry.date);
      if (!openingDate) {
        continue;
      }

      if (data.entryDate >= openingDate) {
        continue;
      }

      const delta = Math.round(-data.sign * line.amount * 100) / 100;
      if (delta === 0) {
        continue;
      }

      await this.applyOpeningBalanceDelta(
        openingEntry.id,
        line.accountId,
        delta,
        prisma
      );
    }
  }

  // --- Dashboard Data Methods ---

  /**
   * Get net worth: sum of all user accounts (assets/liabilities) grouped by currency.
   * Optionally filter by currency.
   */
  public async getNetWorth(tx?: TransactionClient, currency?: string) {
    const prisma = tx || this.prisma;
    const where: any = {};
    if (currency) where.currency = currency;
    const accounts = await prisma.account.findMany({
      where,
      include: { lines: true },
    });

    // Group assets and liabilities by currency
    const assets: Record<string, number> = {};
    const liabilities: Record<string, number> = {};

    for (const acc of accounts) {
      if (acc.type === AccountType.User) {
        let balance = acc.lines.reduce((sum, line) => sum + line.amount, 0);
        balance = Math.round(balance * 100) / 100;
        const subtype = (acc as any).subtype;
        const cur = acc.currency;
        if (subtype === "asset") {
          assets[cur] = (assets[cur] || 0) + balance;
        } else if (subtype === "liability") {
          liabilities[cur] = (liabilities[cur] || 0) + balance;
        }
      }
    }
    // Round
    for (const cur in assets) assets[cur] = Math.round(assets[cur] * 100) / 100;
    for (const cur in liabilities) liabilities[cur] = Math.round(liabilities[cur] * 100) / 100;

    // Compute net worth per currency
    const netWorth: Record<string, number> = {};
    const allCurrencies = new Set([...Object.keys(assets), ...Object.keys(liabilities)]);
    for (const cur of allCurrencies) {
      netWorth[cur] = Math.round(((assets[cur] || 0) - (liabilities[cur] || 0)) * 100) / 100;
    }

    if (currency) {
      return {
        netWorth: netWorth[currency] || 0,
        assets: assets[currency] || 0,
        liabilities: liabilities[currency] || 0,
      };
    } else {
      return {
        netWorth,
        assets,
        liabilities,
      };
    }
  }

  /**
   * Get total income and expenses for the current month (category accounts only), grouped by currency.
   * Optionally filter by currency.
   * Uses journal line currency instead of account currency for accurate multi-currency tracking.
   */
  public async getIncomeExpenseThisMonth(tx?: TransactionClient, currency?: string) {
    const prisma = tx || this.prisma;
    const now = new Date();
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const endDateObj = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const endOfMonth = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}`;

    // Get all journal entries for this month
    const entries = await prisma.journalEntry.findMany({
      where: {
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      include: {
        lines: {
          include: { account: true },
        },
      },
    });

    // Group by currency using journal line currency
    const income: Record<string, number> = {};
    const expenses: Record<string, number> = {};
    for (const entry of entries) {
      for (const line of entry.lines) {
        if (line.account.type === AccountType.Category) {
          // Use the journal line's currency, not the account's currency
          const cur = line.currency;
          if (line.account.subtype === AccountSubtype.Asset) {
            // Income category (asset subtype)
            income[cur] = (income[cur] || 0) + line.amount;
          } else {
            // Expense category (liability subtype)
            expenses[cur] = (expenses[cur] || 0) + line.amount;
          }
        }
      }
    }
    // Round and abs
    for (const cur in income) income[cur] = Math.round(Math.abs(income[cur]) * 100) / 100;
    for (const cur in expenses) expenses[cur] = Math.round(Math.abs(expenses[cur]) * 100) / 100;

    if (currency) {
      // DEBUG: Log income and expenses before returning
console.log("getIncomeExpenseThisMonth returning:", { income, expenses });

      return {
        
        income: income[currency] || 0,
        expenses: expenses[currency] || 0,
      };
    } else {
      // DEBUG: Log income and expenses before returning
console.log("getIncomeExpenseThisMonth returning:", { income, expenses });

      return {
        income,
        expenses,
      };
    }
  }

  /**
   * Get the most recent N transactions (journal entries), including their lines and accounts.
   * Optionally filter by currency, or group by currency.
   */
  public async getRecentTransactions(
    limit: number = 10,
    tx?: TransactionClient,
    currency?: string
  ) {
    const prisma = tx || this.prisma;
    // If currency is provided, filter lines by currency
    const entries = await prisma.journalEntry.findMany({
      orderBy: [
        { date: "desc" },
        { displayOrder: "desc" }
      ],
      take: limit,
      include: {
        lines: {
          include: { account: true },
        },
      },
    });
    if (currency) {
      // Only include lines with the given currency
      return entries.map(entry => ({
        ...entry,
        lines: entry.lines.filter(line => line.account.currency === currency),
      }));
    } else {
      // Group transactions by currency (all lines for each currency)
      const grouped: Record<string, any[]> = {};
      for (const entry of entries) {
        for (const line of entry.lines) {
          const cur = line.account.currency;
          if (!grouped[cur]) grouped[cur] = [];
          grouped[cur].push({
            ...entry,
            lines: [line],
          });
        }
      }
      return grouped;
    }
  }

  /**
   * Delete a journal entry (transaction) and all its associated lines.
   * This maintains data integrity by deleting both the entry and lines in a transaction.
   */
  public async deleteJournalEntry(
    entryId: string,
    tx?: TransactionClient
  ): Promise<any> {
    const prisma = tx || this.prisma;

    // If no transaction provided, create one
    if (!tx) {
      return this.prisma.$transaction(async (trx) => {
        return this.deleteJournalEntry(entryId, trx);
      });
    }

    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true },
    });

    if (!entry) {
      throw new Error("Journal entry not found");
    }

    const isOpeningBalanceEntry =
      entry.entryType === "opening-balance" || entry.description === "Opening Balance";

    if (!isOpeningBalanceEntry) {
      await this.adjustOpeningBalanceForEntryChange(
        {
          entryDate: parseToStandardDate(entry.date) || entry.date,
          lines: entry.lines.map((line: any) => ({
            accountId: line.accountId,
            amount: line.amount,
          })),
          sign: -1,
        },
        prisma
      );
    }

    await prisma.journalLine.deleteMany({ where: { entryId } });
    const deletedEntry = await prisma.journalEntry.delete({ where: { id: entryId } });

    return deletedEntry;
  }

  /**
   * Get a specific journal entry by ID with its lines and accounts.
   */
  public async getJournalEntry(entryId: string, tx?: TransactionClient) {
    const prisma = tx || this.prisma;
    return prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: {
        lines: {
          include: { account: true },
        },
      },
    });
  }

  /**
   * Create a set of default accounts (user, system, category) if they do not exist.
   */
  public async ensureDefaultAccounts(tx?: TransactionClient) {
    const prisma = tx || this.prisma;
    
    // First, ensure account groups exist
    const defaultGroups = [
      // Income groups
      { name: "[Income] Active Income", accountType: AccountType.Category, displayOrder: 0 },
      { name: "[Income] Passive Income", accountType: AccountType.Category, displayOrder: 1 },
      { name: "[Income] Other Income", accountType: AccountType.Category, displayOrder: 2 },
      // Expense groups
      { name: "[Expense] Essentials", accountType: AccountType.Category, displayOrder: 3 },
      { name: "[Expense] Lifestyle", accountType: AccountType.Category, displayOrder: 8 },
      { name: "[Expense] Education", accountType: AccountType.Category, displayOrder: 10 },
      { name: "[Expense] Financial & Business", accountType: AccountType.Category, displayOrder: 11 },
      { name: "[Expense] Other Expense", accountType: AccountType.Category, displayOrder: 12 },
    ];
    
    const groupMap: Record<string, string> = {};
    for (const group of defaultGroups) {
      let existingGroup = await prisma.accountGroup.findFirst({
        where: { name: group.name, accountType: group.accountType },
      });
      if (!existingGroup) {
        existingGroup = await prisma.accountGroup.create({ data: group });
      }
      groupMap[group.name] = existingGroup.id;
    }
    
    const defaultAccounts = [
      // User accounts
      {
        name: "Cash",
        type: AccountType.User,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
      {
        name: "Bank",
        type: AccountType.User,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
      {
        name: "Credit Card",
        type: AccountType.User,
        subtype: AccountSubtype.Liability,
        currency: "USD",
      },
      // System accounts
      {
        name: "Opening Balances",
        type: AccountType.System,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
      // Category accounts - Income
      {
        name: "Salary",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
        groupId: groupMap["[Income] Active Income"],
      },
      {
        name: "Interest Income",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
        groupId: groupMap["[Income] Passive Income"],
      },
      {
        name: "Uncategorized Income",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
        groupId: groupMap["[Income] Other Income"],
      },
      // Investment Income Categories
      {
        name: "Dividend Income",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
        groupId: groupMap["[Income] Passive Income"],
      },
      {
        name: "Realized Gains/Losses",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
        groupId: groupMap["[Income] Passive Income"],
      },
      // Category accounts - Expenses (Essentials)
      {
        name: "Groceries",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Essentials"],
      },
      {
        name: "Rent",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Essentials"],
      },
      {
        name: "Utilities",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Essentials"],
      },
      {
        name: "Household Supplies",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Essentials"],
      },
      {
        name: "Medical & Dental",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Essentials"],
      },
      {
        name: "Telecom",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Essentials"],
      },
      {
        name: "Transportation",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Essentials"],
      },
      // Category accounts - Expenses (Lifestyle)
      {
        name: "Dining Out",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Lifestyle"],
      },
      {
        name: "Entertainment",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Lifestyle"],
      },
      {
        name: "Sports",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Lifestyle"],
      },
      {
        name: "Travel",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Lifestyle"],
      },
      // Category accounts - Expenses (Education)
      {
        name: "Books",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Education"],
      },
      {
        name: "Software",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Education"],
      },
      // Category accounts - Expenses (Financial & Business)
      {
        name: "Insurance",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Financial & Business"],
      },
      {
        name: "Investment Expenses",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Financial & Business"],
      },
      // Category accounts - Expenses (Other)
      {
        name: "Uncategorized Expense",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
        groupId: groupMap["[Expense] Other Expense"],
      },
    ];
    
    for (const acc of defaultAccounts) {
      const exists = await prisma.account.findFirst({
        where: { name: acc.name, type: acc.type },
      });
      if (!exists) {
        await prisma.account.create({ data: acc });
      }
    }
  }

  // Checkpoint functionality
  /**
   * Create a checkpoint for an account.
   * This creates a special journal entry that sets the account balance to the specified value.
   * All transactions before this checkpoint date will adjust the checkpoint transaction instead of the account directly.
   */
  public async createCheckpoint(
    data: {
      accountId: string;
      date: string | Date;
      balance: number;
      description?: string;
    },
    tx?: TransactionClient
  ): Promise<any> {
    // If no transaction provided, create one
    if (!tx) {
      return this.prisma.$transaction(
        async (trx) => {
          return this.createCheckpoint(data, trx);
        },
        { timeout: 20000 }
      );
    }

    // 1. Get or create the 'Checkpoint Adjustment' system account
    let checkpointAccount = await tx.account.findFirst({
      where: { name: "Checkpoint Adjustment" },
    });

    if (!checkpointAccount) {
      checkpointAccount = await tx.account.create({
        data: {
          name: "Checkpoint Adjustment",
          type: AccountType.System,
          subtype: AccountSubtype.Asset,
        },
      });
    }

    // 2. Create the checkpoint record
    const checkpoint = await tx.checkpoint.create({
      data: {
        accountId: data.accountId,
        date: typeof data.date === "string" ? data.date : data.date.toISOString().slice(0, 10),
        balance: data.balance,
        description: data.description,
      },
    });

    // 3. Create the journal entry for the checkpoint
    const journalEntry = await tx.journalEntry.create({
      data: {
        date: typeof data.date === "string" ? data.date : data.date.toISOString().slice(0, 10),
        description: data.description || `Checkpoint for ${checkpoint.id}`,
        displayOrder: Date.now(),
      },
    });

    // 4. Create journal lines to set the balance
    const account = await tx.account.findUnique({
      where: { id: data.accountId },
    });

    if (!account) {
      throw new Error("Account not found");
    }

    // Calculate the current balance BEFORE the checkpoint date (excluding checkpoint entries)
    const linesBeforeCheckpoint = await tx.journalLine.findMany({
      where: {
        accountId: data.accountId,
        entry: {
          date: { lte: typeof data.date === "string" ? data.date : data.date.toISOString().slice(0, 10) },
        },
      },
      include: { entry: true },
    });

    let currentBalance = linesBeforeCheckpoint.reduce(
      (sum: number, line: any) => sum + line.amount,
      0
    );
    currentBalance = Math.round(currentBalance * 100) / 100;
    let adjustmentAmount =
      Math.round((data.balance - currentBalance) * 100) / 100;

    const linesData = [];

    // Always create journal lines for the checkpoint, even if adjustment is 0
    // This ensures the checkpoint entry exists and can be properly identified
    linesData.push({
      entryId: journalEntry.id,
      accountId: data.accountId,
      amount: adjustmentAmount,
      currency: account?.currency || "USD", // Add currency from the account
      description: data.description || "Checkpoint adjustment",
    });

    // Add the balancing entry to the checkpoint account
    linesData.push({
      entryId: journalEntry.id,
      accountId: checkpointAccount.id,
      amount: -adjustmentAmount,
      currency: checkpointAccount.currency || "USD", // Add currency for checkpoint account
      description: data.description || "Checkpoint adjustment",
    });

    // Create all lines
    console.log("Creating journal lines:", linesData);
    await tx.journalLine.createMany({
      data: linesData,
    });

    return {
      checkpoint,
      journalEntry,
      adjustmentAmount,
    };
  }

  /**
   * Get all checkpoints for an account.
   */
  public async getCheckpointsForAccount(
    accountId: string,
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    return prisma.checkpoint.findMany({
      where: { accountId },
      orderBy: { date: "desc" },
      include: { account: true },
    });
  }

  /**
   * Get the most recent checkpoint for an account.
   */
  public async getLatestCheckpointForAccount(
    accountId: string,
    tx?: TransactionClient
  ) {
    const prisma = tx || this.prisma;
    return prisma.checkpoint.findFirst({
      where: { accountId },
      orderBy: { date: "desc" },
      include: { account: true },
    });
  }

  /**
   * Delete a checkpoint and its associated journal entry.
   */
  public async deleteCheckpoint(
    checkpointId: string,
    tx?: TransactionClient
  ): Promise<any> {
    // If no transaction provided, create one
    if (!tx) {
      return this.prisma.$transaction(async (trx) => {
        return this.deleteCheckpoint(checkpointId, trx);
      });
    }

    // Find the checkpoint
    const checkpoint = await tx.checkpoint.findUnique({
      where: { id: checkpointId },
      include: { account: true },
    });

    if (!checkpoint) {
      throw new Error("Checkpoint not found");
    }

    // Find the associated journal entry
    // Look for journal entries that either contain the checkpoint ID in description
    // or are checkpoint entries for this account on the same date
    const journalEntry = await tx.journalEntry.findFirst({
      where: {
        OR: [
          { description: { contains: checkpoint.id } },
          {
            AND: [
              { date: checkpoint.date },
              {
                lines: {
                  some: {
                    accountId: checkpoint.accountId,
                  },
                },
              },
            ],
          },
        ],
      },
    });

    // Delete the journal lines and entry if found
    if (journalEntry) {
      await tx.journalLine.deleteMany({
        where: { entryId: journalEntry.id },
      });
      await tx.journalEntry.delete({
        where: { id: journalEntry.id },
      });
    }

    // Delete the checkpoint
    const deletedCheckpoint = await tx.checkpoint.delete({
      where: { id: checkpointId },
    });

    return deletedCheckpoint;
  }

  /**
   * Get account balance at a specific date, considering checkpoints.
   * This method calculates the balance by:
   * 1. Finding the most recent checkpoint before or on the given date
   * 2. Adding all transactions after the checkpoint date
   */
  public async getAccountBalanceAtDate(
    accountId: string,
    date: string, // expects YYYY-MM-DD string
    tx?: TransactionClient
  ): Promise<number> {
    const prisma = tx || this.prisma;

    // Find the most recent checkpoint before or on the given date
    const checkpoint = await prisma.checkpoint.findFirst({
      where: {
        accountId,
        date: { lte: date },
      },
      orderBy: { date: "desc" },
    });

    let balance = 0;

    if (checkpoint) {
      // Start with the checkpoint balance

      // Add all transactions after the checkpoint date up to the target date
      // BUT exclude checkpoint entries themselves
      const lines = await prisma.journalLine.findMany({
        where: {
          accountId,
          entry: {
            date: {
              gt: checkpoint.date,
              lte: date,
            },
          },
        },
        include: { entry: true },
      });

      // Debug: print the dates of the lines being considered
      console.log("[getAccountBalanceAtDate] lines after checkpoint:", lines.map(l => l.entry?.date));

      balance = checkpoint.balance + lines.reduce((sum: number, line: any) => sum + line.amount, 0);
    } else {
      // No checkpoint, calculate balance from all transactions up to the date
      // BUT exclude checkpoint entries
      const lines = await prisma.journalLine.findMany({
        where: {
          accountId,
        },
        include: { entry: true },
      });

      // Debug: print the raw lines array to check if l.entry is present
      console.log("[getAccountBalanceAtDate] raw lines:", lines);

      // No date filter: sum all lines for the account
      balance = lines.reduce((sum: number, line: any) => sum + line.amount, 0);

      // Debug: print the total balance
      console.log("[getAccountBalanceAtDate] total balance (no date filter):", balance);
    }

    return balance;
  }

  /**
   * Get the effective balance for an account, considering checkpoints.
   * This is the main method to use for getting current account balances.
   */
  public async getAccountBalance(
    accountId: string,
    tx?: TransactionClient
  ): Promise<number> {
    // Use today's date as YYYY-MM-DD string
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return this.getAccountBalanceAtDate(accountId, todayStr, tx);
  }

  /**
   * Get category account balances grouped by currency.
   * Returns a map of currency code to balance amount.
   * This allows category accounts to show balances in multiple currencies.
   */
  public async getCategoryBalancesByCurrency(
    categoryId: string,
    tx?: TransactionClient
  ): Promise<Record<string, number>> {
    const prisma = tx || this.prisma;
    
    // Get all journal lines for this category account
    const lines = await prisma.journalLine.findMany({
      where: { accountId: categoryId },
      select: { amount: true, currency: true }
    });
    
    // Group by currency and sum amounts
    const balances: Record<string, number> = {};
    for (const line of lines) {
      const currency = line.currency;
      balances[currency] = (balances[currency] || 0) + line.amount;
    }
    
    // Round all balances to 2 decimal places
    for (const currency in balances) {
      balances[currency] = Math.round(balances[currency] * 100) / 100;
    }
    
    return balances;
  }

  /**
   * Reconcile a checkpoint: delete the old checkpoint and its journal entry, then create a new one at the same date with the original balance.
   */
  public async reconcileCheckpoint(
    checkpointId: string,
    tx?: TransactionClient
  ): Promise<any> {
    // If no transaction provided, create one
    if (!tx) {
      return this.prisma.$transaction(
        async (trx) => {
          return this.reconcileCheckpoint(checkpointId, trx);
        },
        { timeout: 20000 }
      );
    }

    console.log("Starting reconcileCheckpoint for", checkpointId);
    const checkpoint = await tx.checkpoint.findUnique({
      where: { id: checkpointId },
    });
    if (!checkpoint) throw new Error("Checkpoint not found");
    console.log("Found checkpoint:", checkpoint);

    // --- Multi-currency reconciliation validation ---
    // Find all journal lines for this account up to the checkpoint date
    const lines = await tx.journalLine.findMany({
      where: {
        accountId: checkpoint.accountId,
        entry: {
          date: { lte: checkpoint.date },
        },
      },
      include: {
        entry: {
          include: { lines: true },
        },
      },
    });

    // For each currency-transfer transaction, validate value equivalence
    const tolerance = 0.01;
    for (const line of lines) {
      const entry = (line as any).entry;
      if (
        entry &&
        typeof entry.type === "string" &&
        entry.type === "currency_transfer" &&
        Array.isArray(entry.lines) &&
        entry.lines.length === 2
      ) {
        const [lineA, lineB] = entry.lines;
        // Identify which is this account
        const thisLine = lineA.accountId === checkpoint.accountId ? lineA : lineB;
        const otherLine = lineA.accountId === checkpoint.accountId ? lineB : lineA;
        // Use exchangeRate if present, else calculate
        const exchangeRate =
          typeof (thisLine as any)["exchangeRate"] === "number"
            ? (thisLine as any)["exchangeRate"]
            : typeof (otherLine as any)["exchangeRate"] === "number"
            ? (otherLine as any)["exchangeRate"]
            : Math.abs(otherLine.amount / thisLine.amount);
        // Validate equivalence
        if (
          Math.abs(Math.abs(otherLine.amount) - Math.abs(thisLine.amount) * exchangeRate) > tolerance
        ) {
          throw new Error(
            `Currency transfer inconsistency detected in entry ${entry.id}: ` +
              `amounts ${thisLine.amount} (${thisLine.accountId}) and ${otherLine.amount} (${otherLine.accountId}) ` +
              `with exchange rate ${exchangeRate} are not equivalent within tolerance ${tolerance}`
          );
        }
      }
    }
    // --- End multi-currency validation ---

    // Store the original balance before deleting
    const originalBalance = checkpoint.balance;
    const originalDescription = checkpoint.description;

    await this.deleteCheckpoint(checkpointId, tx);
    console.log("Deleted old checkpoint");

    try {
      const result = await this.createCheckpoint(
        {
          accountId: checkpoint.accountId,
          date: checkpoint.date,
          balance: originalBalance, // Use the original balance, not recalculated
          description: originalDescription || "Reconciled again",
        },
        tx
      );
      console.log(
        "Created new checkpoint with original balance:",
        originalBalance
      );
      return result;
    } catch (err) {
      console.error("Error creating new checkpoint:", err);
      throw err;
    }
  }
  /**
   * Update a journal entry (transaction) by lineId.
   * Updates the entry's date/description and both lines' amounts/descriptions.
   * @param data { lineId, fromAccountId, toAccountId, amount, date, description, postingDate }
   */
  public async updateJournalEntryLine(
    data: {
      lineId: string;
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      date: string;
      postingDate?: string;
      description: string;
      transactionType?: "income" | "expense" | "transfer";
      source?: string;
    },
    tx?: TransactionClient
  ): Promise<any> {
    const prisma = tx || this.prisma;
    // Find the journal line and its entry
    const line = await prisma.journalLine.findUnique({
      where: { id: data.lineId },
      include: { entry: { include: { lines: true } } },
    });
    if (!line) throw new Error("Journal line not found");
    const entry = line.entry;
    if (!entry) throw new Error("Journal entry not found");

    // Find both lines in the entry
    const lines = entry.lines;
    if (lines.length !== 2) throw new Error("Expected double-entry transaction");

    const originalEntryDate = parseToStandardDate(entry.date) || entry.date;
    const originalLines = lines.map((existingLine: any) => ({
      accountId: existingLine.accountId,
      amount: existingLine.amount,
    }));
    const isOpeningBalanceEntry =
      entry.entryType === "opening-balance" || entry.description === "Opening Balance";

    // Determine which is from and which is to
    let fromLine = lines.find((l: any) => l.accountId === data.fromAccountId);
    let toLine = lines.find((l: any) => l.accountId === data.toAccountId);

    // If the toLine is not found (category/account changed), update the accountId of the "other" line
    if (!fromLine) {
      fromLine = lines.find((l: any) => l.accountId !== data.toAccountId);
    }
    if (!toLine) {
      const otherLine = lines.find((l: any) => l.accountId !== data.fromAccountId);
      if (!otherLine) throw new Error("Could not find the other side of transaction");
      await prisma.journalLine.update({
        where: { id: otherLine.id },
        data: { accountId: data.toAccountId },
      });
      const updatedEntry = await prisma.journalEntry.findUnique({
        where: { id: entry.id },
        include: { lines: true },
      });
      toLine = updatedEntry?.lines.find((l: any) => l.accountId === data.toAccountId);
      fromLine = updatedEntry?.lines.find((l: any) => l.accountId === data.fromAccountId);
    }

    if (!fromLine || !toLine) throw new Error("Could not find both sides of transaction");

    const roundedAmount = Math.round(data.amount * 100) / 100;

    // Fetch both accounts to get subtypes and currency
    const [fromAccount, toAccount] = await Promise.all([
      prisma.account.findUnique({ where: { id: data.fromAccountId } }),
      prisma.account.findUnique({ where: { id: data.toAccountId } }),
    ]);
    if (!fromAccount || !toAccount) throw new Error("Account not found");

    // Use new logic for journal lines
    const [fromLineData, toLineData] = DatabaseService.generateJournalLines({
      transactionType: data.transactionType || "transfer",
      userAccountId: data.fromAccountId,
      userAccountSubtype: fromAccount.subtype as AccountSubtype,
      counterpartyAccountId: data.toAccountId,
      counterpartyAccountSubtype: toAccount.subtype as AccountSubtype,
      amount: roundedAmount,
      currency: fromAccount.currency,
      description: data.description,
    });

    // Update the entry (date, description, postingDate)
    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: {
        date: data.date,
        description: data.description,
        postingDate: data.postingDate?.trim() || null, // Treat empty strings as null
      },
    });

    // Update both lines
    await prisma.journalLine.update({
      where: { id: fromLine.id },
      data: {
        amount: fromLineData.amount,
        description: data.description,
      },
    });
    await prisma.journalLine.update({
      where: { id: toLine.id },
      data: {
        amount: toLineData.amount,
        description: data.description,
      },
    });

    const updatedEntry = await prisma.journalEntry.findUnique({
      where: { id: entry.id },
      include: { lines: true },
    });

    if (!isOpeningBalanceEntry && updatedEntry) {
      const updatedEntryDate = parseToStandardDate(updatedEntry.date) || updatedEntry.date;
      await this.adjustOpeningBalanceForEntryChange(
        {
          entryDate: originalEntryDate,
          lines: originalLines,
          sign: -1,
        },
        prisma
      );
      await this.adjustOpeningBalanceForEntryChange(
        {
          entryDate: updatedEntryDate,
          lines: updatedEntry.lines.map((updatedLine: any) => ({
            accountId: updatedLine.accountId,
            amount: updatedLine.amount,
          })),
          sign: 1,
        },
        prisma
      );
    }

    if (data.source === "cleanup") {
      await autoCategorizationService.upsertExactRuleFromCleanupAction(
        {
          description: data.description,
          targetCategoryAccountId: data.toAccountId,
        },
        prisma
      );
    }

    return updatedEntry;
  }

  // Transaction reordering methods

  /**
   * Get all transactions for a specific date, ordered by displayOrder ascending.
   * Treats null displayOrder as createdAt timestamp.
   */
  private async getTransactionsForDate(
    date: string,
    tx?: TransactionClient
  ): Promise<any[]> {
    const prisma = tx || this.prisma;
    
    const transactions = await prisma.journalEntry.findMany({
      where: { date },
      orderBy: [
        { displayOrder: 'desc' },
        { createdAt: 'desc' }
      ],
    });
    
    return transactions;
  }

  /**
   * Swap display order values between two transactions.
   * Uses a transaction to ensure atomicity.
   */
  private async swapDisplayOrder(
    entryId1: string,
    entryId2: string,
    tx?: TransactionClient
  ): Promise<void> {
    const prisma = tx || this.prisma;
    
    // If no transaction provided, create one
    if (!tx) {
      return this.prisma.$transaction(async (trx) => {
        return this.swapDisplayOrder(entryId1, entryId2, trx);
      });
    }
    
    try {
      // Read both displayOrder values
      const [entry1, entry2] = await Promise.all([
        prisma.journalEntry.findUnique({ where: { id: entryId1 } }),
        prisma.journalEntry.findUnique({ where: { id: entryId2 } }),
      ]);
      
      if (!entry1 || !entry2) {
        throw new Error('Transaction not found');
      }
      
      // Handle null displayOrder by treating as createdAt timestamp
      const displayOrder1 = entry1.displayOrder ?? entry1.createdAt.getTime();
      const displayOrder2 = entry2.displayOrder ?? entry2.createdAt.getTime();
      
      // Swap the values
      await Promise.all([
        prisma.journalEntry.update({
          where: { id: entryId1 },
          data: { displayOrder: displayOrder2 },
        }),
        prisma.journalEntry.update({
          where: { id: entryId2 },
          data: { displayOrder: displayOrder1 },
        }),
      ]);
    } catch (error) {
      console.error('Error swapping display order:', error);
      throw error;
    }
  }

  /**
   * Move a transaction up in display order (swap with previous transaction of same date).
   */
  public async moveTransactionUp(
    entryId: string,
    tx?: TransactionClient
  ): Promise<{ success: boolean; error?: string }> {
    const prisma = tx || this.prisma;
    
    try {
      // Query the transaction
      const entry = await prisma.journalEntry.findUnique({
        where: { id: entryId },
      });
      
      if (!entry) {
        return { success: false, error: 'Transaction not found' };
      }
      
      // Get all transactions for the same date, ordered by displayOrder ascending
      const transactions = await this.getTransactionsForDate(entry.date, prisma);
      
      // Find the current transaction's position
      const currentIndex = transactions.findIndex(t => t.id === entryId);
      
      if (currentIndex === -1) {
        return { success: false, error: 'Transaction not found in date list' };
      }
      
      // Check if this is the first transaction
      if (currentIndex === 0) {
        return { success: false, error: 'Cannot move up: already first transaction' };
      }
      
      // Get the previous transaction
      const previousTransaction = transactions[currentIndex - 1];
      
      // Swap display orders
      await this.swapDisplayOrder(entryId, previousTransaction.id, prisma);
      
      return { success: true };
    } catch (error: any) {
      console.error('Error moving transaction up:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Move a transaction down in display order (swap with next transaction of same date).
   */
  public async moveTransactionDown(
    entryId: string,
    tx?: TransactionClient
  ): Promise<{ success: boolean; error?: string }> {
    const prisma = tx || this.prisma;
    
    try {
      // Query the transaction
      const entry = await prisma.journalEntry.findUnique({
        where: { id: entryId },
      });
      
      if (!entry) {
        return { success: false, error: 'Transaction not found' };
      }
      
      // Get all transactions for the same date, ordered by displayOrder ascending
      const transactions = await this.getTransactionsForDate(entry.date, prisma);
      
      // Find the current transaction's position
      const currentIndex = transactions.findIndex(t => t.id === entryId);
      
      if (currentIndex === -1) {
        return { success: false, error: 'Transaction not found in date list' };
      }
      
      // Check if this is the last transaction
      if (currentIndex === transactions.length - 1) {
        return { success: false, error: 'Cannot move down: already last transaction' };
      }
      
      // Get the next transaction
      const nextTransaction = transactions[currentIndex + 1];
      
      // Swap display orders
      await this.swapDisplayOrder(entryId, nextTransaction.id, prisma);
      
      return { success: true };
    } catch (error: any) {
      console.error('Error moving transaction down:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }
}

export const databaseService = DatabaseService.getInstance();
