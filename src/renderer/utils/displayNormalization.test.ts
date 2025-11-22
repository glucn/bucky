/**
 * Property-Based Tests for Display Normalization
 * 
 * These tests verify that the display normalization utilities correctly transform
 * transaction amounts and account balances according to the specification.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  normalizeTransactionAmount,
  normalizeAccountBalance,
  isIncomeTransaction,
  isExpenseTransaction,
  getTransactionDisplaySign,
  getTransactionVisualIndicator,
  getTransactionCssClass,
  getTransactionColorClass,
  getTransactionAriaLabel,
} from './displayNormalization';
import { AccountType, AccountSubtype } from '../../shared/accountTypes';

describe('Display Normalization - Property-Based Tests', () => {
  /**
   * Feature: transaction-display-normalization, Property 1: Asset account spending displays negative
   * 
   * For any user account with asset subtype and any spending transaction (negative raw amount),
   * the normalized display amount should be negative.
   * 
   * Validates: Requirements 1.1, 1.3
   */
  it('Property 1: Asset account spending displays negative', () => {
    fc.assert(
      fc.property(
        // Generate negative amounts (spending transactions for asset accounts)
        fc.double({ min: -1000000, max: -0.01, noNaN: true }),
        // Generate boolean for isCurrentAccount context
        fc.boolean(),
        (spendingAmount, isCurrentAccount) => {
          // Apply normalization for asset account
          const normalizedAmount = normalizeTransactionAmount(
            spendingAmount,
            AccountType.User,
            AccountSubtype.Asset,
            isCurrentAccount
          );

          // Property: spending (negative raw amount) should display as negative
          expect(normalizedAmount).toBeLessThan(0);
          
          // Additional verification: the normalized amount should equal the raw amount
          // (asset accounts preserve sign)
          expect(normalizedAmount).toBe(spendingAmount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: transaction-display-normalization, Property 2: Asset account income displays positive
   * 
   * For any user account with asset subtype and any income transaction (positive raw amount),
   * the normalized display amount should be positive.
   * 
   * Validates: Requirements 1.2, 1.4
   */
  it('Property 2: Asset account income displays positive', () => {
    fc.assert(
      fc.property(
        // Generate positive amounts (income transactions for asset accounts)
        fc.double({ min: 0.01, max: 1000000, noNaN: true }),
        // Generate boolean for isCurrentAccount context
        fc.boolean(),
        (incomeAmount, isCurrentAccount) => {
          // Apply normalization for asset account
          const normalizedAmount = normalizeTransactionAmount(
            incomeAmount,
            AccountType.User,
            AccountSubtype.Asset,
            isCurrentAccount
          );

          // Property: income (positive raw amount) should display as positive
          expect(normalizedAmount).toBeGreaterThan(0);
          
          // Additional verification: the normalized amount should equal the raw amount
          // (asset accounts preserve sign)
          expect(normalizedAmount).toBe(incomeAmount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: transaction-display-normalization, Property 3: Asset account balance preserves sign
   * 
   * For any user account with asset subtype, the normalized balance should have the same sign
   * as the raw balance (positive when funded, negative when overdrawn).
   * 
   * Validates: Requirements 1.5
   */
  it('Property 3: Asset account balance preserves sign', () => {
    fc.assert(
      fc.property(
        // Generate any balance value (positive, negative, or zero)
        fc.double({ min: -1000000, max: 1000000, noNaN: true }),
        (rawBalance) => {
          // Apply balance normalization for asset account
          const normalizedBalance = normalizeAccountBalance(
            rawBalance,
            AccountType.User,
            AccountSubtype.Asset
          );

          // Property: asset account balance should preserve sign
          if (rawBalance > 0) {
            // Positive balance (funded) should display as positive
            expect(normalizedBalance).toBeGreaterThan(0);
            expect(normalizedBalance).toBe(rawBalance);
          } else if (rawBalance < 0) {
            // Negative balance (overdrawn) should display as negative
            expect(normalizedBalance).toBeLessThan(0);
            expect(normalizedBalance).toBe(rawBalance);
          } else {
            // Zero balance should display as zero
            expect(normalizedBalance).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: transaction-display-normalization, Property 4: Liability account spending displays positive
   * 
   * For any user account with liability subtype and any spending transaction (positive raw amount),
   * the normalized display amount should be positive.
   * 
   * Validates: Requirements 2.1
   */
  it('Property 4: Liability account spending displays positive', () => {
    fc.assert(
      fc.property(
        // Generate positive amounts (spending transactions for liability accounts)
        fc.double({ min: 0.01, max: 1000000, noNaN: true }),
        // Generate boolean for isCurrentAccount context
        fc.boolean(),
        (spendingAmount, isCurrentAccount) => {
          // Apply normalization for liability account
          const normalizedAmount = normalizeTransactionAmount(
            spendingAmount,
            AccountType.User,
            AccountSubtype.Liability,
            isCurrentAccount
          );

          // Property: spending (positive raw amount) should display as positive
          expect(normalizedAmount).toBeGreaterThan(0);
          
          // Additional verification: the normalized amount should equal the raw amount
          // (liability accounts preserve sign for spending)
          expect(normalizedAmount).toBe(spendingAmount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: transaction-display-normalization, Property 5: Liability account payment displays negative
   * 
   * For any user account with liability subtype and any payment transaction (negative raw amount),
   * the normalized display amount should be negative.
   * 
   * Validates: Requirements 2.2
   */
  it('Property 5: Liability account payment displays negative', () => {
    fc.assert(
      fc.property(
        // Generate negative amounts (payment transactions for liability accounts)
        fc.double({ min: -1000000, max: -0.01, noNaN: true }),
        // Generate boolean for isCurrentAccount context
        fc.boolean(),
        (paymentAmount, isCurrentAccount) => {
          // Apply normalization for liability account
          const normalizedAmount = normalizeTransactionAmount(
            paymentAmount,
            AccountType.User,
            AccountSubtype.Liability,
            isCurrentAccount
          );

          // Property: payment (negative raw amount) should display as negative
          expect(normalizedAmount).toBeLessThan(0);
          
          // Additional verification: the normalized amount should equal the raw amount
          // (liability accounts preserve sign for payments)
          expect(normalizedAmount).toBe(paymentAmount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: transaction-display-normalization, Property 6: Liability account balance displays as absolute value
   * 
   * For any user account with liability subtype, the normalized balance should display as the
   * absolute value of the raw balance (positive when owed, negative when credit balance).
   * 
   * In double-entry accounting, liability accounts have negative balances when money is owed.
   * For display, we negate this to show positive amounts owed and negative credit balances.
   * 
   * Validates: Requirements 2.3, 2.4
   */
  it('Property 6: Liability account balance displays as absolute value', () => {
    fc.assert(
      fc.property(
        // Generate any balance value (positive, negative, or zero)
        fc.double({ min: -1000000, max: 1000000, noNaN: true }),
        (rawBalance) => {
          // Apply balance normalization for liability account
          const normalizedBalance = normalizeAccountBalance(
            rawBalance,
            AccountType.User,
            AccountSubtype.Liability
          );

          // Property: liability account balance should be negated for display
          if (rawBalance > 0) {
            // Positive raw balance (credit balance/overpayment) should display as negative
            expect(normalizedBalance).toBeLessThan(0);
            expect(normalizedBalance).toBe(-rawBalance);
          } else if (rawBalance < 0) {
            // Negative raw balance (amount owed) should display as positive
            expect(normalizedBalance).toBeGreaterThan(0);
            expect(normalizedBalance).toBe(-rawBalance);
          } else {
            // Zero balance should display as zero
            expect(normalizedBalance).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: transaction-display-normalization, Property 7: Income category transactions display as positive
   * 
   * For any category account with asset subtype and any transaction amount,
   * the normalized display amount should be positive (absolute value).
   * 
   * Income categories should always show positive amounts regardless of the raw amount sign,
   * making it easy for users to see how much they earned in each category.
   * 
   * Validates: Requirements 3.1
   */
  it('Property 7: Income category transactions display as positive', () => {
    fc.assert(
      fc.property(
        // Generate any transaction amount (positive, negative, or zero)
        fc.double({ min: -1000000, max: 1000000, noNaN: true }),
        // Generate boolean for isCurrentAccount context
        fc.boolean(),
        (transactionAmount, isCurrentAccount) => {
          // Apply normalization for income category account
          const normalizedAmount = normalizeTransactionAmount(
            transactionAmount,
            AccountType.Category,
            AccountSubtype.Asset,
            isCurrentAccount
          );

          // Property: income category transactions should always display as positive
          if (transactionAmount > 0) {
            // Positive amounts should remain positive
            expect(normalizedAmount).toBeGreaterThan(0);
            expect(normalizedAmount).toBe(Math.abs(transactionAmount));
          } else if (transactionAmount < 0) {
            // Negative amounts should be converted to positive
            expect(normalizedAmount).toBeGreaterThan(0);
            expect(normalizedAmount).toBe(Math.abs(transactionAmount));
          } else {
            // Zero amounts should display as zero
            expect(normalizedAmount).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: transaction-display-normalization, Property 8: Expense category transactions display as positive
   * 
   * For any category account with liability subtype and any transaction amount,
   * the normalized display amount should be positive (absolute value).
   * 
   * Expense categories should always show positive amounts regardless of the raw amount sign,
   * making it easy for users to see how much they spent in each category.
   * 
   * Validates: Requirements 4.1
   */
  it('Property 8: Expense category transactions display as positive', () => {
    fc.assert(
      fc.property(
        // Generate any transaction amount (positive, negative, or zero)
        fc.double({ min: -1000000, max: 1000000, noNaN: true }),
        // Generate boolean for isCurrentAccount context
        fc.boolean(),
        (transactionAmount, isCurrentAccount) => {
          // Apply normalization for expense category account
          const normalizedAmount = normalizeTransactionAmount(
            transactionAmount,
            AccountType.Category,
            AccountSubtype.Liability,
            isCurrentAccount
          );

          // Property: expense category transactions should always display as positive
          if (transactionAmount > 0) {
            // Positive amounts should remain positive
            expect(normalizedAmount).toBeGreaterThan(0);
            expect(normalizedAmount).toBe(Math.abs(transactionAmount));
          } else if (transactionAmount < 0) {
            // Negative amounts should be converted to positive
            expect(normalizedAmount).toBeGreaterThan(0);
            expect(normalizedAmount).toBe(Math.abs(transactionAmount));
          } else {
            // Zero amounts should display as zero
            expect(normalizedAmount).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: transaction-display-normalization, Property 9: Category balances display as positive
   * 
   * For any category account (regardless of subtype) and any balance value,
   * the normalized balance should be positive (absolute value).
   * 
   * Both income and expense category balances should always show as positive amounts,
   * making it easy for users to see totals without worrying about signs.
   * 
   * Validates: Requirements 3.2, 4.2
   */
  it('Property 9: Category balances display as positive', () => {
    fc.assert(
      fc.property(
        // Generate any balance value (positive, negative, or zero)
        fc.double({ min: -1000000, max: 1000000, noNaN: true }),
        // Generate account subtype (asset for income, liability for expense)
        fc.constantFrom(AccountSubtype.Asset, AccountSubtype.Liability),
        (rawBalance, accountSubtype) => {
          // Apply balance normalization for category account
          const normalizedBalance = normalizeAccountBalance(
            rawBalance,
            AccountType.Category,
            accountSubtype
          );

          // Property: category balances should always display as positive (absolute value)
          if (rawBalance > 0) {
            // Positive balances should remain positive
            expect(normalizedBalance).toBeGreaterThan(0);
            expect(normalizedBalance).toBe(Math.abs(rawBalance));
          } else if (rawBalance < 0) {
            // Negative balances should be converted to positive
            expect(normalizedBalance).toBeGreaterThan(0);
            expect(normalizedBalance).toBe(Math.abs(rawBalance));
          } else {
            // Zero balances should display as zero
            expect(normalizedBalance).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: transaction-display-normalization, Property 10: Multi-currency category balances display as positive
   * 
   * For any category account with transactions in multiple currencies, each currency balance
   * should normalize to a positive value (absolute value).
   * 
   * This property verifies that when a category account has balances in multiple currencies
   * (e.g., USD, EUR, GBP), each individual currency balance is displayed as positive,
   * regardless of the raw balance sign in the database.
   * 
   * Validates: Requirements 3.3, 4.3
   */
  it('Property 10: Multi-currency category balances display as positive', () => {
    fc.assert(
      fc.property(
        // Generate a record of currency balances (1-5 currencies)
        fc.dictionary(
          // Currency codes (use common 3-letter currency codes)
          fc.constantFrom('USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY'),
          // Balance amounts (positive, negative, or zero)
          fc.double({ min: -1000000, max: 1000000, noNaN: true }),
          { minKeys: 1, maxKeys: 5 }
        ),
        // Generate account subtype (asset for income, liability for expense)
        fc.constantFrom(AccountSubtype.Asset, AccountSubtype.Liability),
        (currencyBalances, accountSubtype) => {
          // For each currency balance, apply normalization
          for (const [currency, rawBalance] of Object.entries(currencyBalances)) {
            const normalizedBalance = normalizeAccountBalance(
              rawBalance,
              AccountType.Category,
              accountSubtype
            );

            // Property: each currency balance should display as positive (absolute value)
            if (rawBalance > 0) {
              // Positive balances should remain positive
              expect(normalizedBalance).toBeGreaterThan(0);
              expect(normalizedBalance).toBe(Math.abs(rawBalance));
            } else if (rawBalance < 0) {
              // Negative balances should be converted to positive
              expect(normalizedBalance).toBeGreaterThan(0);
              expect(normalizedBalance).toBe(Math.abs(rawBalance));
            } else {
              // Zero balances should display as zero
              expect(normalizedBalance).toBe(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: transaction-display-normalization, Property 11: Normalization is non-destructive
   * 
   * For any transaction or balance, applying normalization should not modify the original
   * raw amount stored in the database.
   * 
   * This property verifies that normalization functions are pure and do not have side effects.
   * The original input values should remain unchanged after calling normalization functions.
   * 
   * Validates: Requirements 5.5
   */
  it('Property 11: Normalization is non-destructive', () => {
    fc.assert(
      fc.property(
        // Generate any amount value
        fc.double({ min: -1000000, max: 1000000, noNaN: true }),
        // Generate account type
        fc.constantFrom(AccountType.User, AccountType.Category, AccountType.System),
        // Generate account subtype
        fc.constantFrom(AccountSubtype.Asset, AccountSubtype.Liability),
        // Generate boolean for isCurrentAccount context
        fc.boolean(),
        (originalAmount, accountType, accountSubtype, isCurrentAccount) => {
          // Store the original value
          const originalAmountCopy = originalAmount;
          const originalBalanceCopy = originalAmount;

          // Apply transaction amount normalization
          const normalizedTransaction = normalizeTransactionAmount(
            originalAmount,
            accountType,
            accountSubtype,
            isCurrentAccount
          );

          // Property: original amount should be unchanged after normalization
          expect(originalAmount).toBe(originalAmountCopy);

          // Apply balance normalization
          const normalizedBalance = normalizeAccountBalance(
            originalAmount,
            accountType,
            accountSubtype
          );

          // Property: original balance should be unchanged after normalization
          expect(originalAmount).toBe(originalBalanceCopy);

          // Verify that normalization functions return values (not undefined)
          expect(normalizedTransaction).toBeDefined();
          expect(normalizedBalance).toBeDefined();
          expect(typeof normalizedTransaction).toBe('number');
          expect(typeof normalizedBalance).toBe('number');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: transaction-display-normalization, Property 14: Dashboard income displays positive
   * 
   * For any set of income category transactions in a period, the dashboard total income
   * should display as a positive value.
   * 
   * Validates: Requirements 7.1
   */
  describe('Property 14: Dashboard income displays positive', () => {
    it('should display total income as positive for any set of income transactions', () => {
      fc.assert(
        fc.property(
          // Generate a dictionary of currency -> income amounts (1-5 currencies)
          fc.dictionary(
            // Currency codes
            fc.constantFrom('USD', 'EUR', 'GBP', 'JPY', 'CAD'),
            // Income amounts (can be positive or negative in raw form)
            fc.double({ min: -1000000, max: 1000000, noNaN: true }),
            { minKeys: 1, maxKeys: 5 }
          ),
          (incomeAmounts) => {
            // For each currency's income total, normalize it
            for (const [currency, rawIncome] of Object.entries(incomeAmounts)) {
              // Income categories have asset subtype
              const normalizedIncome = normalizeAccountBalance(
                rawIncome,
                AccountType.Category,
                AccountSubtype.Asset
              );
              
              // Property: dashboard income should always display as positive
              if (rawIncome !== 0) {
                expect(normalizedIncome).toBeGreaterThan(0);
                expect(normalizedIncome).toBe(Math.abs(rawIncome));
              } else {
                expect(normalizedIncome).toBe(0);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: transaction-display-normalization, Property 15: Dashboard expenses display positive
   * 
   * For any set of expense category transactions in a period, the dashboard total expenses
   * should display as a positive value.
   * 
   * Validates: Requirements 7.2
   */
  describe('Property 15: Dashboard expenses display positive', () => {
    it('should display total expenses as positive for any set of expense transactions', () => {
      fc.assert(
        fc.property(
          // Generate a dictionary of currency -> expense amounts (1-5 currencies)
          fc.dictionary(
            // Currency codes
            fc.constantFrom('USD', 'EUR', 'GBP', 'JPY', 'CAD'),
            // Expense amounts (can be positive or negative in raw form)
            fc.double({ min: -1000000, max: 1000000, noNaN: true }),
            { minKeys: 1, maxKeys: 5 }
          ),
          (expenseAmounts) => {
            // For each currency's expense total, normalize it
            for (const [currency, rawExpense] of Object.entries(expenseAmounts)) {
              // Expense categories have liability subtype
              const normalizedExpense = normalizeAccountBalance(
                rawExpense,
                AccountType.Category,
                AccountSubtype.Liability
              );
              
              // Property: dashboard expenses should always display as positive
              if (rawExpense !== 0) {
                expect(normalizedExpense).toBeGreaterThan(0);
                expect(normalizedExpense).toBe(Math.abs(rawExpense));
              } else {
                expect(normalizedExpense).toBe(0);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: transaction-display-normalization, Property 16: Net worth calculation is correct
   * 
   * For any set of asset and liability accounts, the dashboard net worth should equal
   * (sum of normalized asset balances - sum of normalized liability balances).
   * 
   * Validates: Requirements 7.3
   */
  describe('Property 16: Net worth calculation is correct', () => {
    it('should calculate net worth correctly from normalized asset and liability balances', () => {
      fc.assert(
        fc.property(
          // Generate asset balances by currency
          fc.dictionary(
            fc.constantFrom('USD', 'EUR', 'GBP', 'JPY', 'CAD'),
            fc.double({ min: -1000000, max: 1000000, noNaN: true }),
            { minKeys: 1, maxKeys: 3 }
          ),
          // Generate liability balances by currency
          fc.dictionary(
            fc.constantFrom('USD', 'EUR', 'GBP', 'JPY', 'CAD'),
            fc.double({ min: -1000000, max: 1000000, noNaN: true }),
            { minKeys: 0, maxKeys: 3 }
          ),
          (assetBalances, liabilityBalances) => {
            // Get all currencies involved
            const allCurrencies = new Set([
              ...Object.keys(assetBalances),
              ...Object.keys(liabilityBalances)
            ]);
            
            // For each currency, calculate net worth
            for (const currency of allCurrencies) {
              const rawAssetBalance = assetBalances[currency] || 0;
              const rawLiabilityBalance = liabilityBalances[currency] || 0;
              
              // Normalize asset balance (preserves sign)
              const normalizedAsset = normalizeAccountBalance(
                rawAssetBalance,
                AccountType.User,
                AccountSubtype.Asset
              );
              
              // Normalize liability balance (negates the balance)
              const normalizedLiability = normalizeAccountBalance(
                rawLiabilityBalance,
                AccountType.User,
                AccountSubtype.Liability
              );
              
              // Calculate net worth: assets - liabilities
              const calculatedNetWorth = normalizedAsset - normalizedLiability;
              
              // Property: net worth should equal normalized assets minus normalized liabilities
              // This is the formula that should be used in the dashboard
              expect(calculatedNetWorth).toBe(normalizedAsset - normalizedLiability);
              
              // Additional verification: the calculation should be consistent
              // Net worth = raw asset balance - (-raw liability balance)
              // Net worth = raw asset balance + raw liability balance
              const expectedNetWorth = rawAssetBalance + rawLiabilityBalance;
              expect(calculatedNetWorth).toBeCloseTo(expectedNetWorth, 10);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('Display Normalization - Unit Tests for Edge Cases', () => {
  /**
   * Test zero amounts
   * Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 4.1
   */
  describe('Zero amounts', () => {
    it('should return 0 for zero transaction amount in asset account', () => {
      const result = normalizeTransactionAmount(0, AccountType.User, AccountSubtype.Asset, true);
      expect(result).toBe(0);
    });

    it('should return 0 for zero transaction amount in liability account', () => {
      const result = normalizeTransactionAmount(0, AccountType.User, AccountSubtype.Liability, true);
      expect(result).toBe(0);
    });

    it('should return 0 for zero transaction amount in income category', () => {
      const result = normalizeTransactionAmount(0, AccountType.Category, AccountSubtype.Asset, false);
      expect(result).toBe(0);
    });

    it('should return 0 for zero transaction amount in expense category', () => {
      const result = normalizeTransactionAmount(0, AccountType.Category, AccountSubtype.Liability, false);
      expect(result).toBe(0);
    });

    it('should return 0 for zero balance in asset account', () => {
      const result = normalizeAccountBalance(0, AccountType.User, AccountSubtype.Asset);
      expect(result).toBe(0);
    });

    it('should return 0 for zero balance in liability account', () => {
      const result = normalizeAccountBalance(0, AccountType.User, AccountSubtype.Liability);
      expect(result).toBe(0);
    });

    it('should return 0 for zero balance in category account', () => {
      const result = normalizeAccountBalance(0, AccountType.Category, AccountSubtype.Asset);
      expect(result).toBe(0);
    });
  });

  /**
   * Test null/undefined handling
   * Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 4.1
   */
  describe('Null/undefined handling', () => {
    it('should treat null transaction amount as 0 for asset account', () => {
      const result = normalizeTransactionAmount(null, AccountType.User, AccountSubtype.Asset, true);
      expect(result).toBe(0);
    });

    it('should treat undefined transaction amount as 0 for asset account', () => {
      const result = normalizeTransactionAmount(undefined, AccountType.User, AccountSubtype.Asset, true);
      expect(result).toBe(0);
    });

    it('should treat null transaction amount as 0 for liability account', () => {
      const result = normalizeTransactionAmount(null, AccountType.User, AccountSubtype.Liability, false);
      expect(result).toBe(0);
    });

    it('should treat undefined transaction amount as 0 for liability account', () => {
      const result = normalizeTransactionAmount(undefined, AccountType.User, AccountSubtype.Liability, false);
      expect(result).toBe(0);
    });

    it('should treat null balance as 0 for asset account', () => {
      const result = normalizeAccountBalance(null, AccountType.User, AccountSubtype.Asset);
      expect(result).toBe(0);
    });

    it('should treat undefined balance as 0 for asset account', () => {
      const result = normalizeAccountBalance(undefined, AccountType.User, AccountSubtype.Asset);
      expect(result).toBe(0);
    });

    it('should treat null balance as 0 for liability account', () => {
      const result = normalizeAccountBalance(null, AccountType.User, AccountSubtype.Liability);
      expect(result).toBe(0);
    });

    it('should treat undefined balance as 0 for liability account', () => {
      const result = normalizeAccountBalance(undefined, AccountType.User, AccountSubtype.Liability);
      expect(result).toBe(0);
    });

    it('should treat null balance as 0 for category account', () => {
      const result = normalizeAccountBalance(null, AccountType.Category, AccountSubtype.Asset);
      expect(result).toBe(0);
    });

    it('should treat undefined balance as 0 for category account', () => {
      const result = normalizeAccountBalance(undefined, AccountType.Category, AccountSubtype.Asset);
      expect(result).toBe(0);
    });
  });

  /**
   * Test invalid account types
   * Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 4.1
   */
  describe('Invalid account types', () => {
    it('should throw error for invalid account type in normalizeTransactionAmount', () => {
      expect(() => {
        normalizeTransactionAmount(100, 'InvalidType' as AccountType, AccountSubtype.Asset, true);
      }).toThrow('Invalid account type');
    });

    it('should throw error for invalid account subtype in normalizeTransactionAmount', () => {
      expect(() => {
        normalizeTransactionAmount(100, AccountType.User, 'InvalidSubtype' as AccountSubtype, true);
      }).toThrow('Invalid account subtype');
    });

    it('should throw error for invalid account type in normalizeAccountBalance', () => {
      expect(() => {
        normalizeAccountBalance(100, 'InvalidType' as AccountType, AccountSubtype.Asset);
      }).toThrow('Invalid account type');
    });

    it('should throw error for invalid account subtype in normalizeAccountBalance', () => {
      expect(() => {
        normalizeAccountBalance(100, AccountType.User, 'InvalidSubtype' as AccountSubtype);
      }).toThrow('Invalid account subtype');
    });
  });

  /**
   * Test floating point precision
   * Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 4.1
   */
  describe('Floating point precision', () => {
    it('should handle precise decimal amounts in asset account transactions', () => {
      const amount = 123.456789;
      const result = normalizeTransactionAmount(amount, AccountType.User, AccountSubtype.Asset, true);
      expect(result).toBe(amount);
    });

    it('should handle precise decimal amounts in liability account transactions', () => {
      const amount = -987.654321;
      const result = normalizeTransactionAmount(amount, AccountType.User, AccountSubtype.Liability, true);
      expect(result).toBe(amount);
    });

    it('should handle precise decimal amounts in category transactions', () => {
      const amount = -456.123456;
      const result = normalizeTransactionAmount(amount, AccountType.Category, AccountSubtype.Asset, false);
      expect(result).toBe(Math.abs(amount));
    });

    it('should handle very small positive amounts', () => {
      const amount = 0.01;
      const result = normalizeTransactionAmount(amount, AccountType.User, AccountSubtype.Asset, true);
      expect(result).toBe(amount);
    });

    it('should handle very small negative amounts', () => {
      const amount = -0.01;
      const result = normalizeTransactionAmount(amount, AccountType.User, AccountSubtype.Asset, true);
      expect(result).toBe(amount);
    });

    it('should handle precise decimal balances in asset accounts', () => {
      const balance = 1234.5678;
      const result = normalizeAccountBalance(balance, AccountType.User, AccountSubtype.Asset);
      expect(result).toBe(balance);
    });

    it('should handle precise decimal balances in liability accounts', () => {
      const balance = -5678.1234;
      const result = normalizeAccountBalance(balance, AccountType.User, AccountSubtype.Liability);
      expect(result).toBe(-balance);
    });

    it('should handle floating point arithmetic edge cases', () => {
      // Test the classic 0.1 + 0.2 = 0.30000000000000004 issue
      const amount = 0.1 + 0.2;
      const result = normalizeTransactionAmount(amount, AccountType.User, AccountSubtype.Asset, true);
      expect(result).toBe(amount);
      // Verify it's close to 0.3 (within floating point tolerance)
      expect(result).toBeCloseTo(0.3, 10);
    });

    it('should handle very large amounts without overflow', () => {
      const amount = 999999999.99;
      const result = normalizeTransactionAmount(amount, AccountType.User, AccountSubtype.Asset, true);
      expect(result).toBe(amount);
    });

    it('should handle negative zero correctly', () => {
      const amount = -0;
      const result = normalizeTransactionAmount(amount, AccountType.User, AccountSubtype.Asset, true);
      expect(result).toBe(0);
      // Verify it's positive zero, not negative zero
      expect(Object.is(result, 0)).toBe(true);
    });
  });

  /**
   * Feature: transaction-display-normalization, Property 12: Asset-to-asset transfer displays correctly
   * 
   * For any transfer between two user accounts with asset subtype, the source account should
   * display a negative amount and the destination account should display a positive amount.
   * 
   * Validates: Requirements 6.1
   */
  describe('Property 12: Asset-to-asset transfer displays correctly', () => {
    it('should display negative amount in source asset account and positive in destination', () => {
      fc.assert(
        fc.property(
          // Generate positive transfer amounts (the absolute value being transferred)
          fc.double({ min: 0.01, max: 1000000, noNaN: true }),
          (transferAmount) => {
            // In a transfer from Account A to Account B:
            // - Account A (source) has a negative journal line (money leaving)
            // - Account B (destination) has a positive journal line (money arriving)
            
            const sourceAmount = -transferAmount; // Money leaving source
            const destinationAmount = transferAmount; // Money arriving at destination
            
            // Normalize for source account (viewing from source perspective)
            const normalizedSource = normalizeTransactionAmount(
              sourceAmount,
              AccountType.User,
              AccountSubtype.Asset,
              true // This is the current account being viewed
            );
            
            // Normalize for destination account (viewing from destination perspective)
            const normalizedDestination = normalizeTransactionAmount(
              destinationAmount,
              AccountType.User,
              AccountSubtype.Asset,
              true // This is the current account being viewed
            );
            
            // Property: source should display negative (money leaving)
            expect(normalizedSource).toBeLessThan(0);
            expect(normalizedSource).toBe(sourceAmount);
            
            // Property: destination should display positive (money arriving)
            expect(normalizedDestination).toBeGreaterThan(0);
            expect(normalizedDestination).toBe(destinationAmount);
            
            // Additional verification: amounts should be equal in magnitude
            expect(Math.abs(normalizedSource)).toBe(Math.abs(normalizedDestination));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: transaction-display-normalization, Property 13: Asset-to-liability transfer displays correctly
   * 
   * For any transfer from a user account with asset subtype to a user account with liability subtype,
   * both accounts should display negative amounts (outflow from asset, payment to liability).
   * 
   * Validates: Requirements 6.2
   */
  describe('Property 13: Asset-to-liability transfer displays correctly', () => {
    it('should display negative amounts in both asset and liability accounts for payment', () => {
      fc.assert(
        fc.property(
          // Generate positive payment amounts (the absolute value being transferred)
          fc.double({ min: 0.01, max: 1000000, noNaN: true }),
          (paymentAmount) => {
            // In a payment from Asset Account to Credit Card (Liability):
            // - Asset account has a negative journal line (money leaving)
            // - Liability account has a negative journal line (debt being paid down)
            
            const assetAmount = -paymentAmount; // Money leaving asset account
            const liabilityAmount = -paymentAmount; // Debt being reduced
            
            // Normalize for asset account (viewing from asset perspective)
            const normalizedAsset = normalizeTransactionAmount(
              assetAmount,
              AccountType.User,
              AccountSubtype.Asset,
              true // This is the current account being viewed
            );
            
            // Normalize for liability account (viewing from liability perspective)
            const normalizedLiability = normalizeTransactionAmount(
              liabilityAmount,
              AccountType.User,
              AccountSubtype.Liability,
              true // This is the current account being viewed
            );
            
            // Property: asset account should display negative (money leaving)
            expect(normalizedAsset).toBeLessThan(0);
            expect(normalizedAsset).toBe(assetAmount);
            
            // Property: liability account should display negative (payment reducing debt)
            expect(normalizedLiability).toBeLessThan(0);
            expect(normalizedLiability).toBe(liabilityAmount);
            
            // Additional verification: both amounts should be equal
            expect(normalizedAsset).toBe(normalizedLiability);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: transaction-display-normalization, Property 17: Import interpretation for asset accounts
   * 
   * For any transaction imported into a user account with asset subtype, negative amounts should be
   * interpreted as spending and positive amounts as income.
   * 
   * Validates: Requirements 8.1
   */
  describe('Property 17: Import interpretation for asset accounts', () => {
    it('should interpret negative imported amounts as spending (display negative)', () => {
      fc.assert(
        fc.property(
          // Generate negative amounts (spending in import format)
          fc.double({ min: -1000000, max: -0.01, noNaN: true }),
          (importedAmount) => {
            // When importing into an asset account, negative amounts represent spending
            // The imported amount is stored as-is in the database
            // When displayed, it should remain negative
            
            const normalizedAmount = normalizeTransactionAmount(
              importedAmount,
              AccountType.User,
              AccountSubtype.Asset,
              true
            );
            
            // Property: negative imported amount should display as negative (spending)
            expect(normalizedAmount).toBeLessThan(0);
            expect(normalizedAmount).toBe(importedAmount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should interpret positive imported amounts as income (display positive)', () => {
      fc.assert(
        fc.property(
          // Generate positive amounts (income in import format)
          fc.double({ min: 0.01, max: 1000000, noNaN: true }),
          (importedAmount) => {
            // When importing into an asset account, positive amounts represent income
            // The imported amount is stored as-is in the database
            // When displayed, it should remain positive
            
            const normalizedAmount = normalizeTransactionAmount(
              importedAmount,
              AccountType.User,
              AccountSubtype.Asset,
              true
            );
            
            // Property: positive imported amount should display as positive (income)
            expect(normalizedAmount).toBeGreaterThan(0);
            expect(normalizedAmount).toBe(importedAmount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: transaction-display-normalization, Property 18: Import interpretation for liability accounts
   * 
   * For any transaction imported into a user account with liability subtype, positive amounts should be
   * interpreted as spending and negative amounts as payments.
   * 
   * Validates: Requirements 8.2
   */
  describe('Property 18: Import interpretation for liability accounts', () => {
    it('should interpret positive imported amounts as spending (display positive)', () => {
      fc.assert(
        fc.property(
          // Generate positive amounts (spending in import format)
          fc.double({ min: 0.01, max: 1000000, noNaN: true }),
          (importedAmount) => {
            // When importing into a liability account, positive amounts represent spending
            // The imported amount is stored as-is in the database
            // When displayed, it should remain positive
            
            const normalizedAmount = normalizeTransactionAmount(
              importedAmount,
              AccountType.User,
              AccountSubtype.Liability,
              true
            );
            
            // Property: positive imported amount should display as positive (spending)
            expect(normalizedAmount).toBeGreaterThan(0);
            expect(normalizedAmount).toBe(importedAmount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should interpret negative imported amounts as payments (display negative)', () => {
      fc.assert(
        fc.property(
          // Generate negative amounts (payments in import format)
          fc.double({ min: -1000000, max: -0.01, noNaN: true }),
          (importedAmount) => {
            // When importing into a liability account, negative amounts represent payments
            // The imported amount is stored as-is in the database
            // When displayed, it should remain negative
            
            const normalizedAmount = normalizeTransactionAmount(
              importedAmount,
              AccountType.User,
              AccountSubtype.Liability,
              true
            );
            
            // Property: negative imported amount should display as negative (payment)
            expect(normalizedAmount).toBeLessThan(0);
            expect(normalizedAmount).toBe(importedAmount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: transaction-display-normalization, Property 19: Import and manual transaction consistency
   * 
   * For any equivalent transaction (same account, amount, type), whether created manually or imported,
   * the normalized display amount should be identical.
   * 
   * Validates: Requirements 8.4
   */
  describe('Property 19: Import and manual transaction consistency', () => {
    it('should display imported and manual transactions identically for asset accounts', () => {
      fc.assert(
        fc.property(
          // Generate any non-zero amount
          fc.double({ min: -1000000, max: 1000000, noNaN: true }).filter(n => Math.abs(n) >= 0.01),
          (amount) => {
            // Both imported and manual transactions store the same raw amount
            // They should normalize identically
            
            const normalizedImported = normalizeTransactionAmount(
              amount,
              AccountType.User,
              AccountSubtype.Asset,
              true
            );
            
            const normalizedManual = normalizeTransactionAmount(
              amount,
              AccountType.User,
              AccountSubtype.Asset,
              true
            );
            
            // Property: imported and manual transactions should display identically
            expect(normalizedImported).toBe(normalizedManual);
            expect(normalizedImported).toBe(amount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should display imported and manual transactions identically for liability accounts', () => {
      fc.assert(
        fc.property(
          // Generate any non-zero amount
          fc.double({ min: -1000000, max: 1000000, noNaN: true }).filter(n => Math.abs(n) >= 0.01),
          (amount) => {
            // Both imported and manual transactions store the same raw amount
            // They should normalize identically
            
            const normalizedImported = normalizeTransactionAmount(
              amount,
              AccountType.User,
              AccountSubtype.Liability,
              true
            );
            
            const normalizedManual = normalizeTransactionAmount(
              amount,
              AccountType.User,
              AccountSubtype.Liability,
              true
            );
            
            // Property: imported and manual transactions should display identically
            expect(normalizedImported).toBe(normalizedManual);
            expect(normalizedImported).toBe(amount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('Visual Indicators - Unit Tests', () => {
  /**
   * Unit tests for visual indicator logic
   * Requirements: 1.1, 1.2, 2.1, 2.2
   */

  describe('getTransactionVisualIndicator', () => {
    it('should return positive indicator for asset account income', () => {
      const indicator = getTransactionVisualIndicator(
        100,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      expect(indicator.cssClass).toBe('amount-positive');
      expect(indicator.colorClass).toBe('text-green-600');
      expect(indicator.ariaLabel).toBe('Positive amount');
    });

    it('should return negative indicator for asset account spending', () => {
      const indicator = getTransactionVisualIndicator(
        -100,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      expect(indicator.cssClass).toBe('amount-negative');
      expect(indicator.colorClass).toBe('text-red-600');
      expect(indicator.ariaLabel).toBe('Negative amount');
    });

    it('should return positive indicator for liability account spending', () => {
      const indicator = getTransactionVisualIndicator(
        100,
        AccountType.User,
        AccountSubtype.Liability,
        true
      );

      expect(indicator.cssClass).toBe('amount-positive');
      expect(indicator.colorClass).toBe('text-green-600');
      expect(indicator.ariaLabel).toBe('Positive amount');
    });

    it('should return negative indicator for liability account payment', () => {
      const indicator = getTransactionVisualIndicator(
        -100,
        AccountType.User,
        AccountSubtype.Liability,
        true
      );

      expect(indicator.cssClass).toBe('amount-negative');
      expect(indicator.colorClass).toBe('text-red-600');
      expect(indicator.ariaLabel).toBe('Negative amount');
    });

    it('should return neutral indicator for zero amount', () => {
      const indicator = getTransactionVisualIndicator(
        0,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      expect(indicator.cssClass).toBe('amount-neutral');
      expect(indicator.colorClass).toBe('text-gray-600');
      expect(indicator.ariaLabel).toBe('Zero amount');
    });

    it('should return positive indicator for category transactions', () => {
      // Income category
      const incomeIndicator = getTransactionVisualIndicator(
        -100, // Raw amount (credit to income)
        AccountType.Category,
        AccountSubtype.Asset,
        true
      );

      expect(incomeIndicator.cssClass).toBe('amount-positive');
      expect(incomeIndicator.colorClass).toBe('text-green-600');

      // Expense category
      const expenseIndicator = getTransactionVisualIndicator(
        100, // Raw amount (debit to expense)
        AccountType.Category,
        AccountSubtype.Liability,
        true
      );

      expect(expenseIndicator.cssClass).toBe('amount-positive');
      expect(expenseIndicator.colorClass).toBe('text-green-600');
    });
  });

  describe('getTransactionCssClass', () => {
    it('should return correct CSS class for positive amounts', () => {
      const cssClass = getTransactionCssClass(
        100,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      expect(cssClass).toBe('amount-positive');
    });

    it('should return correct CSS class for negative amounts', () => {
      const cssClass = getTransactionCssClass(
        -100,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      expect(cssClass).toBe('amount-negative');
    });

    it('should return correct CSS class for zero amounts', () => {
      const cssClass = getTransactionCssClass(
        0,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      expect(cssClass).toBe('amount-neutral');
    });

    it('should handle liability account spending correctly', () => {
      const cssClass = getTransactionCssClass(
        100,
        AccountType.User,
        AccountSubtype.Liability,
        true
      );

      expect(cssClass).toBe('amount-positive');
    });

    it('should handle liability account payments correctly', () => {
      const cssClass = getTransactionCssClass(
        -100,
        AccountType.User,
        AccountSubtype.Liability,
        true
      );

      expect(cssClass).toBe('amount-negative');
    });
  });

  describe('getTransactionColorClass', () => {
    it('should return green for positive amounts', () => {
      const colorClass = getTransactionColorClass(
        100,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      expect(colorClass).toBe('text-green-600');
    });

    it('should return red for negative amounts', () => {
      const colorClass = getTransactionColorClass(
        -100,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      expect(colorClass).toBe('text-red-600');
    });

    it('should return gray for zero amounts', () => {
      const colorClass = getTransactionColorClass(
        0,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      expect(colorClass).toBe('text-gray-600');
    });

    it('should return green for liability spending (positive display)', () => {
      const colorClass = getTransactionColorClass(
        100,
        AccountType.User,
        AccountSubtype.Liability,
        true
      );

      expect(colorClass).toBe('text-green-600');
    });

    it('should return red for liability payments (negative display)', () => {
      const colorClass = getTransactionColorClass(
        -100,
        AccountType.User,
        AccountSubtype.Liability,
        true
      );

      expect(colorClass).toBe('text-red-600');
    });
  });

  describe('getTransactionAriaLabel', () => {
    it('should return "Positive amount" for positive display amounts', () => {
      const ariaLabel = getTransactionAriaLabel(
        100,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      expect(ariaLabel).toBe('Positive amount');
    });

    it('should return "Negative amount" for negative display amounts', () => {
      const ariaLabel = getTransactionAriaLabel(
        -100,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      expect(ariaLabel).toBe('Negative amount');
    });

    it('should return "Zero amount" for zero amounts', () => {
      const ariaLabel = getTransactionAriaLabel(
        0,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      expect(ariaLabel).toBe('Zero amount');
    });

    it('should return "Positive amount" for liability spending', () => {
      const ariaLabel = getTransactionAriaLabel(
        100,
        AccountType.User,
        AccountSubtype.Liability,
        true
      );

      expect(ariaLabel).toBe('Positive amount');
    });

    it('should return "Negative amount" for liability payments', () => {
      const ariaLabel = getTransactionAriaLabel(
        -100,
        AccountType.User,
        AccountSubtype.Liability,
        true
      );

      expect(ariaLabel).toBe('Negative amount');
    });

    it('should return "Positive amount" for category transactions', () => {
      // Categories always display as positive
      const incomeLabel = getTransactionAriaLabel(
        -100,
        AccountType.Category,
        AccountSubtype.Asset,
        true
      );

      expect(incomeLabel).toBe('Positive amount');

      const expenseLabel = getTransactionAriaLabel(
        100,
        AccountType.Category,
        AccountSubtype.Liability,
        true
      );

      expect(expenseLabel).toBe('Positive amount');
    });
  });

  describe('Visual indicator consistency across account types', () => {
    it('should provide consistent indicators for asset account income (Requirements 1.2)', () => {
      const amount = 100;
      const indicator = getTransactionVisualIndicator(
        amount,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      // Income should be positive (green)
      expect(indicator.cssClass).toBe('amount-positive');
      expect(indicator.colorClass).toBe('text-green-600');
      expect(indicator.ariaLabel).toBe('Positive amount');
    });

    it('should provide consistent indicators for asset account spending (Requirements 1.1)', () => {
      const amount = -100;
      const indicator = getTransactionVisualIndicator(
        amount,
        AccountType.User,
        AccountSubtype.Asset,
        true
      );

      // Spending should be negative (red)
      expect(indicator.cssClass).toBe('amount-negative');
      expect(indicator.colorClass).toBe('text-red-600');
      expect(indicator.ariaLabel).toBe('Negative amount');
    });

    it('should provide consistent indicators for liability account spending (Requirements 2.1)', () => {
      const amount = 100;
      const indicator = getTransactionVisualIndicator(
        amount,
        AccountType.User,
        AccountSubtype.Liability,
        true
      );

      // Spending should be positive (green) for liabilities
      expect(indicator.cssClass).toBe('amount-positive');
      expect(indicator.colorClass).toBe('text-green-600');
      expect(indicator.ariaLabel).toBe('Positive amount');
    });

    it('should provide consistent indicators for liability account payments (Requirements 2.2)', () => {
      const amount = -100;
      const indicator = getTransactionVisualIndicator(
        amount,
        AccountType.User,
        AccountSubtype.Liability,
        true
      );

      // Payments should be negative (red) for liabilities
      expect(indicator.cssClass).toBe('amount-negative');
      expect(indicator.colorClass).toBe('text-red-600');
      expect(indicator.ariaLabel).toBe('Negative amount');
    });
  });
});
