# Investment Account Management Design Document

## Overview

The Investment Account Management system extends Bucky's existing account and account group infrastructure to provide comprehensive investment portfolio tracking. This system leverages the existing double-entry accounting foundation where each security position is represented as a separate Account, and related investment accounts are organized using AccountGroups. This approach ensures proper accounting treatment where each security appears as a distinct asset on the balance sheet, while maintaining full transaction history through journal entries.

## Architecture

### System Integration
The investment management system integrates with existing Bucky components:
- **Account System**: Uses existing Account model for Trading Cash and Security positions
- **AccountGroup System**: Uses existing AccountGroup to organize investment portfolios
- **Journal Entry System**: Uses existing JournalEntry and JournalLine for all transactions
- **Category Accounts**: Uses existing category accounts for income and expenses
- **Database Layer**: Adds new InvestmentProperties table for investment-specific metadata
- **UI Components**: New investment-specific pages and enhanced existing components

### Data Flow
1. **Portfolio Creation**: User creates an AccountGroup for the investment portfolio and a Trading Cash Account
2. **Security Purchase**: Creates Security Account (if new) and journal entry transferring value from Trading Cash to Security Account
3. **Security Sale**: Creates journal entry transferring cost basis from Security Account to Trading Cash, with gain/loss to category account
4. **Dividend Receipt**: Creates journal entry from Dividend Income category to Trading Cash (or directly to Security Account for reinvestment)
5. **Balance Calculation**: All balances derived from summing journal line amounts for each account
6. **Performance Metrics**: Calculated from account balances, journal entries, and stored market prices

### Key Design Principles
1. **Each Security = Separate Account**: AAPL, MSFT, VTSAX each have their own Account record
2. **Cost Basis = Account Balance**: The Security Account balance represents total cost basis
3. **Quantity Tracking**: Share quantities stored as metadata, not in account balance
4. **Market Value = Separate**: Current market prices stored separately from cost basis
5. **Pure Double-Entry**: All transactions flow through journal entries with balanced debits/credits

## Components and Interfaces

### Database Schema Extensions

#### 1. Account Model (Minor Extension)
The existing Account model needs one new relation field:

```prisma
model Account {
  id        String      @id @default(uuid())
  name      String      // e.g., "Trading Cash - Fidelity" or "AAPL Stock"
  type      AccountType // "user" for both cash and securities
  subtype   AccountSubtype @default(asset) // "asset" for investments
  currency  String      @default("USD")
  isArchived Boolean   @default(false)
  archivedAt DateTime?
  groupId   String?     // Links to investment portfolio AccountGroup
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  
  lines     JournalLine[]
  checkpoints Checkpoint[]
  creditCardProperties CreditCardProperties[]
  group     AccountGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)
  
  // NEW: Relation to investment properties
  investmentProperties InvestmentProperties?
  
  @@index([groupId])
}
```

#### 2. AccountGroup Model (No Changes Required)
The existing AccountGroup model already supports portfolio organization:

```prisma
model AccountGroup {
  id           String      @id @default(uuid())
  name         String      // e.g., "Fidelity 401(k)" or "Vanguard Brokerage"
  accountType  AccountType // "user" for investment portfolios
  displayOrder Int         @default(0)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  accounts     Account[]
  
  @@unique([name, accountType])
  @@index([accountType, displayOrder])
}
```

#### 3. New InvestmentProperties Model
Store investment-specific metadata for Security Accounts:

```prisma
model InvestmentProperties {
  id                String   @id @default(uuid())
  accountId         String   @unique
  
  // Security identification
  tickerSymbol      String   // e.g., "AAPL", "VTSAX"
  securityType      String?  // "stock", "bond", "mutual_fund", "etf", etc.
  
  // Quantity tracking (shares/units)
  quantity          Float    // Current number of shares owned
  
  // Cost basis method
  costBasisMethod   String   // "FIFO" or "AVERAGE_COST"
  
  // Lot tracking for FIFO (stored as JSON)
  lots              String?  // JSON array of {date, quantity, pricePerShare, amount}
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
  
  @@index([tickerSymbol])
}
```

