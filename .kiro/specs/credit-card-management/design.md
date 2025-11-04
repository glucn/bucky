# Enhanced Credit Card Management Design Document

## Overview

The Enhanced Credit Card Management system extends Bucky's existing account management to provide specialized functionality for credit card accounts. This system builds upon the current double-entry accounting foundation while adding credit card-specific features like credit limits, payment tracking, statement reconciliation, and transaction/posting date management.

## Architecture

### System Integration
The credit card management system integrates with existing Bucky components:
- **Database Layer**: Extends current Prisma schema with credit card-specific fields
- **Account Management**: Enhances existing account system for credit card properties
- **Transaction System**: Extends journal entries to support transaction/posting dates
- **UI Components**: New credit card-specific pages and enhanced existing components
- **Dashboard Integration**: Enhanced dashboard to display credit card metrics

### Data Flow
1. **Credit Card Setup**: User creates/configures credit card accounts with specific properties
2. **Property Updates**: When properties change, previous version is marked inactive and new version is created
3. **Transaction Recording**: Transactions include both transaction and posting dates
4. **Payment Identification**: Payments identified as transactions where credit card is the "to" account (receiving money)
5. **Balance Calculation**: Real-time calculation of balances, available credit, and utilization using current properties
6. **Statement Processing**: Periodic statement reconciliation using posting dates
7. **Metrics Display**: Real-time display of credit card metrics on dashboard and account pages

## Components and Interfaces

### Database Schema Extensions

#### 1. Account Model (No Changes)
Keep the existing Account model clean and focused:

```prisma
model Account {
  id        String      @id @default(uuid())
  name      String
  type      AccountType
  subtype   AccountSubtype @default(asset)
  currency  String      @default("USD")
  isArchived Boolean   @default(false)
  archivedAt DateTime?
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  
  lines     JournalLine[]
  checkpoints Checkpoint[]
  
  // NEW: Relations to account-specific properties
  creditCardProperties CreditCardProperties[] // One-to-many for versioning
}
```

#### 2. New CreditCardProperties Model
Create a versioned table for credit card-specific properties:

```prisma
model CreditCardProperties {
  id                    String   @id @default(uuid())
  accountId             String   
  creditLimit           Float    // Credit limit amount
  interestRate          Float    // Annual percentage rate (as decimal, e.g., 0.1899 for 18.99%)
  statementClosingDay   Int      // Day of month statement closes (1-31)
  paymentDueDay         Int      // Day of month payment is due (1-31)
  minimumPaymentPercent Float    // Minimum payment as percentage (e.g., 0.02 for 2%)
  
  // Versioning fields
  effectiveDate         String   // Date these properties became effective (YYYY-MM-DD)
  endDate               String?  // Date these properties ended (YYYY-MM-DD), null for current
  isActive              Boolean  @default(true) // Whether this is the current active version
  
  // Statement tracking (separate from properties versioning)
  lastStatementBalance  Float?   // Balance from last reconciled statement
  lastStatementDate     String?  // Date of last reconciled statement (YYYY-MM-DD)
  
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  
  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
  
  @@index([accountId, effectiveDate])
  @@index([accountId, isActive])
}
```

#### 3. JournalEntry Model Extensions
Add posting date field while keeping existing date field as transaction date:

```prisma
model JournalEntry {
  id          String        @id @default(uuid())
  date        String        // Existing field - represents transaction date
  description String?
  type        String?       // e.g., 'regular', 'currency_transfer'
  
  // NEW: Enhanced date tracking for credit cards
  postingDate String?       // Date posted to account (YYYY-MM-DD)
  
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  lines       JournalLine[]
}
```

#### 4. Statement Reconciliation (Using Existing Journal Entry System)
Use the existing journal entry system with a special type, no additional fields needed:

```prisma
// No new model or fields needed - use existing JournalEntry with:
// - type: 'statement_reconciliation'
// - date: statement closing date
// - description: "Statement Reconciliation - Balance: $X.XX" (statement balance encoded in description)
// - lines: adjustment lines to match statement balance (similar to checkpoint system)

model JournalEntry {
  id          String        @id @default(uuid())
  date        String        // Statement closing date for reconciliation entries
  description String?       // Will contain statement balance info for reconciliation entries
  type        String?       // 'statement_reconciliation' for statement entries
  postingDate String?       
  
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  lines       JournalLine[]
}
```

