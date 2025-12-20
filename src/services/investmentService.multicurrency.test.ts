import { describe, it, expect, beforeEach } from 'vitest';
import { investmentService } from './investmentService';
import { resetTestDatabase } from './database.test.utils';

describe('InvestmentService - Multi-Currency Support', () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  describe('createInvestmentPortfolio with currency', () => {
    it('should create portfolio with specified currency', async () => {
      const result = await investmentService.createInvestmentPortfolio(
        'Euro Portfolio',
        'EUR'
      );

      expect(result.group).toBeDefined();
      expect(result.group.name).toBe('Euro Portfolio');
      expect(result.tradeCashAccount).toBeDefined();
      expect(result.tradeCashAccount.currency).toBe('EUR');
      expect(result.tradeCashAccount.name).toBe('Trade Cash - Euro Portfolio');
    });

    it('should create portfolio with default USD currency when not specified', async () => {
      const result = await investmentService.createInvestmentPortfolio(
        'Default Portfolio'
      );

      expect(result.tradeCashAccount.currency).toBe('USD');
    });
  });

  describe('addTradeCashAccount', () => {
    it('should add additional trade cash account in different currency', async () => {
      // Create initial portfolio with USD
      const portfolio = await investmentService.createInvestmentPortfolio(
        'Multi-Currency Portfolio',
        'USD'
      );

      // Add EUR trade cash account
      const eurAccount = await investmentService.addTradeCashAccount(
        portfolio.group.id,
        'EUR'
      );

      expect(eurAccount).toBeDefined();
      expect(eurAccount.currency).toBe('EUR');
      expect(eurAccount.name).toBe('Trade Cash - Multi-Currency Portfolio (EUR)');

      // Verify both accounts exist in portfolio
      const portfolioAccounts = await investmentService.getPortfolioAccounts(
        portfolio.group.id
      );

      expect(portfolioAccounts.tradeCashAccounts).toHaveLength(2);
      expect(portfolioAccounts.tradeCashAccounts.map(a => a.currency)).toContain('USD');
      expect(portfolioAccounts.tradeCashAccounts.map(a => a.currency)).toContain('EUR');
    });

    it('should throw error when adding duplicate currency', async () => {
      const portfolio = await investmentService.createInvestmentPortfolio(
        'Test Portfolio',
        'USD'
      );

      await expect(
        investmentService.addTradeCashAccount(portfolio.group.id, 'USD')
      ).rejects.toThrow('Trade cash account for USD already exists in this portfolio');
    });

    it('should throw error for non-existent portfolio', async () => {
      await expect(
        investmentService.addTradeCashAccount('non-existent-id', 'EUR')
      ).rejects.toThrow('Portfolio not found');
    });
  });

  describe('getTradeCashAccount', () => {
    it('should return specific trade cash account by currency', async () => {
      const portfolio = await investmentService.createInvestmentPortfolio(
        'Test Portfolio',
        'USD'
      );

      await investmentService.addTradeCashAccount(portfolio.group.id, 'EUR');

      const usdAccount = await investmentService.getTradeCashAccount(
        portfolio.group.id,
        'USD'
      );
      const eurAccount = await investmentService.getTradeCashAccount(
        portfolio.group.id,
        'EUR'
      );

      expect(usdAccount).toBeDefined();
      expect(usdAccount.currency).toBe('USD');
      expect(eurAccount).toBeDefined();
      expect(eurAccount.currency).toBe('EUR');
    });

    it('should return null for non-existent currency', async () => {
      const portfolio = await investmentService.createInvestmentPortfolio(
        'Test Portfolio',
        'USD'
      );

      const account = await investmentService.getTradeCashAccount(
        portfolio.group.id,
        'EUR'
      );

      expect(account).toBeNull();
    });
  });

  describe('getPortfolioAccounts with multi-currency', () => {
    it('should return all trade cash accounts', async () => {
      const portfolio = await investmentService.createInvestmentPortfolio(
        'Multi-Currency Portfolio',
        'USD'
      );

      await investmentService.addTradeCashAccount(portfolio.group.id, 'EUR');
      await investmentService.addTradeCashAccount(portfolio.group.id, 'GBP');

      const accounts = await investmentService.getPortfolioAccounts(
        portfolio.group.id
      );

      expect(accounts.tradeCashAccounts).toHaveLength(3);
      expect(accounts.tradeCash).toBeDefined(); // Legacy compatibility
      expect(accounts.tradeCash.currency).toBe('USD'); // First account

      const currencies = accounts.tradeCashAccounts.map(a => a.currency);
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
      expect(currencies).toContain('GBP');
    });
  });

  describe('getPortfolioValue with multi-currency', () => {
    it('should return cash balances by currency', async () => {
      const portfolio = await investmentService.createInvestmentPortfolio(
        'Multi-Currency Portfolio',
        'USD'
      );

      // Add EUR trade cash account
      await investmentService.addTradeCashAccount(portfolio.group.id, 'EUR');

      // Add some cash to both accounts (using deposit functionality)
      // Note: This would require setting up source accounts, so we'll just verify the structure
      const portfolioValue = await investmentService.getPortfolioValue(
        portfolio.group.id
      );

      expect(portfolioValue.cashBalancesByCurrency).toBeDefined();
      expect(portfolioValue.cashBalancesByCurrency).toHaveProperty('USD');
      expect(portfolioValue.cashBalancesByCurrency).toHaveProperty('EUR');
    });
  });
});