#### 4. New SecurityPriceHistory Model
Store historical market prices for securities (by ticker symbol) to enable time-series analysis and historical portfolio valuation. Prices are shared across all accounts holding the same security:

```prisma
model SecurityPriceHistory {
  id            String   @id @default(uuid())
  
  // Security identification
  tickerSymbol  String   // e.g., "AAPL", "VTSAX"
  
  // Price data
  date          String   // Date of this price (YYYY-MM-DD)
  price         Float    // Market price per share on this date
  
  // Source tracking
  source        String?  // "manual", "import", "api", etc.
  
  createdAt     DateTime @default(now())
  
  @@unique([tickerSymbol, date])
  @@index([tickerSymbol, date])
}
```

#### 5. JournalEntry Extensions
Use existing JournalEntry with specific type values for investment transactions:

```prisma
// No schema changes needed - use existing JournalEntry with:
// - type: 'investment_buy', 'investment_sell', 'dividend_cash', 'dividend_reinvest', 
//         'investment_fee', 'stock_split', 'interest_income'
// - description: Contains transaction details (ticker, quantity, price, etc.)

model JournalEntry {
  id           String        @id @default(uuid())
  date         String        // Transaction date
  description  String?       // Contains investment transaction details
  type         String?       // Investment transaction type
  displayOrder Float?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  lines        JournalLine[]
  
  @@index([displayOrder])
}
```

**Note on Type Field Usage:**
The `type` field is nullable to maintain backward compatibility with existing transactions. For investment transactions, we will:
1. Always set the `type` field to a specific value (e.g., 'investment_buy')
2. Use a TypeScript enum to define valid investment transaction types
3. Validate the type value in the service layer before creating journal entries
4. Consider adding a database check constraint in a future migration to enforce valid type values
5. Document all valid type values in code comments and service interfaces

This approach allows the system to distinguish investment transactions from regular transactions while maintaining flexibility for future transaction types.

#### 6. Migration Strategy

**Phase 1: Create InvestmentProperties table**
```sql
CREATE TABLE InvestmentProperties (
    id TEXT PRIMARY KEY,
    accountId TEXT NOT NULL UNIQUE,
    tickerSymbol TEXT NOT NULL,
    securityType TEXT,
    quantity REAL NOT NULL DEFAULT 0,
    costBasisMethod TEXT NOT NULL DEFAULT 'FIFO',
    lots TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accountId) REFERENCES Account (id) ON DELETE CASCADE
);

CREATE INDEX idx_investment_ticker ON InvestmentProperties(tickerSymbol);
```

**Phase 2: Create SecurityPriceHistory table**
```sql
CREATE TABLE SecurityPriceHistory (
    id TEXT PRIMARY KEY,
    tickerSymbol TEXT NOT NULL,
    date TEXT NOT NULL,
    price REAL NOT NULL,
    source TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tickerSymbol, date)
);

CREATE INDEX idx_price_history_lookup ON SecurityPriceHistory(tickerSymbol, date);
```

**Phase 3: Create default category accounts**
```sql
-- Create investment-related category accounts if they don't exist
INSERT INTO Account (id, name, type, subtype, currency)
VALUES 
  ('cat-dividend-income', 'Dividend Income', 'category', 'asset', 'USD'),
  ('cat-interest-income', 'Interest Income', 'category', 'asset', 'USD'),
  ('cat-realized-gains', 'Realized Gains/Losses', 'category', 'asset', 'USD'),
  ('cat-investment-expenses', 'Investment Expenses', 'category', 'asset', 'USD')
ON CONFLICT DO NOTHING;
```

### Core Services

