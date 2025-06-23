import { PrismaClient } from "@prisma/client";
import path from "path";
import { app } from "electron";

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
    type: string;
    currency?: string;
  }) {
    return this.prisma.account.create({
      data: {
        name: data.name,
        type: data.type,
        currency: data.currency || "USD",
      },
    });
  }

  public async getAccounts() {
    try {
      console.log("Fetching accounts from database...");
      const accounts = await this.prisma.account.findMany();
      console.log("Accounts fetched:", accounts);
      return accounts;
    } catch (error) {
      console.error("Error fetching accounts:", error);
      throw error;
    }
  }

  public async getAccount(id: string) {
    return this.prisma.account.findUnique({
      where: { id },
      include: { lines: { include: { entry: true } } },
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
    return this.prisma.journalLine.findMany({
      where: { accountId },
      include: { entry: true, account: true },
      orderBy: { entry: { date: "desc" } },
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
}

export const databaseService = DatabaseService.getInstance();
