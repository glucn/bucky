# Implementation Plan

- [ ] 1. Set up database schema and migrations
- [ ] 1.1 Create Prisma migration for InvestmentProperties table
  - Add InvestmentProperties model to schema.prisma
  - Include fields: tickerSymbol, securityType, quantity, costBasisMethod, lots
  - Add relation to Account model
  - _Requirements: 1.1, 1.2, 2.3_

- [ ] 1.2 Create Prisma migration for SecurityPriceHistory table
  - Add SecurityPriceHistory model to schema.prisma
  - Include fields: tickerSymbol, date, price, source
  - Add unique constraint on (tickerSymbol, date)
  - Add index on (tickerSymbol, date)
  - _Requirements: 8.4_

- [ ] 1.3 Create default investment category accounts
  - Add seed data for Dividend Income, Interest Income, Realized Gains/Losses, Investment Expenses categories
  - Ensure accounts are created with type "category" and subtype "asset"
  - _Requirements: 4.3, 14.2, 3.5, 11.2_

- [ ] 2. Implement core investment service - portfolio management
- [ ] 2.1 Implement createInvestmentPortfolio function
  - Create AccountGroup with accountType "user"
  - Create Trading Cash Account linked to the group
  - Return both group and trading cash account
  - _Requirements: 1.1, 1.2, 1.3_

- [ ]* 2.2 Write property test for portfolio creation
  - **Property 2: Portfolio creation completeness**
  - **Validates: Requirements 1.1, 1.2**

- [ ] 2.3 Implement getInvestmentPortfolios function
  - Query all AccountGroups with accountType "user" that contain investment-related accounts
  - Return list of portfolio groups
  - _Requirements: 1.4_

- [ ] 2.4 Implement getPortfolioAccounts function
  - Query all accounts in a portfolio group
  - Separate trading cash from security accounts
  - Include investment properties for security accounts
  - _Requirements: 1.4, 1.5_

- [ ]* 2.5 Write property test for portfolio value aggregation
  - **Property 10: Portfolio value aggregation**
  - **Validates: Requirements 13.2, 15.3**

- [ ] 3. Implement security account management
- [ ] 3.1 Implement createSecurityAccount function
  - Create Account with type "user", subtype "asset"
  - Link to portfolio AccountGroup
  - Create InvestmentProperties record with ticker symbol and cost basis method
  - _Requirements: 2.3, 6.1_

- [ ] 3.2 Implement getSecurityAccount function
  - Query account by portfolio and ticker symbol
  - Include investment properties
  - _Requirements: 2.3_

- [ ]* 3.3 Write property test for security account creation
  - **Property 19: Input validation completeness**
  - **Validates: Requirements 2.1**

- [ ] 4. Implement buy transaction recording
- [ ] 4.1 Implement recordBuy function
  - Validate required fields (ticker, quantity, price, date)
  - Calculate total cost: (quantity × price) + fees
  - Create or get security account
  - Create journal entry debiting Security Account and crediting Trading Cash Account
  - If fees exist, add journal line debiting Investment Expense Category
  - Update InvestmentProperties quantity and lots (for FIFO)
  - Set journal entry type to InvestmentTransactionType.BUY
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ]* 4.2 Write property test for buy transaction cost calculation
  - **Property 3: Buy transaction cost calculation**
  - **Validates: Requirements 2.2**

- [ ]* 4.3 Write property test for buy transaction journal entry balance
  - **Property 1: Double-entry balance invariant**
  - **Validates: Requirements 15.1, 15.4**

- [ ] 5. Implement sell transaction recording
- [ ] 5.1 Implement calculateCostBasis helper function
  - For FIFO: select oldest lots first, calculate total cost
  - For AVERAGE_COST: use (account balance / quantity)
  - Return cost basis amount and lots used
  - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [ ]* 5.2 Write property test for FIFO cost basis ordering
  - **Property 5: FIFO cost basis ordering**
  - **Validates: Requirements 6.3**

- [ ]* 5.3 Write property test for average cost calculation
  - **Property 6: Average cost calculation**
  - **Validates: Requirements 6.4**

- [ ] 5.4 Implement recordSell function
  - Validate required fields (ticker, quantity, price, date)
  - Calculate sale proceeds: (quantity × price) - fees
  - Calculate cost basis using portfolio's cost basis method
  - Create journal entry crediting Security Account for cost basis, debiting Trading Cash for proceeds
  - Calculate realized gain/loss: proceeds - cost basis
  - If gain/loss exists, add journal line to Realized Gain/Loss Category
  - Update InvestmentProperties quantity and lots (for FIFO)
  - Set journal entry type to InvestmentTransactionType.SELL
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 5.5 Write property test for sell transaction proceeds calculation
  - **Property 4: Sell transaction proceeds calculation**
  - **Validates: Requirements 3.2**

- [ ]* 5.6 Write property test for realized gain/loss recording
  - **Property 11: Realized gain/loss recording**
  - **Validates: Requirements 3.5**