#### InvestmentService
```typescript
// Investment transaction types
enum InvestmentTransactionType {
  BUY = 'investment_buy',
  SELL = 'investment_sell',
  DIVIDEND_CASH = 'dividend_cash',
  DIVIDEND_REINVEST = 'dividend_reinvest',
  INTEREST = 'interest_income',
  FEE = 'investment_fee',
  STOCK_SPLIT = 'stock_split',
  CASH_DEPOSIT = 'investment_cash_deposit',
  CASH_WITHDRAWAL = 'investment_cash_withdrawal'
}

interface InvestmentService {
  // Portfolio Management
  createInvestmentPortfolio(name: string, currency?: string): Promise<{
    group: AccountGroup;
    tradingCashAccount: Account;
  }>;
  getInvestmentPortfolios(): Promise<AccountGroup[]>;
  getPortfolioAccounts(portfolioId: string): Promise<{
    tradingCash: Account;
    securities: Array<Account & { investmentProperties: InvestmentProperties }>;
  }>;
  
  // Security Account Management
  createSecurityAccount(
    portfolioId: string,
    tickerSymbol: string,
    securityType?: string,
    costBasisMethod?: 'FIFO' | 'AVERAGE_COST'
  ): Promise<Account>;
  getSecurityAccount(portfolioId: string, tickerSymbol: string): Promise<Account | null>;
  
  // Price History Management (by ticker symbol, shared across all accounts)
  recordMarketPrice(tickerSymbol: string, price: number, date: string, source?: string): Promise<void>;
  getMarketPrice(tickerSymbol: string, date: string): Promise<number | null>;
  getLatestMarketPrice(tickerSymbol: string): Promise<{ price: number; date: string } | null>;
  getPriceHistory(tickerSymbol: string, startDate?: string, endDate?: string): Promise<Array<{
    date: string;
    price: number;
    source?: string;
  }>>;
  importPriceHistory(tickerSymbol: string, prices: Array<{ date: string; price: number }>): Promise<void>;
  
  // Transaction Recording
  recordBuy(params: BuyTransactionParams): Promise<JournalEntry>;
  recordSell(params: SellTransactionParams): Promise<JournalEntry>;
  recordDividend(params: DividendParams): Promise<JournalEntry>;
  recordReinvestedDividend(params: ReinvestedDividendParams): Promise<JournalEntry>;
  recordInterest(params: InterestParams): Promise<JournalEntry>;
  recordFee(params: FeeParams): Promise<JournalEntry>;
  recordStockSplit(params: StockSplitParams): Promise<void>;
  
  // Cash Management
  depositCash(portfolioId: string, amount: number, fromAccountId: string, date: string): Promise<JournalEntry>;
  withdrawCash(portfolioId: string, amount: number, toAccountId: string, date: string): Promise<JournalEntry>;
  
  // Cost Basis Calculations
  calculateCostBasis(accountId: string, quantity: number): Promise<{
    totalCost: number;
    lots?: Array<{ date: string; quantity: number; cost: number }>;
  }>;
  getAverageCostPerShare(accountId: string): Promise<number>;
}

interface BuyTransactionParams {
  portfolioId: string;
  tickerSymbol: string;
  quantity: number;
  pricePerShare: number;
  date: string;
  fee?: number;
  description?: string;
}

interface SellTransactionParams {
  portfolioId: string;
  tickerSymbol: string;
  quantity: number;
  pricePerShare: number;
  date: string;
  fee?: number;
  description?: string;
}

interface DividendParams {
  portfolioId: string;
  tickerSymbol: string;
  amount: number;
  date: string;
  isReturnOfCapital?: boolean;
}

interface ReinvestedDividendParams {
  portfolioId: string;
  tickerSymbol: string;
  dividendAmount: number;
  reinvestmentPrice: number;
  date: string;
  recordAsIncome: boolean;
}

interface InterestParams {
  portfolioId: string;
  amount: number;
  date: string;
  description?: string;
}

interface FeeParams {
  portfolioId: string;
  amount: number;
  date: string;
  description: string;
}

interface StockSplitParams {
  accountId: string;
  splitRatio: number; // e.g., 2.0 for 2-for-1 split
  date: string;
}
```

