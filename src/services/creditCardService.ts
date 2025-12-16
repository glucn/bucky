import { PrismaClient, Prisma } from "@prisma/client";
import { databaseService } from "./database";

// Type for transaction client
type TransactionClient = Prisma.TransactionClient;

export interface CreditCardPropertiesInput {
  creditLimit: number;
  interestRate: number;
  statementClosingDay: number;
  paymentDueDay: number;
  minimumPaymentPercent?: number;
  minimumPaymentAmount?: number;
  effectiveDate: string;
}

export interface CreditCardProperties {
  id: string;
  accountId: string;
  creditLimit: number;
  interestRate: number;
  statementClosingDay: number;
  paymentDueDay: number;
  minimumPaymentPercent?: number;
  minimumPaymentAmount?: number;
  effectiveDate: string;
  endDate?: string;
  isActive: boolean;
  lastStatementBalance?: number;
  lastStatementDate?: string;
  createdAt: string;
  updatedAt: string;
}

class CreditCardService {
  private static instance: CreditCardService;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = (databaseService as any).prisma;
  }

  public static getInstance(): CreditCardService {
    if (!CreditCardService.instance) {
      CreditCardService.instance = new CreditCardService();
    }
    return CreditCardService.instance;
  }

  /**
   * Set up a credit card account with initial properties
   */
  public async setupCreditCard(
    accountId: string,
    properties: CreditCardPropertiesInput,
    tx?: TransactionClient
  ): Promise<CreditCardProperties> {
    const prisma = tx || this.prisma;

    // Validate that the account exists and is a liability account
    const account = await prisma.account.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      throw new Error("Account not found");
    }

    if (account.subtype !== "liability") {
      throw new Error("Credit card accounts must be liability accounts");
    }

    // Validate input
    this.validateCreditCardProperties(properties);

    // Check if credit card properties already exist for this account
    const existingProperties = await prisma.creditCardProperties.findFirst({
      where: {
        accountId,
        isActive: true
      }
    });

    if (existingProperties) {
      throw new Error("Credit card properties already exist for this account");
    }

    // Create the credit card properties
    const creditCardProperties = await prisma.creditCardProperties.create({
      data: {
        accountId,
        creditLimit: properties.creditLimit,
        interestRate: properties.interestRate,
        statementClosingDay: properties.statementClosingDay,
        paymentDueDay: properties.paymentDueDay,
        minimumPaymentPercent: properties.minimumPaymentPercent,
        minimumPaymentAmount: properties.minimumPaymentAmount,
        effectiveDate: properties.effectiveDate,
        isActive: true
      }
    });

    return this.formatCreditCardProperties(creditCardProperties);
  }

  /**
   * Update credit card properties with versioning
   */
  public async updateCreditCardProperties(
    accountId: string,
    properties: CreditCardPropertiesInput,
    tx?: TransactionClient
  ): Promise<CreditCardProperties> {
    const prisma = tx || this.prisma;

    // Validate input
    this.validateCreditCardProperties(properties);

    // If no transaction provided, create one
    if (!tx) {
      return this.prisma.$transaction(async (trx) => {
        return this.updateCreditCardProperties(accountId, properties, trx);
      });
    }

    // Get current active properties
    const currentProperties = await prisma.creditCardProperties.findFirst({
      where: {
        accountId,
        isActive: true
      }
    });

    if (!currentProperties) {
      throw new Error("No active credit card properties found for this account");
    }

    // Validate that the new effective date is not before the current effective date
    if (properties.effectiveDate <= currentProperties.effectiveDate) {
      throw new Error("New effective date must be after the current effective date");
    }

    // Mark current properties as inactive and set end date
    await prisma.creditCardProperties.update({
      where: { id: currentProperties.id },
      data: {
        isActive: false,
        endDate: properties.effectiveDate
      }
    });

    // Create new properties
    const newProperties = await prisma.creditCardProperties.create({
      data: {
        accountId,
        creditLimit: properties.creditLimit,
        interestRate: properties.interestRate,
        statementClosingDay: properties.statementClosingDay,
        paymentDueDay: properties.paymentDueDay,
        minimumPaymentPercent: properties.minimumPaymentPercent,
        minimumPaymentAmount: properties.minimumPaymentAmount,
        effectiveDate: properties.effectiveDate,
        isActive: true
      }
    });

    return this.formatCreditCardProperties(newProperties);
  }

  /**
   * Get current active credit card properties for an account
   */
  public async getCurrentCreditCardProperties(
    accountId: string,
    tx?: TransactionClient
  ): Promise<CreditCardProperties | null> {
    const prisma = tx || this.prisma;

    const properties = await prisma.creditCardProperties.findFirst({
      where: {
        accountId,
        isActive: true
      }
    });

    return properties ? this.formatCreditCardProperties(properties) : null;
  }

  /**
   * Get credit card properties history for an account
   */
  public async getCreditCardPropertiesHistory(
    accountId: string,
    tx?: TransactionClient
  ): Promise<CreditCardProperties[]> {
    const prisma = tx || this.prisma;

    const propertiesHistory = await prisma.creditCardProperties.findMany({
      where: { accountId },
      orderBy: { effectiveDate: "desc" }
    });

    return propertiesHistory.map(props => this.formatCreditCardProperties(props));
  }

  /**
   * Get credit card properties that were active at a specific date
   */
  public async getCreditCardPropertiesAtDate(
    accountId: string,
    date: string,
    tx?: TransactionClient
  ): Promise<CreditCardProperties | null> {
    const prisma = tx || this.prisma;

    const properties = await prisma.creditCardProperties.findFirst({
      where: {
        accountId,
        effectiveDate: { lte: date },
        OR: [
          { endDate: null },
          { endDate: { gt: date } }
        ]
      },
      orderBy: { effectiveDate: "desc" }
    });

    return properties ? this.formatCreditCardProperties(properties) : null;
  }

  /**
   * Validate credit card properties input
   */
  private validateCreditCardProperties(properties: CreditCardPropertiesInput): void {
    if (properties.creditLimit <= 0) {
      throw new Error("Credit limit must be positive");
    }

    if (properties.interestRate < 0 || properties.interestRate > 1) {
      throw new Error("Interest rate must be between 0 and 1 (as decimal)");
    }

    if (properties.statementClosingDay < 1 || properties.statementClosingDay > 31) {
      throw new Error("Statement closing day must be between 1 and 31");
    }

    if (properties.paymentDueDay < 1 || properties.paymentDueDay > 31) {
      throw new Error("Payment due day must be between 1 and 31");
    }

    // Validate minimum payment - must have either percentage or amount
    if (!properties.minimumPaymentPercent && !properties.minimumPaymentAmount) {
      throw new Error("Must specify either minimum payment percentage or minimum payment amount");
    }

    if (properties.minimumPaymentPercent !== undefined) {
      if (properties.minimumPaymentPercent < 0 || properties.minimumPaymentPercent > 1) {
        throw new Error("Minimum payment percentage must be between 0 and 1 (as decimal)");
      }
    }

    if (properties.minimumPaymentAmount !== undefined) {
      if (properties.minimumPaymentAmount < 0) {
        throw new Error("Minimum payment amount must be non-negative");
      }
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(properties.effectiveDate)) {
      throw new Error("Effective date must be in YYYY-MM-DD format");
    }
  }

  /**
   * Get available credit for a credit card account
   */
  public async getAvailableCredit(
    accountId: string,
    tx?: TransactionClient
  ): Promise<number> {
    const prisma = tx || this.prisma;

    // Get current credit card properties
    const properties = await this.getCurrentCreditCardProperties(accountId, prisma);
    if (!properties) {
      throw new Error("No credit card properties found for this account");
    }

    // Get current account balance (positive for liability accounts means money owed)
    const currentBalance = await databaseService.getAccountBalance(accountId, prisma);
    
    // For liability accounts, a positive balance means money owed
    // Available credit = credit limit - amount owed
    const amountOwed = Math.max(0, currentBalance);
    const availableCredit = properties.creditLimit - amountOwed;
    
    return Math.round(Math.max(0, availableCredit) * 100) / 100;
  }

  /**
   * Get credit utilization percentage for a credit card account
   */
  public async getCreditUtilization(
    accountId: string,
    tx?: TransactionClient
  ): Promise<number> {
    const prisma = tx || this.prisma;

    // Get current credit card properties
    const properties = await this.getCurrentCreditCardProperties(accountId, prisma);
    if (!properties) {
      throw new Error("No credit card properties found for this account");
    }

    if (properties.creditLimit === 0) {
      return 0;
    }

    // Get current account balance (positive for liability accounts means money owed)
    const currentBalance = await databaseService.getAccountBalance(accountId, prisma);
    
    // For liability accounts, a positive balance means money owed
    // Negative balance means credit balance (overpayment), which should result in 0% utilization
    // Utilization = amount owed / credit limit
    const amountOwed = Math.max(0, currentBalance);
    const utilization = (amountOwed / properties.creditLimit) * 100;
    
    return Math.round(Math.min(100, utilization) * 100) / 100;
  }

  /**
   * Get minimum payment amount for a credit card account
   */
  public async getMinimumPayment(
    accountId: string,
    tx?: TransactionClient
  ): Promise<number> {
    const prisma = tx || this.prisma;

    // Get current credit card properties
    const properties = await this.getCurrentCreditCardProperties(accountId, prisma);
    if (!properties) {
      throw new Error("No credit card properties found for this account");
    }

    // Get current account balance (positive for liability accounts means money owed)
    const currentBalance = await databaseService.getAccountBalance(accountId, prisma);
    
    // For liability accounts, a positive balance means money owed
    const amountOwed = Math.max(0, currentBalance);
    
    if (amountOwed === 0) {
      return 0;
    }

    let minimumPayment = 0;

    // Calculate based on percentage if specified
    if (properties.minimumPaymentPercent) {
      minimumPayment = amountOwed * properties.minimumPaymentPercent;
    }

    // Use fixed amount if specified (and take the greater of the two if both are specified)
    if (properties.minimumPaymentAmount) {
      minimumPayment = Math.max(minimumPayment, properties.minimumPaymentAmount);
    }
    
    return Math.round(minimumPayment * 100) / 100;
  }

  /**
   * Record a credit card payment
   */
  public async recordPayment(
    accountId: string,
    amount: number,
    paymentDate: string,
    fromAccountId: string,
    postingDate?: string,
    description?: string,
    tx?: TransactionClient
  ): Promise<any> {
    // Validate that this is a credit card account
    const properties = await this.getCurrentCreditCardProperties(accountId, tx);
    if (!properties) {
      throw new Error("Account is not configured as a credit card");
    }

    // Create the payment transaction using the existing database service
    return databaseService.createJournalEntry({
      date: paymentDate,
      description: description || "Credit Card Payment",
      fromAccountId: fromAccountId,
      toAccountId: accountId,
      amount: amount,
      postingDate: postingDate,
      transactionType: "transfer",
      skipDuplicateCheck: false, // Allow manual credit card payments even if they look like duplicates
    }, tx);
  }

  /**
   * Record a credit card transaction (purchase, fee, etc.)
   */
  public async recordTransaction(
    accountId: string,
    amount: number,
    transactionDate: string,
    categoryAccountId: string,
    postingDate?: string,
    description?: string,
    tx?: TransactionClient
  ): Promise<any> {
    // Validate that this is a credit card account
    const properties = await this.getCurrentCreditCardProperties(accountId, tx);
    if (!properties) {
      throw new Error("Account is not configured as a credit card");
    }

    // Create the transaction using the existing database service
    // For credit card purchases, the credit card account is the "from" account (money flows from credit)
    // and the category account is the "to" account (expense category)
    return databaseService.createJournalEntry({
      date: transactionDate,
      description: description || "Credit Card Transaction",
      fromAccountId: accountId,
      toAccountId: categoryAccountId,
      amount: amount,
      postingDate: postingDate,
      transactionType: "expense",
      skipDuplicateCheck: false, // Allow manual credit card transactions even if they look like duplicates
    }, tx);
  }

  /**
   * Get transactions for a credit card account within a date range (by posting date)
   */
  public async getTransactionsByPostingDate(
    accountId: string,
    startDate: string,
    endDate: string,
    tx?: TransactionClient
  ): Promise<any[]> {
    const prisma = tx || this.prisma;

    // Get all journal lines for this account
    const lines = await prisma.journalLine.findMany({
      where: {
        accountId,
        entry: {
          postingDate: {
            gte: startDate,
            lte: endDate
          }
        }
      },
      include: {
        entry: {
          include: {
            lines: {
              include: {
                account: true
              }
            }
          }
        },
        account: true
      },
      orderBy: {
        entry: {
          postingDate: "desc"
        }
      }
    });

    return lines.map(line => ({
      ...line,
      entry: {
        ...line.entry,
        lines: line.entry.lines.map((l: any) => ({
          ...l,
          account: l.account ? { ...l.account, type: l.account.type } : l.account
        }))
      },
      account: line.account ? { ...line.account, type: line.account.type } : line.account
    }));
  }

  /**
   * Format credit card properties for consistent output
   */
  private formatCreditCardProperties(properties: any): CreditCardProperties {
    return {
      id: properties.id,
      accountId: properties.accountId,
      creditLimit: properties.creditLimit,
      interestRate: properties.interestRate,
      statementClosingDay: properties.statementClosingDay,
      paymentDueDay: properties.paymentDueDay,
      minimumPaymentPercent: properties.minimumPaymentPercent,
      minimumPaymentAmount: properties.minimumPaymentAmount,
      effectiveDate: properties.effectiveDate,
      endDate: properties.endDate,
      isActive: properties.isActive,
      lastStatementBalance: properties.lastStatementBalance,
      lastStatementDate: properties.lastStatementDate,
      createdAt: properties.createdAt.toISOString(),
      updatedAt: properties.updatedAt.toISOString()
    };
  }
}

export const creditCardService = CreditCardService.getInstance();