#### 5. Migration Strategy
The migration will be implemented in phases:

**Phase 1: Add posting date field to JournalEntry table**
```sql
-- Add posting date field to JournalEntry table
ALTER TABLE JournalEntry ADD COLUMN postingDate TEXT;
```

**Phase 2: Create CreditCardProperties table with versioning**
```sql
CREATE TABLE CreditCardProperties (
    id TEXT PRIMARY KEY,
    accountId TEXT NOT NULL,
    creditLimit REAL NOT NULL,
    interestRate REAL NOT NULL,
    statementClosingDay INTEGER NOT NULL,
    paymentDueDay INTEGER NOT NULL,
    minimumPaymentPercent REAL NOT NULL,
    effectiveDate TEXT NOT NULL,
    endDate TEXT,
    isActive BOOLEAN NOT NULL DEFAULT 1,
    lastStatementBalance REAL,
    lastStatementDate TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accountId) REFERENCES Account (id) ON DELETE CASCADE
);

CREATE INDEX idx_creditcard_account_date ON CreditCardProperties(accountId, effectiveDate);
CREATE INDEX idx_creditcard_account_active ON CreditCardProperties(accountId, isActive);
```

**Phase 3: Data migration for existing records**
```sql
-- Set postingDate to existing date for all existing entries (transaction date remains in date field)
UPDATE JournalEntry 
SET postingDate = date 
WHERE postingDate IS NULL;
```

### Core Services

#### CreditCardService
```typescript
interface CreditCardService {
  // Account Management
  setupCreditCard(accountId: string, properties: CreditCardPropertiesInput): Promise<CreditCardProperties>;
  updateCreditCardProperties(accountId: string, properties: CreditCardPropertiesInput): Promise<CreditCardProperties>;
  getCurrentCreditCardProperties(accountId: string): Promise<CreditCardProperties | null>;
  getCreditCardPropertiesHistory(accountId: string): Promise<CreditCardProperties[]>;
  getCreditCardPropertiesAtDate(accountId: string, date: string): Promise<CreditCardProperties | null>;
  
  // Balance and Credit Calculations
  getAvailableCredit(accountId: string): Promise<number>;
  getCreditUtilization(accountId: string): Promise<number>;
  getMinimumPayment(accountId: string): Promise<number>;
  
  // Payment Management
  recordPayment(accountId: string, amount: number, paymentDate: string, fromAccountId: string): Promise<JournalEntry>;
  getPaymentHistory(accountId: string, months?: number): Promise<PaymentAnalysis[]>;
  
  // Statement Reconciliation (using existing JournalEntry system)
  createStatementReconciliation(accountId: string, statementDate: string, statementBalance: number): Promise<JournalEntry>;
  getStatementReconciliations(accountId: string): Promise<JournalEntry[]>;
  isStatementReconciled(accountId: string, statementDate: string): Promise<boolean>;
}
```

#### AnalyticsService
```typescript
interface AnalyticsService {
  // Credit Card Metrics
  getCreditCardMetrics(accountId: string): Promise<CreditCardMetrics>;
  getSpendingTrends(accountId: string, months: number): Promise<SpendingTrend[]>;
  
  // Payment Analysis (using existing JournalEntry data)
  analyzePaymentHistory(accountId: string): Promise<PaymentAnalysis[]>;
  categorizeTransaction(journalEntry: JournalEntry, accountId: string): 'payment' | 'purchase' | 'fee';
  
  // Interest Calculations
  calculateInterestCharges(accountId: string, balance: number, days: number): Promise<number>;
  getPaymentImpactAnalysis(accountId: string, paymentAmount: number): Promise<PaymentImpact>;
}
```

### UI Components

#### CreditCardDashboard
- Overview of all credit cards with key metrics
- Available credit, utilization, and upcoming payments
- Quick payment entry and balance updates

#### CreditCardDetailsPage
- Detailed view of individual credit card
- Transaction history with transaction/posting dates
- Payment scheduling and history
- Statement reconciliation interface

#### CreditCardSetupModal
- Configuration of credit card properties
- Credit limit, APR, statement dates setup
- Payment reminder preferences

#### StatementReconciliationWizard
- Step-by-step statement reconciliation process
- Transaction matching by posting date ranges
- Discrepancy identification and resolution

