import { PrismaClient, Prisma } from "@prisma/client";
import path from "path";
import {
  AccountType,
  toAccountType,
  AccountSubtype,
} from "../shared/accountTypes";

// Type for transaction client
type TransactionClient = Prisma.TransactionClient;

class DatabaseService {
  private static instance: DatabaseService;
  private prisma: PrismaClient;

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
      // Delete all checkpoints
      await tx.checkpoint.deleteMany({});
      // Delete all accounts
      await tx.account.deleteMany({});
      // Re-create default accounts
      await this.ensureDefaultAccounts(tx);
    });
    console.log("[DEV] All data reset to initial state.");
  }

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
      log: ["query", "info", "warn", "error"],
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
   * Optionally filter by currency, or aggregate by currency if no filter is provided.
   * Returns: Array<{ ...account, balance: number }> or { [currency: string]: number }
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
          const balance = await this.getAccountBalance(acc.id, prisma);
          console.log("[getAccountsWithBalances] Account:", acc.id, acc.name, "Balance:", balance);
          return {
            ...acc,
            type: toAccountType(acc.type),
            balance,
          };
        })
      );
      if (currency) {
        // If filtering, just return the filtered list
        return results;
      } else {
        // Aggregate by currency
        const grouped: Record<string, number> = {};
        for (const acc of results) {
          if (!grouped[acc.currency]) grouped[acc.currency] = 0;
          grouped[acc.currency] += acc.balance;
        }
        // Round to 2 decimals
        for (const cur in grouped) {
          grouped[cur] = Math.round(grouped[cur] * 100) / 100;
        }
        return grouped;
      }
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
        userLine.amount = Math.abs(amount); // Debit asset (increase)
        counterpartyLine.amount = -Math.abs(amount); // Credit counterparty
      } else {
        userLine.amount = -Math.abs(amount); // Credit liability (decrease)
        counterpartyLine.amount = Math.abs(amount); // Debit counterparty
      }
    }
    // Expense
    else if (transactionType === "expense") {
      if (userAccountSubtype === AccountSubtype.Asset) {
        userLine.amount = -Math.abs(amount); // Credit asset (decrease)
        counterpartyLine.amount = Math.abs(amount); // Debit counterparty
      } else {
        userLine.amount = Math.abs(amount); // Debit liability (increase)
        counterpartyLine.amount = -Math.abs(amount); // Credit counterparty
      }
    }
    // Transfer
    else if (transactionType === "transfer") {
      // Asset to Asset, Asset to Liability, Liability to Asset, Liability to Liability
      // Outflow from user account, inflow to counterparty
      if (userAccountSubtype === AccountSubtype.Asset) {
        userLine.amount = -Math.abs(amount); // Credit asset (decrease)
      } else {
        userLine.amount = Math.abs(amount); // Debit liability (increase)
      }
      if (counterpartyAccountSubtype === AccountSubtype.Asset) {
        counterpartyLine.amount = Math.abs(amount); // Debit asset (increase)
      } else {
        counterpartyLine.amount = -Math.abs(amount); // Credit liability (decrease)
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
    },
    tx?: TransactionClient
  ): Promise<{ skipped: boolean; reason?: string; entry?: any; existing?: any }> {
    const prisma = tx || this.prisma;

    // LOG: Start createJournalEntry
    console.log("[createJournalEntry] called with data:", data);

    // Accept only "YYYY-MM-DD" string for date
    let dateStr = typeof data.date === "string" ? data.date : "";
    if (data.date instanceof Date) {
      // Convert Date object to YYYY-MM-DD
      dateStr = data.date.toISOString().slice(0, 10);
    }
    // Validate date string
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      console.warn("[createJournalEntry] Skipped: Invalid date format, must be YYYY-MM-DD", { data });
      return { skipped: true, reason: "Invalid date format" };
    }

    // Handle postingDate - default to transaction date if not provided
    let postingDateStr = dateStr; // Default to transaction date
    if (data.postingDate) {
      if (typeof data.postingDate === "string") {
        postingDateStr = data.postingDate;
      } else if (data.postingDate instanceof Date) {
        postingDateStr = data.postingDate.toISOString().slice(0, 10);
      }
      // Validate posting date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDateStr)) {
        console.warn("[createJournalEntry] Skipped: Invalid posting date format, must be YYYY-MM-DD", { data });
        return { skipped: true, reason: "Invalid posting date format" };
      }
      // Validate that posting date is not before transaction date
      if (postingDateStr < dateStr) {
        console.warn("[createJournalEntry] Skipped: Posting date cannot be before transaction date", { data });
        return { skipped: true, reason: "Posting date cannot be before transaction date" };
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
      const currency = fromAccount.currency;
      if (currency !== toAccount.currency) {
        console.warn("[createJournalEntry] Skipped: Both accounts must use the same currency for regular transactions", { currency, toCurrency: toAccount.currency });
        return { skipped: true, reason: "Both accounts must use the same currency for regular transactions" };
      }
      if (typeof data.amount !== "number" || isNaN(data.amount)) {
        console.warn("[createJournalEntry] Skipped: Amount is required for regular transactions", { amount: data.amount });
        return { skipped: true, reason: "Amount is required for regular transactions" };
      }
      const roundedAmount = Math.round(Math.abs(data.amount) * 100) / 100;

      // Deduplication (same as before, but with currency)
      console.log("[createJournalEntry] Deduplication check values:", {
        date: dateStr,
        description: data.description,
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
      });
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
        // Instead of skipping, return a warning and the existing entry for user confirmation
        return { skipped: true, reason: "potential_duplicate", existing };
      }

      // Use new logic for journal lines
      const [fromLine, toLine] = DatabaseService.generateJournalLines({
        transactionType: data.transactionType || "transfer",
        userAccountId: data.fromAccountId,
        userAccountSubtype: fromAccount.subtype as AccountSubtype,
        counterpartyAccountId: data.toAccountId,
        counterpartyAccountSubtype: toAccount.subtype as AccountSubtype,
        amount: roundedAmount,
        currency,
        description: data.description,
      });

      console.log("[createJournalEntry] Generated journal lines:", { fromLine, toLine });

      const entry = await prisma.journalEntry.create({
        data: {
          date: dateStr,
          description: data.description,
          type: null,
          postingDate: postingDateStr,
          lines: {
            create: [fromLine, toLine],
          },
        },
        include: { lines: true },
      });
      console.log("[createJournalEntry] Created journal entry:", entry);
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
      if (existing) {
        console.warn("[createJournalEntry] Skipped: duplicate (currency_transfer)", { existing });
        return { skipped: true, reason: "duplicate" };
      }

      const entry = await prisma.journalEntry.create({
        data: {
          date: dateStr,
          description: data.description,
          type: "currency_transfer",
          postingDate: postingDateStr,
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
      orderBy: { entry: { date: "desc" } },
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
    const ASSET_TYPES = [AccountType.User];
    // Liabilities have a natural credit balance.
    // A positive balance means money you owe, which is a credit on your books.
    // So, the amount in the journal line will be negative.
    const LIABILITY_TYPES = [AccountType.System];

    // If no transaction provided, create one
    if (!tx) {
      return this.prisma.$transaction(async (trx) => {
        return this.createOpeningBalanceEntry(balances, entryDate, trx);
      });
    }

    // 1. Get or create the 'Opening Balance Equity' account
    let equityAccount = await prisma.account.findFirst({
      where: { name: "Opening Balance Equity" },
    });

    if (!equityAccount) {
      equityAccount = await prisma.account.create({
        data: {
          name: "Opening Balance Equity",
          type: AccountType.System,
        },
      });
    }

    // 2. Create the Journal Entry
    const journalEntry = await prisma.journalEntry.create({
      data: {
        date: typeof entryDate === "string" ? entryDate : entryDate.toISOString().slice(0, 10),
        description: "Opening Balance",
      },
    });

    const accounts = await prisma.account.findMany({
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
      // Always round the amount
      amount = Math.round(amount * 100) / 100;

      if (amount !== 0) {
        linesData.push({
          entryId: journalEntry.id,
          accountId: item.accountId,
          amount,
          currency: account.currency, // Add currency from the account
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
        amount: Math.round(-total * 100) / 100, // The balancing amount, rounded
        currency: equityAccount.currency || "USD", // Add currency for equity account
        description: "Opening Balance",
      });
    }

    // 5. Create all lines in one go
    if (linesData.length > 0) {
      await prisma.journalLine.createMany({
        data: linesData,
      });
    }

    return journalEntry;
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

    // Group by currency
    const income: Record<string, number> = {};
    const expenses: Record<string, number> = {};
    for (const entry of entries) {
      for (const line of entry.lines) {
        if (line.account.type === AccountType.Category) {
          const cur = line.account.currency;
          if (line.account.name.toLowerCase().includes("income")) {
            income[cur] = (income[cur] || 0) + line.amount;
          } else {
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
      orderBy: { date: "desc" },
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

    // First, delete all journal lines associated with this entry
    await prisma.journalLine.deleteMany({
      where: { entryId },
    });

    // Then delete the journal entry itself
    const deletedEntry = await prisma.journalEntry.delete({
      where: { id: entryId },
    });

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
        name: "Uncategorized Income",
        type: AccountType.Category,
        subtype: AccountSubtype.Asset,
        currency: "USD",
      },
      {
        name: "Uncategorized Expense",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
      },
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
        subtype: AccountSubtype.Liability,
        currency: "USD",
      },
      {
        name: "Rent",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
      },
      {
        name: "Utilities",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
      },
      {
        name: "Dining Out",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
      },
      {
        name: "Entertainment",
        type: AccountType.Category,
        subtype: AccountSubtype.Liability,
        currency: "USD",
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
   * @param data { lineId, fromAccountId, toAccountId, amount, date, description }
   */
  public async updateJournalEntryLine(
    data: {
      lineId: string;
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      date: string;
      description: string;
      transactionType?: "income" | "expense" | "transfer";
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

    const roundedAmount = Math.round(Math.abs(data.amount) * 100) / 100;

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

    // Update the entry (date, description)
    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: {
        date: data.date,
        description: data.description,
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

    // Return updated entry with lines
    return prisma.journalEntry.findUnique({
      where: { id: entry.id },
      include: { lines: true },
    });
  }
}

export const databaseService = DatabaseService.getInstance();