#### InvestmentAnalyticsService
```typescript
interface InvestmentAnalyticsService {
  // Portfolio Metrics
  getPortfolioValue(portfolioId: string): Promise<{
    totalCostBasis: number;
    totalMarketValue: number;
    totalUnrealizedGain: number;
    totalUnrealizedGainPercent: number;
    cashBalance: number;
  }>;
  
  getPortfolioPerformance(portfolioId: string, period: TimePeriod): Promise<{
    totalReturn: number;
    totalReturnPercent: number;
    realizedGains: number;
    unrealizedGains: number;
    dividendIncome: number;
    interestIncome: number;
    fees: number;
  }>;
  
  // Position Analysis
  getPositionDetails(accountId: string, asOfDate?: string): Promise<{
    tickerSymbol: string;
    quantity: number;
    costBasis: number;
    costPerShare: number;
    marketPrice: number;
    marketValue: number;
    unrealizedGain: number;
    unrealizedGainPercent: number;
  }>;
  
  getAllPositions(portfolioId: string, asOfDate?: string): Promise<PositionDetails[]>;
  
  // Historical Portfolio Valuation
  getPortfolioValueHistory(portfolioId: string, startDate: string, endDate: string): Promise<Array<{
    date: string;
    totalValue: number;
    cashBalance: number;
    securitiesValue: number;
  }>>;
  
  // Asset Allocation
  getAssetAllocation(portfolioId: string): Promise<Array<{
    tickerSymbol: string;
    marketValue: number;
    percentOfPortfolio: number;
  }>>;
  
  // Income Tracking
  getDividendIncome(portfolioId: string, startDate: string, endDate: string): Promise<{
    total: number;
    byTicker: Record<string, number>;
  }>;
  
  getInterestIncome(portfolioId: string, startDate: string, endDate: string): Promise<number>;
  
  // Realized Gains
  getRealizedGains(portfolioId: string, startDate: string, endDate: string): Promise<Array<{
    date: string;
    tickerSymbol: string;
    quantity: number;
    costBasis: number;
    saleProceeds: number;
    realizedGain: number;
    holdingPeriod: 'short' | 'long'; // < 1 year or >= 1 year
  }>>;
  
  // Transaction History
  getInvestmentTransactions(portfolioId: string, filters?: TransactionFilters): Promise<InvestmentTransaction[]>;
}

type TimePeriod = 'YTD' | '1Y' | '3Y' | '5Y' | 'ALL';

interface TransactionFilters {
  startDate?: string;
  endDate?: string;
  tickerSymbol?: string;
  transactionType?: string;
}

interface InvestmentTransaction {
  id: string;
  date: string;
  type: string;
  tickerSymbol?: string;
  quantity?: number;
  pricePerShare?: number;
  amount: number;
  description: string;
}
```

#### ImportService
```typescript
interface ImportService {
  // Import investment transactions from CSV
  importInvestmentTransactions(
    portfolioId: string,
    csvData: string,
    mapping: ColumnMapping
  ): Promise<{
    imported: number;
    skipped: number;
    errors: Array<{ row: number; error: string }>;
  }>;
  
  validateImportData(csvData: string, mapping: ColumnMapping): Promise<ValidationResult>;
}

interface ColumnMapping {
  date: string;
  type: string;
  ticker: string;
  quantity?: string;
  price?: string;
  amount: string;
  fee?: string;
  description?: string;
}
```

### UI Components

#### InvestmentPortfolioList
- Overview of all investment portfolios
- Total portfolio values and performance metrics
- Quick access to create new portfolio

#### PortfolioDetailsPage
- Detailed view of a single investment portfolio
- List of all positions with current values and gains/losses
- Trading cash balance
- Performance charts and metrics
- Quick transaction entry

#### PositionDetailsPage
- Detailed view of a single security position
- Transaction history for that security
- Cost basis breakdown (lots for FIFO)
- Performance metrics and charts
- Quick buy/sell actions

#### TransactionEntryModal
- Form for recording investment transactions
- Type-specific fields (buy, sell, dividend, etc.)
- Real-time validation
- Fee entry support

#### ImportTransactionsWizard
- CSV file upload
- Column mapping interface
- Preview and validation
- Batch import with error handling

#### PerformanceReportsPage
- Portfolio performance over time
- Asset allocation charts
- Income reports (dividends, interest)
- Realized gains/losses reports
- Tax reporting support

## Data Models

