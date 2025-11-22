/**
 * Utility functions for formatting and displaying multi-currency balances
 */

import {
  normalizeTransactionAmount,
  normalizeAccountBalance,
} from './displayNormalization';
import { AccountType, AccountSubtype } from '../../shared/accountTypes';

/**
 * Common currency symbols mapping
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  CAD: 'CAD$',
  AUD: 'A$',
  CHF: 'CHF',
  INR: '₹',
  KRW: '₩',
  BRL: 'R$',
  MXN: 'MX$',
  RUB: '₽',
  ZAR: 'R',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  PLN: 'zł',
  TRY: '₺',
  THB: '฿',
};

/**
 * Get the currency symbol for a given currency code
 * Falls back to the currency code if no symbol is found
 */
export function getCurrencySymbol(currencyCode: string): string {
  return CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || currencyCode;
}

/**
 * Format a single currency amount with proper symbol/code
 * @param amount - The numeric amount
 * @param currency - The currency code (e.g., 'USD', 'EUR')
 * @param options - Formatting options
 * @returns Formatted string like "$1,234.56" or "1,234.56 EUR"
 */
export function formatCurrencyAmount(
  amount: number,
  currency: string,
  options: {
    showSymbol?: boolean;
    showCode?: boolean;
    decimals?: number;
    useGrouping?: boolean;
  } = {}
): string {
  const {
    showSymbol = true,
    showCode = true,
    decimals = 2,
    useGrouping = true,
  } = options;

  // Format the number with proper decimals and grouping
  const formattedAmount = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping,
  });

  const symbol = getCurrencySymbol(currency);
  const code = currency.toUpperCase();

  // If symbol is different from code, show symbol before amount
  if (showSymbol && symbol !== code) {
    return `${symbol}${formattedAmount}`;
  }

  // Otherwise show amount with code after
  if (showCode) {
    return `${formattedAmount} ${code}`;
  }

  return formattedAmount;
}

/**
 * Format multi-currency balances for display
 * @param balances - Record of currency code to balance amount
 * @param options - Formatting options
 * @returns Formatted string like "$1,234.56, €500.00, 1,000.00 JPY"
 */
export function formatMultiCurrencyBalances(
  balances: Record<string, number>,
  options: {
    separator?: string;
    sortCurrencies?: boolean;
    showSymbol?: boolean;
    showCode?: boolean;
    decimals?: number;
  } = {}
): string {
  const {
    separator = ', ',
    sortCurrencies = true,
    showSymbol = true,
    showCode = true,
    decimals = 2,
  } = options;

  if (!balances || Object.keys(balances).length === 0) {
    return '—';
  }

  let entries = Object.entries(balances);

  // Sort by currency code if requested
  if (sortCurrencies) {
    entries = entries.sort(([a], [b]) => a.localeCompare(b));
  }

  // Format each currency balance
  const formattedBalances = entries.map(([currency, amount]) =>
    formatCurrencyAmount(amount, currency, {
      showSymbol,
      showCode,
      decimals,
    })
  );

  return formattedBalances.join(separator);
}

/**
 * Group and aggregate balances by currency from a list of items
 * @param items - Array of items with currency and amount properties
 * @param getCurrency - Function to extract currency from an item
 * @param getAmount - Function to extract amount from an item
 * @returns Record of currency code to total amount
 */
export function groupBalancesByCurrency<T>(
  items: T[],
  getCurrency: (item: T) => string,
  getAmount: (item: T) => number
): Record<string, number> {
  const balances: Record<string, number> = {};

  for (const item of items) {
    const currency = getCurrency(item);
    const amount = getAmount(item);

    if (!balances[currency]) {
      balances[currency] = 0;
    }

    balances[currency] += amount;
  }

  return balances;
}

/**
 * Format a single balance with fallback to default currency
 * Useful for accounts that may have multi-currency balances
 * @param balance - Single balance amount (fallback)
 * @param currency - Default currency code
 * @param balances - Optional multi-currency balances
 * @returns Formatted balance string
 */
export function formatAccountBalance(
  balance: number,
  currency: string,
  balances?: Record<string, number>
): string {
  // If multi-currency balances exist and have entries, use them
  if (balances && Object.keys(balances).length > 0) {
    return formatMultiCurrencyBalances(balances);
  }

  // Otherwise, fall back to single balance
  return formatCurrencyAmount(balance, currency);
}

/**
 * Format currency for transaction display
 * Shows both amount and currency code for clarity
 * @param amount - Transaction amount
 * @param currency - Currency code
 * @returns Formatted string like "1,234.56 USD"
 */
export function formatTransactionCurrency(
  amount: number,
  currency: string
): string {
  return formatCurrencyAmount(amount, currency, {
    showSymbol: false,
    showCode: true,
  });
}

/**
 * Format a normalized transaction amount with currency
 * Combines display normalization with currency formatting
 * @param amount - Raw transaction amount from database
 * @param currency - Currency code
 * @param accountType - Type of account (user, category, system)
 * @param accountSubtype - Subtype of account (asset, liability)
 * @param isCurrentAccount - Whether this is the account being viewed
 * @param options - Formatting options
 * @returns Formatted string with normalized amount and currency
 */
export function formatNormalizedTransactionAmount(
  amount: number,
  currency: string,
  accountType: AccountType,
  accountSubtype: AccountSubtype,
  isCurrentAccount: boolean,
  options: {
    showSymbol?: boolean;
    showCode?: boolean;
    decimals?: number;
    useGrouping?: boolean;
  } = {}
): string {
  // Normalize the amount for display
  const normalizedAmount = normalizeTransactionAmount(
    amount,
    accountType,
    accountSubtype,
    isCurrentAccount
  );

  // Format with currency
  return formatCurrencyAmount(normalizedAmount, currency, options);
}

/**
 * Format a normalized account balance with currency
 * Combines balance normalization with currency formatting
 * @param balance - Raw account balance from database
 * @param currency - Currency code
 * @param accountType - Type of account (user, category, system)
 * @param accountSubtype - Subtype of account (asset, liability)
 * @param options - Formatting options
 * @returns Formatted string with normalized balance and currency
 */
export function formatNormalizedBalance(
  balance: number,
  currency: string,
  accountType: AccountType,
  accountSubtype: AccountSubtype,
  options: {
    showSymbol?: boolean;
    showCode?: boolean;
    decimals?: number;
    useGrouping?: boolean;
  } = {}
): string {
  // Normalize the balance for display
  const normalizedBalance = normalizeAccountBalance(
    balance,
    accountType,
    accountSubtype
  );

  // Format with currency
  return formatCurrencyAmount(normalizedBalance, currency, options);
}