## Data Models

### Credit Card Properties (Versioned)
```typescript
interface CreditCardProperties {
  id: string;
  accountId: string;
  creditLimit: number;
  interestRate: number;
  statementClosingDay: number;
  paymentDueDay: number;
  minimumPaymentPercent: number;
  effectiveDate: string;        // When these properties became effective
  endDate?: string;             // When these properties ended (null for current)
  isActive: boolean;            // Whether this is the current version
  lastStatementBalance?: number;
  lastStatementDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreditCardPropertiesInput {
  creditLimit: number;
  interestRate: number;
  statementClosingDay: number;
  paymentDueDay: number;
  minimumPaymentPercent: number;
  effectiveDate: string;
}
```

### Payment Analysis (Derived from existing JournalEntry data)
```typescript
interface PaymentAnalysis {
  entryId: string;           // Reference to existing JournalEntry
  accountId: string;         // Credit card account
  amount: number;            // Payment amount (from JournalLine)
  paymentDate: string;       // Date from JournalEntry
  paymentType: 'minimum' | 'full' | 'partial';  // Calculated based on balance
  balanceAfterPayment: number;  // Calculated balance after this payment
}
```

### Statement Reconciliation (Using existing JournalEntry system)
```typescript
interface StatementReconciliationEntry extends JournalEntry {
  type: 'statement_reconciliation';
  // Statement balance encoded in description like: "Statement Reconciliation - Balance: $1,234.56"
  // Adjustment amounts will be in the journal lines
}

// Helper function to extract statement balance from description
function parseStatementBalance(description: string): number | null {
  const match = description.match(/Balance:\s*\$?([\d,.-]+)/);
  return match ? parseFloat(match[1].replace(/,/g, '')) : null;
}
```

### Credit Card Metrics
```typescript
interface CreditCardMetrics {
  accountId: string;
  currentBalance: number;
  availableCredit: number;
  creditUtilization: number;
  minimumPayment: number;
  nextPaymentDue?: string;
  lastPaymentAmount?: number;
  lastPaymentDate?: string;
}
```

## Error Handling

### Validation Rules
- Credit limit must be positive number
- Interest rate must be between 0 and 100
- Statement closing day must be 1-31
- Payment due day must be after statement closing day
- Transaction date cannot be in the future
- Posting date must be on or after transaction date

### Error Scenarios
- **Invalid Credit Card Setup**: Missing required fields, invalid date configurations
- **Transaction Date Conflicts**: Posting date before transaction date
- **Statement Reconciliation Failures**: Unmatched transactions, balance discrepancies
- **Payment Processing Errors**: Insufficient account balance, invalid payment amounts

### Error Recovery
- Graceful degradation when credit card properties are missing
- Fallback to transaction date when posting date is not available
- Manual reconciliation options when automatic matching fails

## Testing Strategy

### Unit Tests
- Credit card calculation functions (utilization, available credit, minimum payment)
- Date validation and statement period calculations
- Credit card metrics calculation logic
- Payment processing workflows

### Integration Tests
- Credit card account creation and property updates
- Transaction recording with dual dates
- Statement reconciliation end-to-end process
- Dashboard integration with credit card metrics display

### User Acceptance Tests
- Credit card setup workflow
- Daily transaction entry with posting dates
- Monthly statement reconciliation process
- Credit card analytics and reporting functionality

### Performance Tests
- Credit utilization calculations with large transaction volumes
- Statement reconciliation with thousands of transactions
- Credit card metrics calculation performance with multiple accounts

## Implementation Considerations

### Database Migration Strategy
1. Add new fields to existing Account table for credit card properties
2. Add transactionDate and postingDate fields to JournalEntry table
3. Create new StatementReconciliation table
4. Create indexes for efficient date-range queries

### Backward Compatibility
- Existing accounts continue to work without credit card properties
- Existing transactions default posting date to transaction date
- Gradual migration of existing credit card accounts to new system

### Performance Optimizations
- Index on posting dates for efficient statement period queries
- Cached calculations for frequently accessed metrics (utilization, available credit)
- Efficient calculation of credit card metrics

### Security Considerations
- Sensitive credit card data (limits, rates) encrypted at rest
- Access controls for credit card management functions
- Audit logging for all credit card property changes