### Investment Properties
```typescript
interface InvestmentProperties {
  id: string;
  accountId: string;
  tickerSymbol: string;
  securityType?: string;
  quantity: number;
  costBasisMethod: 'FIFO' | 'AVERAGE_COST';
  lots?: Lot[]; // For FIFO method
  createdAt: string;
  updatedAt: string;
}

interface Lot {
  date: string;
  quantity: number;
  pricePerShare: number;
  amount: number;
}

interface SecurityPriceHistory {
  id: string;
  tickerSymbol: string;
  date: string;
  price: number;
  source?: string;
  createdAt: string;
}
```

### Position Details
```typescript
interface PositionDetails {
  accountId: string;
  tickerSymbol: string;
  securityType?: string;
  quantity: number;
  costBasis: number;
  costPerShare: number;
  marketPrice?: number;
  marketValue?: number;
  unrealizedGain?: number;
  unrealizedGainPercent?: number;
}
```

### Portfolio Summary
```typescript
interface PortfolioSummary {
  portfolioId: string;
  portfolioName: string;
  totalCostBasis: number;
  totalMarketValue: number;
  cashBalance: number;
  totalValue: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
  positionCount: number;
}
```

## Error Handling

### Validation Rules
- Ticker symbol must be non-empty string
- Quantity must be positive number
- Price per share must be positive number
- Transaction date cannot be in the future
- Sell quantity cannot exceed current position quantity
- Withdrawal amount cannot exceed trading cash balance
- Split ratio must be positive number
- Cost basis method must be 'FIFO' or 'AVERAGE_COST'

### Error Scenarios
- **Insufficient Shares**: Attempting to sell more shares than owned
- **Insufficient Cash**: Attempting to buy with insufficient trading cash
- **Invalid Ticker**: Ticker symbol not found or invalid format
- **Duplicate Security Account**: Attempting to create security account that already exists
- **Missing Market Price**: Calculating unrealized gains without market price
- **Invalid Cost Basis**: Cost basis calculation fails due to missing lot data

### Error Recovery
- Graceful degradation when market prices are unavailable (show cost basis only)
- Fallback to average cost when FIFO lot data is incomplete
- Clear error messages with actionable guidance
- Transaction rollback on journal entry creation failures

## Testing Strategy

### Unit Tests
- Cost basis calculations (FIFO and average cost)
- Unrealized gain/loss calculations
- Stock split quantity adjustments
- Portfolio value aggregation
- Transaction validation logic

### Integration Tests
- Portfolio creation with trading cash account
- Buy transaction creating security account and journal entries
- Sell transaction with gain/loss calculation
- Dividend recording (cash and reinvested)
- Import transactions from CSV

### User Acceptance Tests
- Create investment portfolio workflow
- Record series of buy/sell transactions
- Track dividends and calculate income
- View performance reports and metrics
- Import transactions from brokerage statement

### Performance Tests
- Portfolio value calculation with hundreds of positions
- Transaction history queries with thousands of entries
- Cost basis calculations with many lots
- Asset allocation calculations across multiple portfolios

## Implementation Considerations

### Database Migration Strategy
1. Add investmentProperties relation to Account model
2. Create InvestmentProperties table
3. Create SecurityPriceHistory table with unique constraint on (tickerSymbol, date) - prices are shared across all accounts holding the same security
4. Create default investment category accounts
5. Add indexes for efficient queries on ticker symbols and price history lookups

### Backward Compatibility
- Existing accounts and account groups continue to work unchanged
- Investment features are additive, not breaking
- Can gradually migrate existing investment tracking to new system

### Performance Optimizations
- Index on tickerSymbol for fast security lookups
- Cache market prices to reduce recalculation
- Efficient lot tracking using JSON storage
- Aggregate portfolio values with single query

### Security Considerations
- Validate all user inputs for investment transactions
- Prevent negative quantities or prices
- Ensure journal entries always balance
- Audit logging for all investment transactions
- Access controls for portfolio management

### Data Integrity
- All transactions must create balanced journal entries
- Security account balances must equal sum of journal lines
- Quantity metadata must match transaction history
- Cost basis must be non-negative
- Market prices stored separately from cost basis


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Double-entry balance invariant
*For any* investment transaction (buy, sell, dividend, fee, etc.), the sum of all debit amounts SHALL equal the sum of all credit amounts in the resulting journal entry
**Validates: Requirements 15.1, 15.4**

