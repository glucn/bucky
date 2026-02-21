import { describe, it, expect, beforeEach } from 'vitest';
import { AccountSubtype, AccountType } from '../shared/accountTypes';
import { appSettingsService } from './appSettingsService';
import { databaseService } from './database';
import { investmentService } from './investmentService';
import { resetTestDatabase } from './database.test.utils';

async function seedFxRate(
  sourceCurrency: string,
  targetCurrency: string,
  marketDate: string,
  rate: number
): Promise<void> {
  await databaseService.prismaClient.fxDailyRate.create({
    data: {
      sourceCurrency,
      targetCurrency,
      marketDate,
      rate,
    },
  });
}

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
      expect(result.tradeCashAccount.name).toBe('Trade Cash - Euro Portfolio (EUR)');
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

    it('converts cash summary to configured base currency', async () => {
      await appSettingsService.setBaseCurrency('CAD');

      const usdWallet = await databaseService.createAccount({
        name: 'USD Wallet',
        type: AccountType.User,
        subtype: AccountSubtype.Asset,
        currency: 'USD',
      });

      const eurWallet = await databaseService.createAccount({
        name: 'EUR Wallet',
        type: AccountType.User,
        subtype: AccountSubtype.Asset,
        currency: 'EUR',
      });

      const portfolio = await investmentService.createInvestmentPortfolio('Multi-Currency Portfolio', 'USD');
      const eurTradeCash = await investmentService.addTradeCashAccount(portfolio.group.id, 'EUR');
      const portfolioAccounts = await investmentService.getPortfolioAccounts(portfolio.group.id);
      const usdTradeCash = portfolioAccounts.tradeCashAccounts.find((account) => account.currency === 'USD');
      if (!usdTradeCash) {
        throw new Error('Expected USD trade cash account to exist');
      }

      await databaseService.createOpeningBalanceEntry(
        [
          { accountId: usdTradeCash.id, balance: 100 },
          { accountId: eurTradeCash.id, balance: 100 },
        ],
        new Date('2025-01-10')
      );

      await seedFxRate('USD', 'CAD', '2025-01-15', 1.3);
      await seedFxRate('EUR', 'CAD', '2025-01-15', 1.5);

      const portfolioValue = await investmentService.getPortfolioValue(portfolio.group.id);

      expect(portfolioValue.cashBalance).toBe(280);
    });

    it('returns N/A summary cash when conversion is unavailable and keeps native breakdown', async () => {
      await appSettingsService.setBaseCurrency('USD');

      const portfolio = await investmentService.createInvestmentPortfolio('JPY Portfolio', 'JPY');
      const portfolioAccounts = await investmentService.getPortfolioAccounts(portfolio.group.id);
      const jpyTradeCash = portfolioAccounts.tradeCashAccounts.find((account) => account.currency === 'JPY');
      if (!jpyTradeCash) {
        throw new Error('Expected JPY trade cash account to exist');
      }

      await databaseService.createOpeningBalanceEntry(
        [{ accountId: jpyTradeCash.id, balance: 10000 }],
        new Date('2025-01-10')
      );

      const portfolioValue = await investmentService.getPortfolioValue(portfolio.group.id);

      expect(portfolioValue.cashBalance).toBeNull();
      expect(portfolioValue.cashBalancesByCurrency).toEqual({ JPY: 10000 });
    });
  });

  describe('getAllPositions base-converted values', () => {
    it('returns base-converted position values when FX is available', async () => {
      await appSettingsService.setBaseCurrency('CAD');

      const accounts = await databaseService.getAccounts(true);
      const openingBalanceEquity = accounts.find((account) => account.name === 'Opening Balances');
      if (!openingBalanceEquity) {
        throw new Error('Expected Opening Balances account to exist');
      }

      const usdWallet = await databaseService.createAccount({
        name: 'USD Wallet',
        type: AccountType.User,
        subtype: AccountSubtype.Asset,
        currency: 'USD',
      });

      await seedFxRate('USD', 'CAD', '2025-01-15', 1.3);

      const portfolio = await investmentService.createInvestmentPortfolio('Brokerage', 'USD');
      await databaseService.createOpeningBalanceEntry(
        [{ accountId: usdWallet.id, balance: 1000 }],
        new Date('2025-01-10')
      );

      await investmentService.depositCash(
        portfolio.group.id,
        500,
        usdWallet.id,
        '2025-01-16',
        'Fund portfolio'
      );

      await investmentService.recordBuy({
        portfolioId: portfolio.group.id,
        tickerSymbol: 'VTI',
        quantity: 10,
        pricePerShare: 10,
        date: '2025-01-17',
      });

      await investmentService.recordMarketPrice('VTI', 12, '2025-01-18', 'manual');

      const positions = await investmentService.getAllPositions(portfolio.group.id, '2025-01-18');

      expect(positions[0]?.marketValueBase).toBe(156);
      expect(positions[0]?.costBasisBase).toBe(130);
      expect(positions[0]?.currency).toBe('USD');
    });

    it('returns N/A base values when conversion is unavailable', async () => {
      await appSettingsService.setBaseCurrency('CAD');

      const accounts = await databaseService.getAccounts(true);
      const openingBalanceEquity = accounts.find((account) => account.name === 'Opening Balances');
      if (!openingBalanceEquity) {
        throw new Error('Expected Opening Balances account to exist');
      }

      const usdWallet = await databaseService.createAccount({
        name: 'USD Wallet',
        type: AccountType.User,
        subtype: AccountSubtype.Asset,
        currency: 'USD',
      });

      const portfolio = await investmentService.createInvestmentPortfolio('Brokerage', 'USD');
      await databaseService.createOpeningBalanceEntry(
        [{ accountId: usdWallet.id, balance: 1000 }],
        new Date('2025-01-10')
      );

      await investmentService.depositCash(
        portfolio.group.id,
        500,
        usdWallet.id,
        '2025-01-16',
        'Fund portfolio'
      );

      await investmentService.recordBuy({
        portfolioId: portfolio.group.id,
        tickerSymbol: 'VTI',
        quantity: 10,
        pricePerShare: 10,
        date: '2025-01-17',
      });

      await investmentService.recordMarketPrice('VTI', 12, '2025-01-18', 'manual');

      const positions = await investmentService.getAllPositions(portfolio.group.id, '2025-01-18');

      expect(positions[0]?.marketValueBase).toBeNull();
      expect(positions[0]?.costBasisBase).toBeNull();
      expect(positions[0]?.currency).toBe('USD');
    });
  });
});
