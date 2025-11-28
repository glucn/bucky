# Requirements Document

## Introduction

This document outlines the requirements for implementing Investment Account Management features in the Bucky personal bookkeeping application. These features will enable users to track investment portfolios including stocks, bonds, mutual funds, ETFs, and other securities, while maintaining strict adherence to double-entry accounting principles. The system leverages Bucky's existing Account and AccountGroup infrastructure, where each security position is represented as a separate Account, and related investment accounts are organized using AccountGroups. This approach ensures proper accounting treatment where each security appears as a distinct asset on the balance sheet.

## Glossary

- **Investment_System**: The investment account management functionality within Bucky
- **Investment_Portfolio**: An AccountGroup that organizes all accounts related to a specific investment portfolio or brokerage
- **Trading_Cash_Account**: An asset Account that holds cash available for purchasing securities within a portfolio
- **Security_Account**: An asset Account representing a holding of a specific security (stock, bond, mutual fund, ETF)
- **Security**: A tradable financial instrument (stock, bond, mutual fund, ETF, etc.)
- **Ticker_Symbol**: The unique identifier for a security (e.g., AAPL, MSFT, VTSAX)
- **Cost_Basis**: The total purchase price recorded in a Security_Account, used to calculate capital gains/losses
- **Realized_Gain_Loss**: Profit or loss from selling a security, calculated as sale proceeds minus cost basis
- **Unrealized_Gain_Loss**: Current market value of a Security_Account minus its cost basis (paper gain/loss)
- **Dividend**: A distribution of profits from a security to its holders
- **Cash_Dividend**: A dividend paid in cash to the Trading_Cash_Account
- **Reinvested_Dividend**: A dividend automatically used to purchase additional shares of the security
- **Dividend_Income_Category**: A category Account used to record dividend income
- **Interest_Income_Category**: A category Account used to record interest income
- **Realized_Gain_Loss_Category**: A category Account used to record realized gains or losses from security sales
- **Investment_Expense_Category**: A category Account used to record investment-related fees and expenses
- **Transaction_Fee**: Brokerage fees or commissions charged for buying or selling securities
- **Lot**: A specific purchase of shares with its own cost basis, tracked as metadata on journal entries
- **FIFO**: First-In-First-Out, a method for determining which lots are sold first
- **Average_Cost**: A method that calculates cost basis as the average price of all shares owned
- **Split**: A corporate action that changes the number of shares and price proportionally
- **Return_of_Capital**: A distribution that reduces cost basis rather than being treated as income
- **Market_Price**: The current trading price of a security, stored as metadata for calculating unrealized gains

## Requirements

### Requirement 1

**User Story:** As a user, I want to create investment portfolios that organize my securities and cash, so that I can track my investments separately from my regular bank accounts.

#### Acceptance Criteria

1. WHEN creating an investment portfolio, THE Investment_System SHALL create an AccountGroup with accountType "user"
2. WHEN creating an investment portfolio, THE Investment_System SHALL create a Trading_Cash_Account within the portfolio group
3. WHEN creating a Trading_Cash_Account, THE Investment_System SHALL set the account type to "user", subtype to "asset", and allow specifying the currency
4. WHEN displaying an investment portfolio, THE Investment_System SHALL show the aggregate balance including all Security_Accounts and the Trading_Cash_Account
5. THE Investment_System SHALL allow users to add multiple Security_Accounts to the same investment portfolio group

### Requirement 2

**User Story:** As a user, I want to record buy transactions for securities, so that I can track my investment purchases and cost basis.

#### Acceptance Criteria

1. WHEN recording a buy transaction, THE Investment_System SHALL require the security ticker symbol, quantity, price per share, and transaction date
2. WHEN recording a buy transaction, THE Investment_System SHALL calculate the total cost as (quantity × price) + transaction fees
3. WHEN recording a buy transaction, THE Investment_System SHALL create or identify the Security_Account for the specified ticker symbol within the portfolio
4. WHEN recording a buy transaction, THE Investment_System SHALL create a journal entry debiting the Security_Account and crediting the Trading_Cash_Account for the total cost
5. WHEN recording a buy transaction with fees, THE Investment_System SHALL create an additional journal line debiting Investment_Expense_Category and crediting Trading_Cash_Account for the fee amount

### Requirement 3

**User Story:** As a user, I want to record sell transactions for securities, so that I can track sales and calculate realized gains or losses.

#### Acceptance Criteria

1. WHEN recording a sell transaction, THE Investment_System SHALL require the security ticker symbol, quantity, price per share, and transaction date
2. WHEN recording a sell transaction, THE Investment_System SHALL calculate the sale proceeds as (quantity × price) - transaction fees
3. WHEN recording a sell transaction, THE Investment_System SHALL calculate the cost basis of shares sold using the portfolio's cost basis method (FIFO or average cost)
4. WHEN recording a sell transaction, THE Investment_System SHALL create a journal entry crediting the Security_Account for the cost basis amount and debiting the Trading_Cash_Account for the sale proceeds
5. WHEN the sale proceeds differ from cost basis, THE Investment_System SHALL create an additional journal line debiting or crediting the Realized_Gain_Loss_Category for the difference

