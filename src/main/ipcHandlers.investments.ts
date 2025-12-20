import { ipcMain } from "electron";
import { investmentService } from "../services/investmentService";

export function setupInvestmentIpcHandlers() {
  console.log("Registering investment IPC handlers...");

  // Remove any existing handlers first
  ipcMain.removeHandler("get-investment-portfolios");
  ipcMain.removeHandler("create-investment-portfolio");
  ipcMain.removeHandler("get-portfolio-accounts");
  ipcMain.removeHandler("get-portfolio-value");
  ipcMain.removeHandler("get-all-positions");
  ipcMain.removeHandler("get-position-details");
  ipcMain.removeHandler("record-buy");
  ipcMain.removeHandler("record-sell");
  ipcMain.removeHandler("record-dividend");
  ipcMain.removeHandler("record-reinvested-dividend");
  ipcMain.removeHandler("record-interest");
  ipcMain.removeHandler("record-fee");
  ipcMain.removeHandler("record-stock-split");
  ipcMain.removeHandler("deposit-cash");
  ipcMain.removeHandler("withdraw-cash");
  ipcMain.removeHandler("record-market-price");
  ipcMain.removeHandler("get-market-price");
  ipcMain.removeHandler("get-latest-market-price");
  ipcMain.removeHandler("get-price-history");
  ipcMain.removeHandler("import-price-history");
  ipcMain.removeHandler("get-asset-allocation");
  ipcMain.removeHandler("get-dividend-income");
  ipcMain.removeHandler("get-interest-income");
  ipcMain.removeHandler("get-realized-gains");
  ipcMain.removeHandler("get-portfolio-performance");
  ipcMain.removeHandler("validate-import-data");
  ipcMain.removeHandler("import-investment-transactions");
  ipcMain.removeHandler("add-trade-cash-account");
  ipcMain.removeHandler("get-trade-cash-account");

  // Portfolio Management
  ipcMain.handle("get-investment-portfolios", async () => {
    console.log("Handling get-investment-portfolios request");
    try {
      const portfolios = await investmentService.getInvestmentPortfolios();
      return { success: true, portfolios };
    } catch (error) {
      console.error("Error getting investment portfolios:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle(
    "create-investment-portfolio",
    async (_, { name, currency }: { name: string; currency?: string }) => {
      console.log("Handling create-investment-portfolio request:", { name, currency });
      try {
        const result = await investmentService.createInvestmentPortfolio(name, currency);
        return { success: true, ...result };
      } catch (error) {
        console.error("Error creating investment portfolio:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle("get-portfolio-accounts", async (_, portfolioId: string) => {
    console.log("Handling get-portfolio-accounts request for:", portfolioId);
    try {
      const accounts = await investmentService.getPortfolioAccounts(portfolioId);
      return { success: true, accounts };
    } catch (error) {
      console.error("Error getting portfolio accounts:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("get-portfolio-value", async (_, portfolioId: string) => {
    console.log("Handling get-portfolio-value request for:", portfolioId);
    try {
      const value = await investmentService.getPortfolioValue(portfolioId);
      return { success: true, value };
    } catch (error) {
      console.error("Error getting portfolio value:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Position Management
  ipcMain.handle(
    "get-all-positions",
    async (_, { portfolioId, asOfDate }: { portfolioId: string; asOfDate?: string }) => {
      console.log("Handling get-all-positions request for:", portfolioId);
      try {
        const positions = await investmentService.getAllPositions(portfolioId, asOfDate);
        return { success: true, positions };
      } catch (error) {
        console.error("Error getting all positions:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-position-details",
    async (_, { accountId, asOfDate }: { accountId: string; asOfDate?: string }) => {
      console.log("Handling get-position-details request for:", accountId);
      try {
        const position = await investmentService.getPositionDetails(accountId, asOfDate);
        return { success: true, position };
      } catch (error) {
        console.error("Error getting position details:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Transaction Recording
  ipcMain.handle("record-buy", async (_, params) => {
    console.log("Handling record-buy request:", params);
    try {
      const entry = await investmentService.recordBuy(params);
      return { success: true, entry };
    } catch (error) {
      console.error("Error recording buy transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("record-sell", async (_, params) => {
    console.log("Handling record-sell request:", params);
    try {
      const entry = await investmentService.recordSell(params);
      return { success: true, entry };
    } catch (error) {
      console.error("Error recording sell transaction:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("record-dividend", async (_, params) => {
    console.log("Handling record-dividend request:", params);
    try {
      const entry = await investmentService.recordDividend(params);
      return { success: true, entry };
    } catch (error) {
      console.error("Error recording dividend:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("record-reinvested-dividend", async (_, params) => {
    console.log("Handling record-reinvested-dividend request:", params);
    try {
      const entry = await investmentService.recordReinvestedDividend(params);
      return { success: true, entry };
    } catch (error) {
      console.error("Error recording reinvested dividend:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("record-interest", async (_, params) => {
    console.log("Handling record-interest request:", params);
    try {
      const entry = await investmentService.recordInterest(
        params.portfolioId,
        params.amount,
        params.date,
        params.description
      );
      return { success: true, entry };
    } catch (error) {
      console.error("Error recording interest:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("record-fee", async (_, params) => {
    console.log("Handling record-fee request:", params);
    try {
      const entry = await investmentService.recordFee(
        params.portfolioId,
        params.amount,
        params.description,
        params.date
      );
      return { success: true, entry };
    } catch (error) {
      console.error("Error recording fee:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("record-stock-split", async (_, params) => {
    console.log("Handling record-stock-split request:", params);
    try {
      const entry = await investmentService.recordStockSplit(
        params.accountId,
        params.splitRatio,
        params.date,
        params.description
      );
      return { success: true, entry };
    } catch (error) {
      console.error("Error recording stock split:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Cash Management
  ipcMain.handle("deposit-cash", async (_, params) => {
    console.log("Handling deposit-cash request:", params);
    try {
      const entry = await investmentService.depositCash(
        params.portfolioId,
        params.amount,
        params.fromAccountId,
        params.date,
        params.description
      );
      return { success: true, entry };
    } catch (error) {
      console.error("Error depositing cash:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("withdraw-cash", async (_, params) => {
    console.log("Handling withdraw-cash request:", params);
    try {
      const entry = await investmentService.withdrawCash(
        params.portfolioId,
        params.amount,
        params.toAccountId,
        params.date,
        params.description
      );
      return { success: true, entry };
    } catch (error) {
      console.error("Error withdrawing cash:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Price History Management
  ipcMain.handle("record-market-price", async (_, params) => {
    console.log("Handling record-market-price request:", params);
    try {
      const priceHistory = await investmentService.recordMarketPrice(
        params.tickerSymbol,
        params.price,
        params.date,
        params.source
      );
      return { success: true, priceHistory };
    } catch (error) {
      console.error("Error recording market price:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle(
    "get-market-price",
    async (_, { tickerSymbol, date }: { tickerSymbol: string; date: string }) => {
      console.log("Handling get-market-price request:", { tickerSymbol, date });
      try {
        const price = await investmentService.getMarketPrice(tickerSymbol, date);
        return { success: true, price };
      } catch (error) {
        console.error("Error getting market price:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle("get-latest-market-price", async (_, tickerSymbol: string) => {
    console.log("Handling get-latest-market-price request for:", tickerSymbol);
    try {
      const priceData = await investmentService.getLatestMarketPrice(tickerSymbol);
      return { success: true, priceData };
    } catch (error) {
      console.error("Error getting latest market price:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle(
    "get-price-history",
    async (_, { tickerSymbol, startDate, endDate }: { tickerSymbol: string; startDate?: string; endDate?: string }) => {
      console.log("Handling get-price-history request:", { tickerSymbol, startDate, endDate });
      try {
        const history = await investmentService.getPriceHistory(tickerSymbol, startDate, endDate);
        return { success: true, history };
      } catch (error) {
        console.error("Error getting price history:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "import-price-history",
    async (_, { tickerSymbol, prices }: { tickerSymbol: string; prices: Array<{ date: string; price: number }> }) => {
      console.log("Handling import-price-history request:", { tickerSymbol, priceCount: prices.length });
      try {
        const count = await investmentService.importPriceHistory(tickerSymbol, prices);
        return { success: true, count };
      } catch (error) {
        console.error("Error importing price history:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Analytics
  ipcMain.handle("get-asset-allocation", async (_, portfolioId: string) => {
    console.log("Handling get-asset-allocation request for:", portfolioId);
    try {
      const allocation = await investmentService.getAssetAllocation(portfolioId);
      return { success: true, allocation };
    } catch (error) {
      console.error("Error getting asset allocation:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle(
    "get-dividend-income",
    async (_, { portfolioId, startDate, endDate }: { portfolioId: string | null; startDate: string; endDate: string }) => {
      console.log("Handling get-dividend-income request:", { portfolioId, startDate, endDate });
      try {
        const income = await investmentService.getDividendIncome(portfolioId, startDate, endDate);
        return { success: true, income };
      } catch (error) {
        console.error("Error getting dividend income:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-interest-income",
    async (_, { portfolioId, startDate, endDate }: { portfolioId: string | null; startDate: string; endDate: string }) => {
      console.log("Handling get-interest-income request:", { portfolioId, startDate, endDate });
      try {
        const income = await investmentService.getInterestIncome(portfolioId, startDate, endDate);
        return { success: true, income };
      } catch (error) {
        console.error("Error getting interest income:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-realized-gains",
    async (_, { portfolioId, startDate, endDate }: { portfolioId: string; startDate: string; endDate: string }) => {
      console.log("Handling get-realized-gains request:", { portfolioId, startDate, endDate });
      try {
        const gains = await investmentService.getRealizedGains(portfolioId, startDate, endDate);
        return { success: true, gains };
      } catch (error) {
        console.error("Error getting realized gains:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-portfolio-performance",
    async (_, { portfolioId, startDate, endDate }: { portfolioId: string; startDate: string; endDate: string }) => {
      console.log("Handling get-portfolio-performance request:", { portfolioId, startDate, endDate });
      try {
        const performance = await investmentService.getPortfolioPerformance(portfolioId, startDate, endDate);
        return { success: true, performance };
      } catch (error) {
        console.error("Error getting portfolio performance:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Import
  ipcMain.handle("validate-import-data", async (_, { csvData, mapping }) => {
    console.log("Handling validate-import-data request");
    try {
      const validation = await investmentService.validateImportData(csvData, mapping);
      return { success: true, validation };
    } catch (error) {
      console.error("Error validating import data:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle(
    "import-investment-transactions",
    async (_, { portfolioId, csvData, mapping }) => {
      console.log("Handling import-investment-transactions request");
      try {
        const result = await investmentService.importInvestmentTransactions(portfolioId, csvData, mapping);
        return { success: true, ...result };
      } catch (error) {
        console.error("Error importing investment transactions:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Multi-currency trade cash management
  ipcMain.handle(
    "add-trade-cash-account",
    async (_, { portfolioId, currency }: { portfolioId: string; currency: string }) => {
      console.log("Handling add-trade-cash-account request:", { portfolioId, currency });
      try {
        const account = await investmentService.addTradeCashAccount(portfolioId, currency);
        return { success: true, account };
      } catch (error) {
        console.error("Error adding trade cash account:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  ipcMain.handle(
    "get-trade-cash-account",
    async (_, { portfolioId, currency }: { portfolioId: string; currency: string }) => {
      console.log("Handling get-trade-cash-account request:", { portfolioId, currency });
      try {
        const account = await investmentService.getTradeCashAccount(portfolioId, currency);
        return { success: true, account };
      } catch (error) {
        console.error("Error getting trade cash account:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  console.log("Investment IPC handlers registered");
}