### Property 2: Portfolio creation completeness
*For any* investment portfolio creation, the system SHALL create both an AccountGroup and a Trading_Cash_Account linked to that group
**Validates: Requirements 1.1, 1.2**

### Property 3: Buy transaction cost calculation
*For any* buy transaction with quantity Q, price P, and fee F, the total cost SHALL equal (Q × P) + F
**Validates: Requirements 2.2**

### Property 4: Sell transaction proceeds calculation
*For any* sell transaction with quantity Q, price P, and fee F, the sale proceeds SHALL equal (Q × P) - F
**Validates: Requirements 3.2**

### Property 5: FIFO cost basis ordering
*For any* security position with multiple lots purchased at different times, when selling shares using FIFO method, the cost basis SHALL be calculated using the oldest lots first
**Validates: Requirements 6.3**

### Property 6: Average cost calculation
*For any* security position using average cost method, the cost per share SHALL equal the Security_Account balance divided by the total quantity of shares owned
**Validates: Requirements 6.4**

### Property 7: Stock split cost basis invariant
*For any* stock split with any split ratio, the Security_Account balance (total cost basis) SHALL remain unchanged before and after the split
**Validates: Requirements 10.3**

### Property 8: Stock split quantity adjustment
*For any* stock split with ratio R, the quantity of shares SHALL be multiplied by R and the cost per share SHALL be divided by R
**Validates: Requirements 10.2, 10.4**

### Property 9: Unrealized gain calculation
*For any* security position with quantity Q, market price M, and cost basis C, the unrealized gain SHALL equal (Q × M) - C
**Validates: Requirements 8.2**

### Property 10: Portfolio value aggregation
*For any* investment portfolio, the total portfolio value SHALL equal the sum of the Trading_Cash_Account balance plus all Security_Account balances plus all unrealized gains
**Validates: Requirements 13.2, 15.3**

### Property 11: Realized gain/loss recording
*For any* sell transaction where sale proceeds P differ from cost basis C, a journal line SHALL be created to the Realized_Gain_Loss_Category for the amount (P - C)
**Validates: Requirements 3.5**

### Property 12: Dividend reinvestment share calculation
*For any* reinvested dividend with amount A and reinvestment price P, the number of shares purchased SHALL equal A ÷ P
**Validates: Requirements 5.2**

### Property 13: Return of capital cost basis reduction
*For any* dividend categorized as return of capital with amount A, the Security_Account balance SHALL decrease by A
**Validates: Requirements 4.4**

### Property 14: Insufficient balance validation
*For any* cash withdrawal with amount A from a Trading_Cash_Account with balance B where A > B, the transaction SHALL be rejected
**Validates: Requirements 7.4**

### Property 15: Security account balance derivation
*For any* Security_Account, the account balance SHALL equal the sum of all journal line amounts for that account
**Validates: Requirements 15.2**

### Property 16: Asset allocation percentage sum
*For any* investment portfolio, the sum of all asset allocation percentages SHALL equal 100% (within rounding tolerance)
**Validates: Requirements 13.3**

### Property 17: Transaction import duplicate detection
*For any* two transactions with identical date, security ticker, quantity, and amount, the second import attempt SHALL be detected as a duplicate
**Validates: Requirements 12.4**

### Property 18: Journal entry minimum lines
*For any* journal entry, there SHALL be at least two journal lines and the sum of all line amounts SHALL equal zero
**Validates: Requirements 15.4**

### Property 19: Input validation completeness
*For any* investment transaction type, all required fields (as specified in requirements) SHALL be validated as non-empty and properly formatted before the transaction is recorded
**Validates: Requirements 2.1, 3.1, 4.1, 5.1, 7.3, 10.1, 11.1, 14.1**

### Property 20: Income aggregation accuracy
*For any* time period, the total income reported SHALL equal the sum of all journal line amounts to Dividend_Income_Category and Interest_Income_Category accounts for that period
**Validates: Requirements 13.4, 14.4**