### Requirement 4

**User Story:** As a user, I want to record cash dividends, so that I can track dividend income from my investments.

#### Acceptance Criteria

1. WHEN recording a cash dividend, THE Investment_System SHALL require the security ticker symbol, dividend amount, and payment date
2. WHEN recording a cash dividend, THE Investment_System SHALL allow the user to categorize the dividend as investment income or as a return of capital
3. WHEN a dividend is categorized as investment income, THE Investment_System SHALL create a journal entry debiting the Trading_Cash_Account and crediting the Dividend_Income_Category
4. WHEN a dividend is categorized as return of capital, THE Investment_System SHALL create a journal entry debiting the Trading_Cash_Account and crediting the Security_Account to reduce its cost basis
5. THE Investment_System SHALL store the security ticker symbol in the journal entry description or metadata for reporting purposes

### Requirement 5

**User Story:** As a user, I want to record reinvested dividends, so that I can accurately track when dividends are used to purchase additional shares.

#### Acceptance Criteria

1. WHEN recording a reinvested dividend, THE Investment_System SHALL require the security ticker symbol, dividend amount, reinvestment price, and payment date
2. WHEN recording a reinvested dividend, THE Investment_System SHALL calculate the number of shares purchased as dividend amount ÷ reinvestment price
3. WHEN recording a reinvested dividend, THE Investment_System SHALL allow the user to choose whether to record the dividend as income or as a cost basis reduction
4. WHEN a reinvested dividend is recorded as income, THE Investment_System SHALL create two journal entries: first debiting Trading_Cash_Account and crediting Dividend_Income_Category, then debiting Security_Account and crediting Trading_Cash_Account
5. WHEN a reinvested dividend is recorded as cost basis reduction, THE Investment_System SHALL create a journal entry debiting the Security_Account for the dividend amount without recording income

### Requirement 6

**User Story:** As a user, I want to track cost basis using different methods (FIFO or average cost), so that I can accurately calculate capital gains for tax purposes.

#### Acceptance Criteria

1. WHEN creating an investment portfolio, THE Investment_System SHALL allow the user to select a cost basis method (FIFO or average cost) that applies to all securities in the portfolio
2. WHEN using FIFO method, THE Investment_System SHALL store lot information (purchase date, quantity, price) as metadata on buy transaction journal entries
3. WHEN using FIFO method and selling shares, THE Investment_System SHALL calculate cost basis by selecting shares from the oldest lots first
4. WHEN using average cost method, THE Investment_System SHALL calculate cost basis as the Security_Account balance divided by total shares owned
5. WHEN using average cost method and selling shares, THE Investment_System SHALL use the current average cost per share to determine the cost basis amount to credit from the Security_Account

### Requirement 7

**User Story:** As a user, I want to record deposits and withdrawals of cash to my investment portfolio, so that I can track money flowing in and out of my investments.

#### Acceptance Criteria

1. WHEN recording a cash deposit, THE Investment_System SHALL create a journal entry debiting the Trading_Cash_Account and crediting the source account
2. WHEN recording a cash withdrawal, THE Investment_System SHALL create a journal entry crediting the Trading_Cash_Account and debiting the destination account
3. WHEN recording a cash deposit or withdrawal, THE Investment_System SHALL require the amount, date, and the other account involved in the transfer
4. WHEN recording a cash withdrawal, THE Investment_System SHALL validate that the Trading_Cash_Account has sufficient balance
5. THE Investment_System SHALL use the existing transfer transaction functionality to maintain double-entry accounting for all cash movements

### Requirement 8

**User Story:** As a user, I want to see unrealized gains and losses for my positions, so that I can understand my current investment performance.

#### Acceptance Criteria

1. WHEN viewing an investment portfolio, THE Investment_System SHALL display unrealized gain/loss for each Security_Account
2. WHEN calculating unrealized gain/loss, THE Investment_System SHALL use the formula: (current market price × quantity) - Security_Account balance
3. WHEN displaying unrealized gains/losses, THE Investment_System SHALL show both dollar amount and percentage return
4. THE Investment_System SHALL allow users to manually enter and store current market prices for each security as metadata
5. WHEN viewing an investment portfolio, THE Investment_System SHALL display the total unrealized gain/loss across all Security_Accounts in the portfolio group

### Requirement 9

**User Story:** As a user, I want to view realized gains and losses over time, so that I can track my actual investment profits and prepare for tax reporting.

#### Acceptance Criteria

1. WHEN viewing investment reports, THE Investment_System SHALL display all journal entries involving the Realized_Gain_Loss_Category account
2. WHEN displaying realized gains/losses, THE Investment_System SHALL show the security ticker, sale date, quantity sold, cost basis, sale proceeds, and gain/loss amount
3. THE Investment_System SHALL allow filtering realized gains/losses by date range and by investment portfolio
4. THE Investment_System SHALL calculate total realized gains and total realized losses for a specified period
5. WHEN lot information is available, THE Investment_System SHALL distinguish between short-term gains (held < 1 year) and long-term gains (held ≥ 1 year) based on purchase date

