import { PrismaClient } from "@prisma/client";
import path from "path";
import {
  AccountType,
  toAccountType,
  AccountSubtype,
} from "../shared/accountTypes";

class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;

  private constructor() {
    const isDev = process.env.NODE_ENV === "development";
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

    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: "file:./dev.db",
        },
      },
    });
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
  public async createAccount(data: {
    name: string;
    type: AccountType | string;
    currency?: string;
  }) {
    return this.prisma.account.create({
      data: {
        name: data.name,
        type: data.type as AccountType,
        currency: data.currency || "USD",
      },
    });
  }

  public async getAccounts(includeArchived: boolean = false) {
    try {
      console.log("Fetching accounts from database...");
      const accounts = await this.prisma.account.findMany({
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

  public async getAccount(id: string) {
    const acc = await this.prisma.account.findUnique({
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
  public async canDeleteAccount(accountId: string) {
    const account = await this.prisma.account.findUnique({
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
  public async archiveAccount(accountId: string) {
    return this.prisma.account.update({
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
  public async deleteAccount(accountId: string) {
    // Double-check that no transactions exist
    const canDelete = await this.canDeleteAccount(accountId);
    if (!canDelete.canDelete) {
      throw new Error("Cannot delete account with existing transactions");
    }

    return this.prisma.account.delete({
      where: { id: accountId },
    });
  }

  /**
   * Restore an archived account (un-archive).
   */
  public async restoreAccount(accountId: string) {
    return this.prisma.account.update({
      where: { id: accountId },
      data: {
        isArchived: false,
        archivedAt: null,
      },
    });
  }

  // Double-entry transaction operations
  /**
   * Create a double-entry journal entry (transaction).
   * @param data { date, amount, category, description, fromAccountId, toAccountId }
   * fromAccountId: The account to credit (e.g., cash/bank for expense, income for income)
   * toAccountId: The account to debit (e.g., expense for expense, cash/bank for income)
   */
  public async createJournalEntry(data: {
    date: string | Date;
    amount: number;
    category: string;
    description?: string;
    fromAccountId: string;
    toAccountId: string;
  }) {
    return this.prisma.journalEntry.create({
      data: {
        date: new Date(data.date),
        description: data.description,
        category: data.category,
        lines: {
          create: [
            {
              accountId: data.fromAccountId,
              amount: -Math.abs(data.amount), // Credit
              description: data.description,
            },
            {
              accountId: data.toAccountId,
              amount: Math.abs(data.amount), // Debit
              description: data.description,
            },
          ],
        },
      },
      include: { lines: true },
    });
  }

  /**
   * Get all journal entries (transactions) for an account.
   * Returns lines for the account, joined with their entry.
   */
  public async getJournalEntriesForAccount(accountId: string) {
    const lines = await this.prisma.journalLine.findMany({
      where: { accountId },
      include: { entry: true, account: true },
      orderBy: { entry: { date: "desc" } },
    });
    // Convert account.type to AccountType in each line
    return lines.map((line) => ({
      ...line,
      account: line.account
        ? { ...line.account, type: toAccountType(line.account.type) }
        : line.account,
    }));
  }

  public async createOpeningBalanceEntry(
    balances: { accountId: string; balance: number }[],
    entryDate: Date
  ) {
    const ASSET_TYPES = [AccountType.User];
    // Liabilities have a natural credit balance.
    // A positive balance means money you owe, which is a credit on your books.
    // So, the amount in the journal line will be negative.
    const LIABILITY_TYPES = [AccountType.System];

    return this.prisma.$transaction(async (tx) => {
      // 1. Get or create the 'Opening Balance Equity' account
      let equityAccount = await tx.account.findFirst({
        where: { name: "Opening Balance Equity" },
      });

      if (!equityAccount) {
        equityAccount = await tx.account.create({
          data: {
            name: "Opening Balance Equity",
            type: AccountType.System,
          },
        });
      }

      // 2. Create the Journal Entry
      const journalEntry = await tx.journalEntry.create({
        data: {
          date: entryDate,
          description: "Opening Balance",
          category: "SYSTEM",
        },
      });

      const accounts = await tx.account.findMany({
        where: { id: { in: balances.map((b) => b.accountId) } },
      });
      const accountMap = new Map(accounts.map((a) => [a.id, a]));

      // 3. Create Journal Lines for each account
      const linesData = [];
      let total = 0;

      for (const item of balances) {
        const account = accountMap.get(item.accountId);
        if (!account) {
          // Or handle this error more gracefully
          throw new Error(`Account with id ${item.accountId} not found.`);
        }

        let amount = 0;
        const accType = toAccountType(account.type);
        if (ASSET_TYPES.includes(accType)) {
          amount = item.balance; // Debits are positive
        } else if (LIABILITY_TYPES.includes(accType)) {
          amount = -item.balance; // Credits are negative
        }

        if (amount !== 0) {
          linesData.push({
            entryId: journalEntry.id,
            accountId: item.accountId,
            amount,
            description: "Opening Balance",
          });
          total += amount;
        }
      }

      // 4. Create the balancing line for the equity account
      if (total !== 0) {
        linesData.push({
          entryId: journalEntry.id,
          accountId: equityAccount.id,
          amount: -total, // The balancing amount
          description: "Opening Balance",
        });
      }

      // 5. Create all lines in one go
      if (linesData.length > 0) {
        await tx.journalLine.createMany({
          data: linesData,
        });
      }

      return journalEntry;
    });
  }

  // Category operations
  public async createCategory(data: { name: string; type: string }) {
    return this.prisma.category.create({
      data: {
        name: data.name,
        type: data.type,
      },
    });
  }

  public async getCategories() {
    try {
      console.log("Fetching categories from database...");
      const categories = await this.prisma.category.findMany();
      console.log("Categories fetched:", categories);
      return categories;
    } catch (error) {
      console.error("Error fetching categories:", error);
      throw error;
    }
  }

  // --- Dashboard Data Methods ---

  /**
   * Get net worth: sum of all user accounts (assets/liabilities) only.
   */
  public async getNetWorth() {
    const accounts = await this.prisma.account.findMany({
      include: { lines: true },
    });

    let assets = 0;
    let liabilities = 0;

    for (const acc of accounts) {
      if (acc.type === AccountType.User) {
        const balance = acc.lines.reduce((sum, line) => sum + line.amount, 0);
        const subtype = (acc as any).subtype;
        if (subtype === "asset") {
          assets += balance;
        } else if (subtype === "liability") {
          liabilities += balance;
        }
      }
    }
    return { netWorth: assets - liabilities, assets, liabilities };
  }

  /**
   * Get total income and expenses for the current month (category accounts only).
   */
  public async getIncomeExpenseThisMonth() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    // Get all journal entries for this month
    const entries = await this.prisma.journalEntry.findMany({
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

    let income = 0;
    let expenses = 0;
    for (const entry of entries) {
      for (const line of entry.lines) {
        if (line.account.type === AccountType.Category) {
          // You may want to further distinguish income vs. expense by account name or add a sub-type
          if (line.account.name.toLowerCase().includes("income")) {
            income += line.amount;
          } else {
            expenses += line.amount;
          }
        }
      }
    }
    return {
      income: Math.abs(income),
      expenses: Math.abs(expenses),
    };
  }

  /**
   * Get the most recent N transactions (journal entries), including their lines and accounts.
   */
  public async getRecentTransactions(limit: number = 10) {
    return this.prisma.journalEntry.findMany({
      orderBy: { date: "desc" },
      take: limit,
      include: {
        lines: {
          include: { account: true },
        },
      },
    });
  }

  /**
   * Delete a journal entry (transaction) and all its associated lines.
   * This maintains data integrity by deleting both the entry and lines in a transaction.
   */
  public async deleteJournalEntry(entryId: string) {
    return this.prisma.$transaction(async (tx) => {
      // First, delete all journal lines associated with this entry
      await tx.journalLine.deleteMany({
        where: { entryId },
      });

      // Then delete the journal entry itself
      const deletedEntry = await tx.journalEntry.delete({
        where: { id: entryId },
      });

      return deletedEntry;
    });
  }

  /**
   * Get a specific journal entry by ID with its lines and accounts.
   */
  public async getJournalEntry(entryId: string) {
    return this.prisma.journalEntry.findUnique({
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
  public async ensureDefaultAccounts() {
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
        name: "Opening Balance Equity",
        type: AccountType.System,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
      // Category accounts
      {
        name: "Salary",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
      {
        name: "Interest Income",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
      {
        name: "Groceries",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
      {
        name: "Rent",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
      {
        name: "Utilities",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
      {
        name: "Dining Out",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
      {
        name: "Entertainment",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
    ];
    for (const acc of defaultAccounts) {
      const exists = await this.prisma.account.findFirst({
        where: { name: acc.name, type: acc.type },
      });
      if (!exists) {
        await this.prisma.account.create({ data: acc });
      }
    }
  }
}

export const databaseService = DatabaseService.getInstance();
