/**
 * Unit tests for currency utilities with normalization support
 */

import { describe, it, expect } from 'vitest';
import {
  formatNormalizedTransactionAmount,
  formatNormalizedBalance,
  formatCurrencyAmount,
  formatCurrencyAmountDetail,
  getCurrencySymbol,
} from './currencyUtils';
import { AccountType, AccountSubtype } from '../../shared/accountTypes';

describe('currencyUtils - Normalized Formatting', () => {
  describe('formatNormalizedTransactionAmount', () => {
    // Requirements 1.1, 1.2: Asset account transaction formatting
    describe('Asset account transactions', () => {
      it('should format spending (negative) with negative sign for asset accounts', () => {
        const result = formatNormalizedTransactionAmount(
          -100.50,
          'USD',
          AccountType.User,
          AccountSubtype.Asset,
          true
        );
        expect(result).toMatch(/-\D*100\.50/);
        expect(result).toContain('$');
      });

      it('should format income (positive) with positive sign for asset accounts', () => {
        const result = formatNormalizedTransactionAmount(
          250.75,
          'USD',
          AccountType.User,
          AccountSubtype.Asset,
          true
        );
        expect(result).not.toContain('-');
        expect(result).toContain('250.75');
        expect(result).toContain('$');
      });

      it('should format zero amounts correctly for asset accounts', () => {
        const result = formatNormalizedTransactionAmount(
          0,
          'USD',
          AccountType.User,
          AccountSubtype.Asset,
          true
        );
        expect(result).toContain('0.00');
        expect(result).not.toContain('-');
      });
    });

    // Requirements 2.1, 2.2: Liability account transaction formatting
    describe('Liability account transactions', () => {
      it('should format spending (raw negative) with positive sign for liability accounts', () => {
        const result = formatNormalizedTransactionAmount(
          -150.25,
          'USD',
          AccountType.User,
          AccountSubtype.Liability,
          true
        );
        expect(result).not.toContain('-');
        expect(result).toContain('150.25');
        expect(result).toContain('$');
      });

      it('should format payments (raw positive) with negative sign for liability accounts', () => {
        const result = formatNormalizedTransactionAmount(
          200.00,
          'USD',
          AccountType.User,
          AccountSubtype.Liability,
          true
        );
        expect(result).toMatch(/-\D*200\.00/);
        expect(result).toContain('$');
      });

      it('should format zero amounts correctly for liability accounts', () => {
        const result = formatNormalizedTransactionAmount(
          0,
          'USD',
          AccountType.User,
          AccountSubtype.Liability,
          true
        );
        expect(result).toContain('0.00');
        expect(result).not.toContain('-');
      });
    });

    // Currency symbol and code display
    describe('Currency symbol and code display', () => {
      it('should display currency symbol when available', () => {
        const result = formatNormalizedTransactionAmount(
          100,
          'USD',
          AccountType.User,
          AccountSubtype.Asset,
          true
        );
        expect(result).toContain('$');
      });

      it('should display currency code when symbol not available', () => {
        const result = formatNormalizedTransactionAmount(
          100,
          'XYZ',
          AccountType.User,
          AccountSubtype.Asset,
          true
        );
        expect(result).toContain('XYZ');
      });

      it('should respect showSymbol option', () => {
        const result = formatNormalizedTransactionAmount(
          100,
          'USD',
          AccountType.User,
          AccountSubtype.Asset,
          true,
          { preset: 'code' }
        );
        expect(result).not.toContain('$');
        expect(result).toContain('USD');
      });

      it('should format EUR with euro symbol', () => {
        const result = formatNormalizedTransactionAmount(
          100,
          'EUR',
          AccountType.User,
          AccountSubtype.Asset,
          true
        );
        expect(result).toContain('€');
      });

      it('should format GBP with pound symbol', () => {
        const result = formatNormalizedTransactionAmount(
          100,
          'GBP',
          AccountType.User,
          AccountSubtype.Asset,
          true
        );
        expect(result).toContain('£');
      });
    });

    // Sign handling in formatted output
    describe('Sign handling in formatted output', () => {
      it('should preserve negative sign for asset spending', () => {
        const result = formatNormalizedTransactionAmount(
          -50.00,
          'USD',
          AccountType.User,
          AccountSubtype.Asset,
          true
        );
        expect(result).toMatch(/-.*50\.00/);
      });

      it('should not add positive sign for asset income', () => {
        const result = formatNormalizedTransactionAmount(
          50.00,
          'USD',
          AccountType.User,
          AccountSubtype.Asset,
          true
        );
        expect(result).not.toContain('+');
        expect(result).not.toContain('-');
      });

      it('should preserve negative sign for liability payments', () => {
        const result = formatNormalizedTransactionAmount(
          75.50,
          'USD',
          AccountType.User,
          AccountSubtype.Liability,
          true
        );
        expect(result).toMatch(/-.*75\.50/);
      });

      it('should handle large negative amounts correctly', () => {
        const result = formatNormalizedTransactionAmount(
          -1234567.89,
          'USD',
          AccountType.User,
          AccountSubtype.Asset,
          true
        );
        expect(result).toContain('-');
        expect(result).toContain('1,234,567.89');
      });
    });

    // Category accounts always show positive
    describe('Category account transactions', () => {
      it('should format income category transactions as positive', () => {
        const result = formatNormalizedTransactionAmount(
          -100,
          'USD',
          AccountType.Category,
          AccountSubtype.Asset,
          true
        );
        expect(result).not.toContain('-');
        expect(result).toContain('100.00');
      });

      it('should format expense category transactions as positive', () => {
        const result = formatNormalizedTransactionAmount(
          100,
          'USD',
          AccountType.Category,
          AccountSubtype.Liability,
          true
        );
        expect(result).not.toContain('-');
        expect(result).toContain('100.00');
      });
    });
  });

  describe('formatNormalizedBalance', () => {
    // Requirements 1.5: Asset account balance formatting
    describe('Asset account balances', () => {
      it('should format positive balance with positive sign for asset accounts', () => {
        const result = formatNormalizedBalance(
          1500.00,
          'USD',
          AccountType.User,
          AccountSubtype.Asset
        );
        expect(result).not.toContain('-');
        expect(result).toContain('1,500.00');
        expect(result).toContain('$');
      });

      it('should format negative balance (overdrawn) with negative sign for asset accounts', () => {
        const result = formatNormalizedBalance(
          -250.50,
          'USD',
          AccountType.User,
          AccountSubtype.Asset
        );
        expect(result).toMatch(/-\D*250\.50/);
        expect(result).toContain('$');
      });

      it('should format zero balance correctly for asset accounts', () => {
        const result = formatNormalizedBalance(
          0,
          'USD',
          AccountType.User,
          AccountSubtype.Asset
        );
        expect(result).toContain('0.00');
        expect(result).not.toContain('-');
      });
    });

    // Requirements 2.3, 2.4: Liability account balance formatting
    describe('Liability account balances', () => {
      it('should format negative balance (owed) as positive for liability accounts', () => {
        const result = formatNormalizedBalance(
          -500.00,
          'USD',
          AccountType.User,
          AccountSubtype.Liability
        );
        expect(result).not.toContain('-');
        expect(result).toContain('500.00');
        expect(result).toContain('$');
      });

      it('should format positive balance (credit) as negative for liability accounts', () => {
        const result = formatNormalizedBalance(
          100.00,
          'USD',
          AccountType.User,
          AccountSubtype.Liability
        );
        expect(result).toMatch(/-\D*100\.00/);
        expect(result).toContain('$');
      });

      it('should format zero balance correctly for liability accounts', () => {
        const result = formatNormalizedBalance(
          0,
          'USD',
          AccountType.User,
          AccountSubtype.Liability
        );
        expect(result).toContain('0.00');
        expect(result).not.toContain('-');
      });
    });

    // Currency symbol and code display
    describe('Currency symbol and code display', () => {
      it('should display currency symbol when available', () => {
        const result = formatNormalizedBalance(
          1000,
          'USD',
          AccountType.User,
          AccountSubtype.Asset
        );
        expect(result).toContain('$');
      });

      it('should respect formatting options', () => {
        const result = formatNormalizedBalance(
          1000,
          'USD',
          AccountType.User,
          AccountSubtype.Asset,
          { preset: 'code', decimals: 2 }
        );
        expect(result).not.toContain('$');
        expect(result).toContain('USD');
        expect(result).toContain('1,000.00');
      });

      it('should format with different decimal places', () => {
        const result = formatNormalizedBalance(
          1000.123,
          'USD',
          AccountType.User,
          AccountSubtype.Asset,
          { decimals: 3 }
        );
        expect(result).toContain('1,000.123');
      });
    });

    // Category balances always show positive
    describe('Category account balances', () => {
      it('should format income category balance as positive', () => {
        const result = formatNormalizedBalance(
          -500,
          'USD',
          AccountType.Category,
          AccountSubtype.Asset
        );
        expect(result).not.toContain('-');
        expect(result).toContain('500.00');
      });

      it('should format expense category balance as positive', () => {
        const result = formatNormalizedBalance(
          500,
          'USD',
          AccountType.Category,
          AccountSubtype.Liability
        );
        expect(result).not.toContain('-');
        expect(result).toContain('500.00');
      });
    });
  });

  // Test backward compatibility
  describe('Backward compatibility', () => {
    it('should not break existing formatCurrencyAmount function', () => {
      const result = formatCurrencyAmount(100.50, 'USD');
      expect(result).toContain('100.50');
      expect(result).toContain('$');
    });

    it('should not break existing getCurrencySymbol function', () => {
      expect(getCurrencySymbol('USD')).toBe('$');
      expect(getCurrencySymbol('EUR')).toBe('€');
      expect(getCurrencySymbol('GBP')).toBe('£');
    });

    it('uses code-first format in detail mode for USD', () => {
      const result = formatCurrencyAmountDetail(200, 'USD');

      expect(result).toContain('USD');
      expect(result).not.toContain('$200.00 USD');
    });

    it('uses code-first format in detail mode for CAD', () => {
      const result = formatCurrencyAmountDetail(-100, 'CAD');

      expect(result).toContain('CAD');
      expect(result).not.toContain('CA$');
    });

    it('formats negative symbol amounts with leading minus sign', () => {
      const result = formatCurrencyAmount(-100, 'USD');

      expect(result.startsWith('-')).toBe(true);
      expect(result).toContain('$');
      expect(result).not.toContain('$-');
    });
  });
});