### Requirement 10

**User Story:** As a user, I want to record stock splits, so that my position quantities and cost basis remain accurate after corporate actions.

#### Acceptance Criteria

1. WHEN recording a stock split, THE Investment_System SHALL require the security ticker symbol, split ratio (e.g., 2-for-1), and effective date
2. WHEN recording a stock split, THE Investment_System SHALL update the stored quantity metadata for the Security_Account by multiplying by the split ratio
3. WHEN recording a stock split, THE Investment_System SHALL maintain the Security_Account balance unchanged (total cost basis remains the same)
4. WHEN recording a stock split, THE Investment_System SHALL update the cost per share metadata by dividing by the split ratio
5. WHEN using FIFO method, THE Investment_System SHALL update all lot records by multiplying quantities by the split ratio and dividing prices by the split ratio

### Requirement 11

**User Story:** As a user, I want to record investment fees and expenses, so that I can track the costs of managing my investments.

#### Acceptance Criteria

1. WHEN recording an investment fee, THE Investment_System SHALL require the fee amount, description, and date
2. WHEN recording an investment fee, THE Investment_System SHALL create a journal entry debiting the Investment_Expense_Category and crediting the Trading_Cash_Account
3. WHEN recording a buy or sell transaction with fees, THE Investment_System SHALL include the fee as part of the transaction journal entry
4. THE Investment_System SHALL allow recording account-level fees (management fees, advisory fees) as separate transactions
5. THE Investment_System SHALL store fee descriptions in journal entry metadata to distinguish between commission fees, management fees, and other expense types

### Requirement 12

**User Story:** As a user, I want to import investment transactions from brokerage statements, so that I can efficiently maintain accurate records without manual entry.

#### Acceptance Criteria

1. WHEN importing investment transactions, THE Investment_System SHALL support CSV file format with columns for transaction type, date, security ticker, quantity, price, and fees
2. WHEN importing transactions, THE Investment_System SHALL validate that all required fields are present and properly formatted
3. WHEN importing transactions, THE Investment_System SHALL map each transaction type (buy, sell, dividend, etc.) to the appropriate journal entry structure
4. WHEN importing transactions, THE Investment_System SHALL detect potential duplicate transactions by comparing date, security, quantity, and amount
5. WHEN importing transactions, THE Investment_System SHALL create Security_Accounts automatically for new ticker symbols encountered during import

### Requirement 13

**User Story:** As a user, I want to view investment performance metrics, so that I can evaluate how my investments are performing over time.

#### Acceptance Criteria

1. WHEN viewing investment analytics, THE Investment_System SHALL calculate total return as (current portfolio value + withdrawals - deposits) / deposits
2. WHEN viewing investment analytics, THE Investment_System SHALL calculate current portfolio value as the sum of all Security_Account balances plus Trading_Cash_Account balance plus unrealized gains
3. WHEN viewing investment analytics, THE Investment_System SHALL show asset allocation by displaying each Security_Account balance as a percentage of total portfolio value
4. WHEN viewing investment analytics, THE Investment_System SHALL calculate income generated by summing all journal entries to Dividend_Income_Category and Interest_Income_Category for the specified period
5. THE Investment_System SHALL allow comparing investment portfolio performance across different time periods (YTD, 1Y, 3Y, 5Y, All Time)

### Requirement 14

**User Story:** As a user, I want to record interest income from bonds or cash holdings, so that I can track all income generated by my investment portfolio.

#### Acceptance Criteria

1. WHEN recording interest income, THE Investment_System SHALL require the amount, date, and optional description
2. WHEN recording interest income, THE Investment_System SHALL create a journal entry debiting the Trading_Cash_Account and crediting the Interest_Income_Category
3. THE Investment_System SHALL allow storing the security ticker symbol in the journal entry description or metadata when interest is associated with a specific security
4. WHEN viewing income reports, THE Investment_System SHALL display total interest income by summing all journal entries to the Interest_Income_Category for the specified period
5. THE Investment_System SHALL allow filtering interest income by investment portfolio and by date range

### Requirement 15

**User Story:** As a user, I want the system to maintain accounting accuracy through double-entry bookkeeping, so that my investment records are always balanced and auditable.

#### Acceptance Criteria

1. WHEN any investment transaction is recorded, THE Investment_System SHALL create balanced journal entries where the sum of all debit amounts equals the sum of all credit amounts
2. WHEN calculating Security_Account balances, THE Investment_System SHALL derive balances by summing all journal line amounts for that account
3. WHEN displaying investment portfolio value, THE Investment_System SHALL calculate it as the sum of the Trading_Cash_Account balance and all Security_Account balances within the portfolio group
4. THE Investment_System SHALL ensure that every journal entry has at least two journal lines and that the sum of all line amounts equals zero
5. THE Investment_System SHALL provide an audit trail by storing all investment transactions as journal entries that can be traced back to their original transaction type and details