- [ ] 6. Implement dividend recording
- [ ] 6.1 Implement recordDividend function for cash dividends
  - Validate required fields (ticker, amount, date)
  - If categorized as income: create journal entry debiting Trading Cash, crediting Dividend Income Category
  - If categorized as return of capital: create journal entry debiting Trading Cash, crediting Security Account
  - Store ticker symbol in journal entry description
  - Set journal entry type to InvestmentTransactionType.DIVIDEND_CASH
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ]* 6.2 Write property test for return of capital cost basis reduction
  - **Property 13: Return of capital cost basis reduction**
  - **Validates: Requirements 4.4**

- [ ] 6.2 Implement recordReinvestedDividend function
  - Validate required fields (ticker, amount, reinvestment price, date)
  - Calculate shares purchased: amount ÷ reinvestment price
  - If recorded as income: create two journal entries (dividend income, then purchase)
  - If recorded as cost basis reduction: create journal entry debiting Security Account
  - Update InvestmentProperties quantity and lots
  - Set journal entry type to InvestmentTransactionType.DIVIDEND_REINVEST
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ]* 6.3 Write property test for dividend reinvestment share calculation
  - **Property 12: Dividend reinvestment share calculation**
  - **Validates: Requirements 5.2**

- [ ] 7. Implement cash management
- [ ] 7.1 Implement depositCash function
  - Validate required fields (amount, date, source account)
  - Create journal entry debiting Trading Cash Account, crediting source account
  - Use existing transfer transaction functionality
  - Set journal entry type to InvestmentTransactionType.CASH_DEPOSIT
  - _Requirements: 7.1, 7.3, 7.5_

- [ ] 7.2 Implement withdrawCash function
  - Validate required fields (amount, date, destination account)
  - Validate sufficient Trading Cash balance
  - Create journal entry crediting Trading Cash Account, debiting destination account
  - Use existing transfer transaction functionality
  - Set journal entry type to InvestmentTransactionType.CASH_WITHDRAWAL
  - _Requirements: 7.2, 7.3, 7.4, 7.5_

- [ ]* 7.3 Write property test for insufficient balance validation
  - **Property 14: Insufficient balance validation**
  - **Validates: Requirements 7.4**

- [ ] 8. Implement stock splits and fees
- [ ] 8.1 Implement recordStockSplit function
  - Validate required fields (ticker, split ratio, date)
  - Update InvestmentProperties quantity: multiply by split ratio
  - Update cost per share metadata: divide by split ratio
  - For FIFO: update all lot quantities and prices
  - Verify Security Account balance remains unchanged
  - Store split details in journal entry description (no journal lines needed)
  - Set journal entry type to InvestmentTransactionType.STOCK_SPLIT
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ]* 8.2 Write property test for stock split cost basis invariant
  - **Property 7: Stock split cost basis invariant**
  - **Validates: Requirements 10.3**

- [ ]* 8.3 Write property test for stock split quantity adjustment
  - **Property 8: Stock split quantity adjustment**
  - **Validates: Requirements 10.2, 10.4**

- [ ] 8.4 Implement recordFee function
  - Validate required fields (amount, description, date)
  - Create journal entry debiting Investment Expense Category, crediting Trading Cash Account
  - Store fee description in journal entry metadata
  - Set journal entry type to InvestmentTransactionType.FEE
  - _Requirements: 11.1, 11.2, 11.4, 11.5_

- [ ] 8.5 Implement recordInterest function
  - Validate required fields (amount, date)
  - Create journal entry debiting Trading Cash Account, crediting Interest Income Category
  - Store optional ticker symbol in description
  - Set journal entry type to InvestmentTransactionType.INTEREST
  - _Requirements: 14.1, 14.2, 14.3_

- [ ] 9. Implement price history management
- [ ] 9.1 Implement recordMarketPrice function
  - Validate required fields (ticker symbol, price, date)
  - Create or update SecurityPriceHistory record
  - Handle unique constraint on (tickerSymbol, date)
  - _Requirements: 8.4_

- [ ] 9.2 Implement getMarketPrice function
  - Query SecurityPriceHistory by ticker and date
  - Return price or null if not found
  - _Requirements: 8.2_

- [ ] 9.3 Implement getLatestMarketPrice function
  - Query most recent SecurityPriceHistory for ticker
  - Return price and date
  - _Requirements: 8.4_

- [ ] 9.4 Implement getPriceHistory function
  - Query SecurityPriceHistory by ticker and date range
  - Return array of price records
  - _Requirements: 8.4_

- [ ] 9.5 Implement importPriceHistory function
  - Batch insert price records for a ticker
  - Handle duplicates gracefully
  - _Requirements: 8.4_

- [ ] 10. Implement investment analytics service
- [ ] 10.1 Implement getPositionDetails function
  - Query Security Account and InvestmentProperties
  - Get latest market price from SecurityPriceHistory
  - Calculate cost basis from account balance
  - Calculate cost per share: cost basis / quantity
  - Calculate market value: quantity × market price
  - Calculate unrealized gain: market value - cost basis
  - Calculate unrealized gain percent: (unrealized gain / cost basis) × 100
  - _Requirements: 8.1, 8.2, 8.3_

