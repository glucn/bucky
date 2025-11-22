/**
 * Display Normalization Utilities
 * 
 * This module provides functions to normalize transaction amounts and account balances
 * for display purposes. The underlying database maintains accurate double-entry bookkeeping
 * with raw debit/credit amounts, while these utilities transform amounts for intuitive
 * user display.
 * 
 * Key principles:
 * - Non-destructive: stored data is never modified
 * - Type-safe: TypeScript ensures correct usage
 * - Centralized: all display logic in one place
 */

import { AccountType, AccountSubtype } from '../../shared/accountTypes';

/**
 * Parameters for transaction amount normalization
 */
export interface TransactionNormalizationParams {
  amount: number;
  accountType: AccountType;
  accountSubtype: AccountSubtype;
  isCurrentAccount: boolean;
}

/**
 * Parameters for balance normalization
 */
export interface BalanceNormalizationParams {
  balance: number;
  accountType: AccountType;
  accountSubtype: AccountSubtype;
}

/**
 * Display sign indicator for styling purposes
 */
export type DisplaySign = 'positive' | 'negative' | 'neutral';

/**
 * Visual indicator configuration for transaction display
 */
export interface VisualIndicator {
  cssClass: string;
  ariaLabel: string;
  colorClass: string;
}

/**
 * Normalize a transaction amount for display based on account type and context.
 * 
 * Display rules:
 * - Asset accounts (bank, cash): spending = negative, income = positive
 * - Liability accounts (credit cards): spending = positive, payments = negative
 * - Category accounts: all amounts = positive (absolute value)
 * 
 * @param amount - Raw transaction amount from database
 * @param accountType - Type of account (user, category, system)
 * @param accountSubtype - Subtype of account (asset, liability)
 * @param isCurrentAccount - Whether this is the account being viewed (affects transfer display)
 * @returns Normalized amount for display
 */
export function normalizeTransactionAmount(
  amount: number | null | undefined,
  accountType: AccountType,
  accountSubtype: AccountSubtype,
  isCurrentAccount: boolean
): number {
  // Handle null/undefined as zero
  if (amount == null) {
    return 0;
  }

  // Zero amounts display as zero regardless of account type
  if (amount === 0) {
    return 0;
  }

  // Validate account type and subtype
  validateAccountMetadata(accountType, accountSubtype);

  // Category accounts: always display as positive (absolute value)
  if (accountType === AccountType.Category) {
    return Math.abs(amount);
  }

  // User accounts (bank, cash, credit cards)
  if (accountType === AccountType.User) {
    if (accountSubtype === AccountSubtype.Asset) {
      // Asset accounts: preserve sign (negative = spending, positive = income)
      return amount;
    } else if (accountSubtype === AccountSubtype.Liability) {
      // Liability accounts: preserve sign (positive = spending, negative = payment)
      return amount;
    }
  }

  // System accounts: preserve raw amount
  return amount;
}

/**
 * Normalize an account balance for display.
 * 
 * Display rules:
 * - Asset accounts: preserve sign (positive = funded, negative = overdrawn)
 * - Liability accounts: display absolute value (positive = owed, negative = credit balance)
 * - Category accounts: display absolute value (always positive)
 * 
 * @param balance - Raw account balance from database
 * @param accountType - Type of account (user, category, system)
 * @param accountSubtype - Subtype of account (asset, liability)
 * @returns Normalized balance for display
 */
export function normalizeAccountBalance(
  balance: number | null | undefined,
  accountType: AccountType,
  accountSubtype: AccountSubtype
): number {
  // Handle null/undefined as zero
  if (balance == null) {
    return 0;
  }

  // Zero balances display as zero regardless of account type
  if (balance === 0) {
    return 0;
  }

  // Validate account type and subtype
  validateAccountMetadata(accountType, accountSubtype);

  // Category accounts: always display as positive (absolute value)
  if (accountType === AccountType.Category) {
    return Math.abs(balance);
  }

  // User accounts
  if (accountType === AccountType.User) {
    if (accountSubtype === AccountSubtype.Asset) {
      // Asset accounts: preserve sign
      return balance;
    } else if (accountSubtype === AccountSubtype.Liability) {
      // Liability accounts: negate the balance
      // In double-entry: liability has negative balance when owed
      // Display: positive when owed, negative when credit balance
      return -balance;
    }
  }

  // System accounts: preserve raw balance
  return balance;
}

/**
 * Determine if a transaction represents income for the given account.
 * 
 * @param amount - Raw transaction amount
 * @param accountType - Type of account
 * @param accountSubtype - Subtype of account
 * @returns True if the transaction is income
 */
export function isIncomeTransaction(
  amount: number,
  accountType: AccountType,
  accountSubtype: AccountSubtype
): boolean {
  if (amount === 0) {
    return false;
  }

  // For asset accounts (bank, cash): positive amounts are income
  if (accountType === AccountType.User && accountSubtype === AccountSubtype.Asset) {
    return amount > 0;
  }

  // For liability accounts (credit cards): negative amounts are payments (income to the account)
  if (accountType === AccountType.User && accountSubtype === AccountSubtype.Liability) {
    return amount < 0;
  }

  // For income categories: all amounts are income
  if (accountType === AccountType.Category && accountSubtype === AccountSubtype.Asset) {
    return true;
  }

  return false;
}

/**
 * Determine if a transaction represents an expense for the given account.
 * 
 * @param amount - Raw transaction amount
 * @param accountType - Type of account
 * @param accountSubtype - Subtype of account
 * @returns True if the transaction is an expense
 */
