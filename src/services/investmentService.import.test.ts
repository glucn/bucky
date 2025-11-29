import { describe, it, expect, beforeEach } from 'vitest';
import { investmentService } from './investmentService';
import { databaseService } from './database';
import { resetTestDatabase } from './database.test.utils';

describe('Investment Transaction Import', () => {
  let portfolioId: string;
  let tradeCashId: string;

  beforeEach(async () => {
    await resetTestDatabase();

    // Create a test portfolio
    const portfolio = await investmentService.createInvestmentPortfolio('Test Portfolio', 'USD');
    portfolioId = portfolio.group.id;
    tradeCashId = portfolio.tradeCashAccount.id;

    // Add some cash to the portfolio
    const accounts = await databaseService.getAccounts();
    const cashAccount = accounts.find(acc => acc.name === 'Cash');
    if (cashAccount) {
      await investmentService.depositCash(
        portfolioId,
        10000,
        cashAccount.id,
        '2025-01-01',
        'Initial deposit'
      );
    }
  });

  describe('validateImportData', () => {
    it('should validate valid CSV data', async () => {
      const csvData = `Date,Type,Ticker,Quantity,Price,Amount,Fee
2025-01-15,buy,AAPL,10,150.00,1500.00,5.00
2025-01-20,sell,AAPL,5,155.00,775.00,5.00`;

      const result = await investmentService.validateImportData(csvData, {
        date: 'Date',
        type: 'Type',
        ticker: 'Ticker',
        quantity: 'Quantity',
        price: 'Price',
        amount: 'Amount',
        fee: 'Fee',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.rowCount).toBe(2);
    });

    it('should detect missing required columns', async () => {
      const csvData = `Date,Type,Ticker
2025-01-15,buy,AAPL`;

      const result = await investmentService.validateImportData(csvData, {
        date: 'Date',
        type: 'Type',
        ticker: 'Ticker',
        amount: 'Amount', // This column doesn't exist in CSV
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('amount');
    });

    it('should detect invalid date format', async () => {
      const csvData = `Date,Type,Ticker,Amount
invalid-date,buy,AAPL,1500.00`;

      const result = await investmentService.validateImportData(csvData, {
        date: 'Date',
        type: 'Type',
        ticker: 'Ticker',
        amount: 'Amount',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'date')).toBe(true);
    });

    it('should detect invalid transaction type', async () => {
      const csvData = `Date,Type,Ticker,Amount
2025-01-15,invalid_type,AAPL,1500.00`;

      const result = await investmentService.validateImportData(csvData, {
        date: 'Date',
        type: 'Type',
        ticker: 'Ticker',
        amount: 'Amount',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'type')).toBe(true);
    });

    it('should detect invalid amount', async () => {
      const csvData = `Date,Type,Ticker,Amount
2025-01-15,buy,AAPL,-100.00`;

      const result = await investmentService.validateImportData(csvData, {
        date: 'Date',
        type: 'Type',
        ticker: 'Ticker',
        amount: 'Amount',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'amount')).toBe(true);
    });

    it('should handle empty CSV data', async () => {
      const csvData = '';

      const result = await investmentService.validateImportData(csvData, {
        date: 'Date',
        type: 'Type',
        ticker: 'Ticker',
        amount: 'Amount',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toMatch(/empty|not found/i);
    });
  });

  describe('importInvestmentTransactions', () => {
    it('should import buy transactions', async () => {
      const csvData = `Date,Type,Ticker,Quantity,Price,Amount,Fee
2025-01-15,buy,AAPL,10,150.00,1500.00,5.00`;

      const result = await investmentService.importInvestmentTransactions(
        portfolioId,
        csvData,
        {
          date: 'Date',
          type: 'Type',
          ticker: 'Ticker',
          quantity: 'Quantity',
          price: 'Price',
          amount: 'Amount',
          fee: 'Fee',
        }
      );

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify the security account was created
      const securityAccount = await investmentService.getSecurityAccount(portfolioId, 'AAPL');
      expect(securityAccount).toBeDefined();
      expect(securityAccount.investmentProperties.quantity).toBe(10);
    });

    it('should import sell transactions', async () => {
      // First buy some shares
      await investmentService.recordBuy({
        portfolioId,
        tickerSymbol: 'AAPL',
        quantity: 10,
        pricePerShare: 150,
        date: '2025-01-10',
      });

      const csvData = `Date,Type,Ticker,Quantity,Price,Amount,Fee
2025-01-20,sell,AAPL,5,155.00,775.00,5.00`;

      const result = await investmentService.importInvestmentTransactions(
        portfolioId,
        csvData,
        {
          date: 'Date',
          type: 'Type',
          ticker: 'Ticker',
          quantity: 'Quantity',
          price: 'Price',
          amount: 'Amount',
          fee: 'Fee',
        }
      );

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify the quantity was reduced
      const securityAccount = await investmentService.getSecurityAccount(portfolioId, 'AAPL');
      expect(securityAccount.investmentProperties.quantity).toBe(5);
    });

    it('should import dividend transactions', async () => {
      const csvData = `Date,Type,Ticker,Amount
2025-01-25,dividend,AAPL,50.00`;

      const result = await investmentService.importInvestmentTransactions(
        portfolioId,
        csvData,
        {
          date: 'Date',
          type: 'Type',
          ticker: 'Ticker',
          amount: 'Amount',
        }
      );

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify cash balance increased
      const cashBalance = await databaseService.getAccountBalance(tradeCashId);
      expect(cashBalance).toBeGreaterThan(10000);
    });

    it('should import interest transactions', async () => {
      const csvData = `Date,Type,Ticker,Amount
2025-01-30,interest,CASH,25.00`;

      const result = await investmentService.importInvestmentTransactions(
        portfolioId,
        csvData,
        {
          date: 'Date',
          type: 'Type',
          ticker: 'Ticker',
          amount: 'Amount',
        }
      );

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should import fee transactions', async () => {
      const csvData = `Date,Type,Ticker,Amount
2025-02-01,fee,MGMT,15.00`;

      const result = await investmentService.importInvestmentTransactions(
        portfolioId,
        csvData,
        {
          date: 'Date',
          type: 'Type',
          ticker: 'Ticker',
          amount: 'Amount',
        }
      );

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify cash balance decreased
      const cashBalance = await databaseService.getAccountBalance(tradeCashId);
      expect(cashBalance).toBeLessThan(10000);
    });

    it('should detect and skip duplicate transactions', async () => {
      const csvData = `Date,Type,Ticker,Quantity,Price,Amount,Fee
2025-01-15,buy,AAPL,10,150.00,1500.00,5.00
2025-01-15,buy,AAPL,10,150.00,1500.00,5.00`;

      const result = await investmentService.importInvestmentTransactions(
        portfolioId,
        csvData,
        {
          date: 'Date',
          type: 'Type',
          ticker: 'Ticker',
          quantity: 'Quantity',
          price: 'Price',
          amount: 'Amount',
          fee: 'Fee',
        }
      );

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle multiple transaction types in one import', async () => {
      const csvData = `Date,Type,Ticker,Quantity,Price,Amount,Fee
2025-01-15,buy,AAPL,10,150.00,1500.00,5.00
2025-01-20,buy,MSFT,5,300.00,1500.00,5.00
2025-01-25,dividend,AAPL,,,50.00,
2025-01-30,interest,CASH,,,25.00,`;

      const result = await investmentService.importInvestmentTransactions(
        portfolioId,
        csvData,
        {
          date: 'Date',
          type: 'Type',
          ticker: 'Ticker',
          quantity: 'Quantity',
          price: 'Price',
          amount: 'Amount',
          fee: 'Fee',
        }
      );

      expect(result.imported).toBe(4);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify both security accounts were created
      const aaplAccount = await investmentService.getSecurityAccount(portfolioId, 'AAPL');
      const msftAccount = await investmentService.getSecurityAccount(portfolioId, 'MSFT');
      expect(aaplAccount).toBeDefined();
      expect(msftAccount).toBeDefined();
    });

    it('should handle CSV with quoted values', async () => {
      const csvData = `Date,Type,Ticker,Quantity,Price,Amount,Description
2025-01-15,buy,AAPL,10,150.00,1500.00,"Buy order for AAPL, 10 shares"`;

      const result = await investmentService.importInvestmentTransactions(
        portfolioId,
        csvData,
        {
          date: 'Date',
          type: 'Type',
          ticker: 'Ticker',
          quantity: 'Quantity',
          price: 'Price',
          amount: 'Amount',
          description: 'Description',
        }
      );

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid transactions', async () => {
      const csvData = `Date,Type,Ticker,Quantity,Price,Amount
2025-01-15,buy,AAPL,,,1500.00`;

      const result = await investmentService.importInvestmentTransactions(
        portfolioId,
        csvData,
        {
          date: 'Date',
          type: 'Type',
          ticker: 'Ticker',
          quantity: 'Quantity',
          price: 'Price',
          amount: 'Amount',
        }
      );

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty lines in CSV', async () => {
      const csvData = `Date,Type,Ticker,Quantity,Price,Amount

2025-01-15,buy,AAPL,10,150.00,1500.00

2025-01-20,buy,MSFT,5,300.00,1500.00`;

      const result = await investmentService.importInvestmentTransactions(
        portfolioId,
        csvData,
        {
          date: 'Date',
          type: 'Type',
          ticker: 'Ticker',
          quantity: 'Quantity',
          price: 'Price',
          amount: 'Amount',
        }
      );

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject import for non-existent portfolio', async () => {
      const csvData = `Date,Type,Ticker,Quantity,Price,Amount
2025-01-15,buy,AAPL,10,150.00,1500.00`;

      await expect(
        investmentService.importInvestmentTransactions(
          'non-existent-id',
          csvData,
          {
            date: 'Date',
            type: 'Type',
            ticker: 'Ticker',
            quantity: 'Quantity',
            price: 'Price',
            amount: 'Amount',
          }
        )
      ).rejects.toThrow('Portfolio not found');
    });
  });
});