- [ ]* 10.2 Write property test for unrealized gain calculation
  - **Property 9: Unrealized gain calculation**
  - **Validates: Requirements 8.2**

- [ ] 10.3 Implement getAllPositions function
  - Get all security accounts in portfolio
  - Call getPositionDetails for each
  - Return array of position details
  - _Requirements: 8.1, 8.5_

- [ ] 10.4 Implement getPortfolioValue function
  - Get Trading Cash Account balance
  - Get all Security Account balances (cost basis)
  - Get all position market values
  - Calculate total unrealized gain
  - Return portfolio value summary
  - _Requirements: 13.2, 15.3_

- [ ]* 10.5 Write property test for portfolio value aggregation
  - **Property 10: Portfolio value aggregation**
  - **Validates: Requirements 13.2, 15.3**

- [ ] 10.6 Implement getAssetAllocation function
  - Get all positions with market values
  - Calculate total portfolio value
  - Calculate each position as percentage of total
  - Return array of allocations
  - _Requirements: 13.3_

- [ ]* 10.7 Write property test for asset allocation percentage sum
  - **Property 16: Asset allocation percentage sum**
  - **Validates: Requirements 13.3**

- [ ] 10.8 Implement getDividendIncome function
  - Query journal entries to Dividend Income Category for date range
  - Filter by portfolio if specified
  - Sum amounts and group by ticker
  - Return total and by-ticker breakdown
  - _Requirements: 13.4_

- [ ] 10.9 Implement getInterestIncome function
  - Query journal entries to Interest Income Category for date range
  - Filter by portfolio if specified
  - Sum amounts
  - _Requirements: 14.4, 14.5_

- [ ]* 10.10 Write property test for income aggregation accuracy
  - **Property 20: Income aggregation accuracy**
  - **Validates: Requirements 13.4, 14.4**

- [ ] 10.11 Implement getRealizedGains function
  - Query journal entries to Realized Gain/Loss Category for date range
  - Parse transaction details from descriptions
  - For FIFO portfolios, calculate holding period from lot purchase dates
  - Classify as short-term (< 1 year) or long-term (≥ 1 year)
  - Return array of realized gain/loss records
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 10.12 Implement getPortfolioPerformance function
  - Calculate deposits (cash deposits to portfolio)
  - Calculate withdrawals (cash withdrawals from portfolio)
  - Get current portfolio value
  - Calculate total return: (current value + withdrawals - deposits) / deposits
  - Get realized gains, unrealized gains, dividend income, interest income, fees
  - Return performance summary
  - _Requirements: 13.1, 13.5_

- [ ] 11. Implement transaction import
- [ ] 11.1 Implement validateImportData function
  - Parse CSV data
  - Validate column mapping
  - Check required fields are present
  - Validate data types and formats
  - Return validation result with errors
  - _Requirements: 12.2_

- [ ] 11.2 Implement importInvestmentTransactions function
  - Parse CSV with column mapping
  - For each row: validate, detect duplicates, map to transaction type
  - Call appropriate record function (recordBuy, recordSell, etc.)
  - Create security accounts automatically for new tickers
  - Track imported, skipped, and error counts
  - Return import summary
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ]* 11.3 Write property test for transaction import duplicate detection
  - **Property 17: Transaction import duplicate detection**
  - **Validates: Requirements 12.4**

- [ ] 12. Implement UI components
- [ ] 12.1 Create InvestmentPortfolioList component
  - Display all investment portfolios
  - Show total value and performance for each
  - Add button to create new portfolio
  - _Requirements: 1.4_

- [ ] 12.2 Create PortfolioDetailsPage component
  - Display portfolio summary (total value, cash, securities value)
  - List all positions with current values and gains/losses
  - Show trading cash balance
  - Quick transaction entry buttons
  - _Requirements: 1.4, 8.1, 8.5_

- [ ] 12.3 Create PositionDetailsPage component
  - Display position details (quantity, cost basis, market value, gains)
  - Show transaction history for the security
  - Display cost basis breakdown (lots for FIFO)
  - Quick buy/sell buttons
  - _Requirements: 8.1, 8.2, 8.3_

- [ ] 12.4 Create TransactionEntryModal component
  - Form with transaction type selector
  - Type-specific fields (buy, sell, dividend, etc.)
  - Real-time validation
  - Fee entry support
  - _Requirements: 2.1, 3.1, 4.1, 5.1, 7.3, 10.1, 11.1, 14.1_

- [ ] 12.5 Create ImportTransactionsWizard component
  - CSV file upload
  - Column mapping interface
  - Preview and validation
  - Batch import with progress and error handling
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 12.6 Create PerformanceReportsPage component
  - Portfolio performance over time
  - Asset allocation charts
  - Income reports (dividends, interest)
  - Realized gains/losses reports
  - _Requirements: 13.1, 13.3, 13.4, 13.5, 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