export function isExpenseTransaction(
  amount: number,
  accountType: AccountType,
  accountSubtype: AccountSubtype
): boolean {
  if (amount === 0) {
    return false;
  }

  // For asset accounts (bank, cash): negative amounts are expenses
  if (accountType === AccountType.User && accountSubtype === AccountSubtype.Asset) {
    return amount < 0;
  }

  // For liability accounts (credit cards): positive amounts are spending (expenses)
  if (accountType === AccountType.User && accountSubtype === AccountSubtype.Liability) {
    return amount > 0;
  }

  // For expense categories: all amounts are expenses
  if (accountType === AccountType.Category && accountSubtype === AccountSubtype.Liability) {
    return true;
  }

  return false;
}

/**
 * Get the display sign for a transaction (for styling purposes).
 * 
 * @param amount - Raw transaction amount
 * @param accountType - Type of account
 * @param accountSubtype - Subtype of account
 * @param isCurrentAccount - Whether this is the account being viewed
 * @returns Display sign indicator
 */
export function getTransactionDisplaySign(
  amount: number,
  accountType: AccountType,
  accountSubtype: AccountSubtype,
  isCurrentAccount: boolean
): DisplaySign {
  if (amount === 0) {
    return 'neutral';
  }

  const normalizedAmount = normalizeTransactionAmount(
    amount,
    accountType,
    accountSubtype,
    isCurrentAccount
  );

  return normalizedAmount > 0 ? 'positive' : normalizedAmount < 0 ? 'negative' : 'neutral';
}

/**
 * Get visual indicators (CSS classes, ARIA labels, colors) for a transaction.
 * 
 * This function provides consistent visual styling across all components:
 * - Green for income/positive amounts
 * - Red for expense/negative amounts
 * - Neutral for zero amounts
 * 
 * @param amount - Raw transaction amount
 * @param accountType - Type of account
 * @param accountSubtype - Subtype of account
 * @param isCurrentAccount - Whether this is the account being viewed
 * @returns Visual indicator configuration
 */
export function getTransactionVisualIndicator(
  amount: number,
  accountType: AccountType,
  accountSubtype: AccountSubtype,
  isCurrentAccount: boolean
): VisualIndicator {
  const displaySign = getTransactionDisplaySign(
    amount,
    accountType,
    accountSubtype,
    isCurrentAccount
  );

  if (displaySign === 'positive') {
    return {
      cssClass: 'amount-positive',
      colorClass: 'text-green-600',
      ariaLabel: 'Positive amount'
    };
  } else if (displaySign === 'negative') {
    return {
      cssClass: 'amount-negative',
      colorClass: 'text-red-600',
      ariaLabel: 'Negative amount'
    };
  } else {
    return {
      cssClass: 'amount-neutral',
      colorClass: 'text-gray-600',
      ariaLabel: 'Zero amount'
    };
  }
}

/**
 * Get CSS class for transaction amount based on display sign.
 * 
 * @param amount - Raw transaction amount
 * @param accountType - Type of account
 * @param accountSubtype - Subtype of account
 * @param isCurrentAccount - Whether this is the account being viewed
 * @returns CSS class name
 */
export function getTransactionCssClass(
  amount: number,
  accountType: AccountType,
  accountSubtype: AccountSubtype,
  isCurrentAccount: boolean
): string {
  return getTransactionVisualIndicator(
    amount,
    accountType,
    accountSubtype,
    isCurrentAccount
  ).cssClass;
}

/**
 * Get color class for transaction amount based on display sign.
 * 
 * @param amount - Raw transaction amount
 * @param accountType - Type of account
 * @param accountSubtype - Subtype of account
 * @param isCurrentAccount - Whether this is the account being viewed
 * @returns Tailwind color class
 */
export function getTransactionColorClass(
  amount: number,
  accountType: AccountType,
  accountSubtype: AccountSubtype,
  isCurrentAccount: boolean
): string {
  return getTransactionVisualIndicator(
    amount,
    accountType,
    accountSubtype,
    isCurrentAccount
  ).colorClass;
}

/**
 * Get ARIA label for transaction amount based on display sign.
 * 
 * @param amount - Raw transaction amount
 * @param accountType - Type of account
 * @param accountSubtype - Subtype of account
 * @param isCurrentAccount - Whether this is the account being viewed
 * @returns ARIA label text
 */
export function getTransactionAriaLabel(
  amount: number,
  accountType: AccountType,
  accountSubtype: AccountSubtype,
  isCurrentAccount: boolean
): string {
  return getTransactionVisualIndicator(
    amount,
    accountType,
    accountSubtype,
    isCurrentAccount
  ).ariaLabel;
}

/**
 * Validate account metadata to ensure correct usage.
 * 
 * @param accountType - Type of account
 * @param accountSubtype - Subtype of account
 * @throws Error if account type or subtype is invalid
 */
function validateAccountMetadata(
  accountType: AccountType,
  accountSubtype: AccountSubtype
): void {
  const validAccountTypes = Object.values(AccountType);
  const validAccountSubtypes = Object.values(AccountSubtype);

  if (!validAccountTypes.includes(accountType)) {
    throw new Error(`Invalid account type: ${accountType}`);
  }

  if (!validAccountSubtypes.includes(accountSubtype)) {
    throw new Error(`Invalid account subtype: ${accountSubtype}`);
  }
}
