# Requirements Document

## Introduction

This document specifies requirements for normalizing the display of transaction amounts and account balances in a double-entry accounting system. The system currently maintains accurate double-entry bookkeeping at the database level but displays raw debit/credit amounts to users, causing confusion. This feature will implement a presentation layer that shows amounts in an intuitive, user-friendly format while preserving the underlying accounting accuracy.

## Glossary

- **Journal Entry**: A complete accounting transaction consisting of two or more journal lines that balance to zero
- **Journal Line**: A single line in a journal entry representing a debit or credit to one account
- **User Account**: A bank account, cash account, or credit card account owned by the user (type: "user")
- **Category Account**: An income or expense category used for transaction classification (type: "category")
- **System Account**: Internal accounts used for accounting purposes like "Opening Balance Equity" (type: "system")
- **Account Subtype**: Classification of accounts as either "asset" (natural debit balance) or "liability" (natural credit balance)
- **Display Amount**: The amount shown to users in the UI, normalized for intuitive understanding
- **Raw Amount**: The actual debit/credit amount stored in the database following accounting conventions
- **Account Balance**: The sum of all journal line amounts for an account
- **Display Balance**: The account balance normalized for user display

## Requirements

### Requirement 1

**User Story:** As a user viewing bank or cash account transactions, I want spending to show as negative amounts and income to show as positive amounts, so that I can intuitively understand money flowing in and out of my accounts.

#### Acceptance Criteria

1. WHEN a user views transactions for a bank account (user account with asset subtype) THEN the system SHALL display spending transactions with negative amounts
2. WHEN a user views transactions for a bank account (user account with asset subtype) THEN the system SHALL display income transactions with positive amounts
3. WHEN a user views transactions for a cash account (user account with asset subtype) THEN the system SHALL display spending transactions with negative amounts
4. WHEN a user views transactions for a cash account (user account with asset subtype) THEN the system SHALL display income transactions with positive amounts
5. WHEN a user views the balance for a bank or cash account THEN the system SHALL display the balance as a positive number when the account has funds and negative when overdrawn

### Requirement 2

**User Story:** As a user viewing credit card account transactions, I want spending to show as positive amounts and payments to show as negative amounts, so that I can see my outstanding balance growing with purchases and decreasing with payments.

#### Acceptance Criteria

1. WHEN a user views transactions for a credit card account (user account with liability subtype) THEN the system SHALL display spending transactions with positive amounts
2. WHEN a user views transactions for a credit card account (user account with liability subtype) THEN the system SHALL display payment transactions with negative amounts
3. WHEN a user views the balance for a credit card account THEN the system SHALL display the balance as a positive number representing the amount owed
4. WHEN a user views the balance for a credit card account with a credit balance THEN the system SHALL display the balance as a negative number

### Requirement 3

**User Story:** As a user viewing income category transactions, I want all income amounts to display as positive values, so that I can easily see how much I earned in each category.

#### Acceptance Criteria

1. WHEN a user views transactions for an income category account (category account with asset subtype) THEN the system SHALL display all transaction amounts as positive values
2. WHEN a user views the balance for an income category account THEN the system SHALL display the total income as a positive value
3. WHEN an income category account has transactions in multiple currencies THEN the system SHALL display each currency balance separately as positive values

### Requirement 4

**User Story:** As a user viewing expense category transactions, I want all expense amounts to display as positive values, so that I can easily see how much I spent in each category.

#### Acceptance Criteria

1. WHEN a user views transactions for an expense category account (category account with liability subtype) THEN the system SHALL display all transaction amounts as positive values
2. WHEN a user views the balance for an expense category account THEN the system SHALL display the total expenses as a positive value
3. WHEN an expense category account has transactions in multiple currencies THEN the system SHALL display each currency balance separately as positive values

### Requirement 5

**User Story:** As a developer maintaining the accounting system, I want the underlying journal entries to follow standard double-entry accounting principles, so that the system maintains data integrity and can be audited.

#### Acceptance Criteria

1. WHEN any transaction is created THEN the system SHALL store journal lines using standard debit/credit conventions (positive for debit, negative for credit)
2. WHEN any transaction is created THEN the system SHALL ensure all journal lines in an entry sum to zero
3. WHEN the system calculates account balances THEN the system SHALL sum raw journal line amounts without normalization
4. WHEN the system performs any accounting operation THEN the system SHALL maintain the accounting equation (Assets = Liabilities + Equity)
5. WHEN displaying amounts to users THEN the system SHALL apply normalization rules without modifying stored data

### Requirement 6

**User Story:** As a user viewing transfer transactions between accounts, I want the amounts to display correctly for both the source and destination accounts, so that I can understand the flow of money.

#### Acceptance Criteria

1. WHEN a user views a transfer from a bank account to another bank account THEN the system SHALL display a negative amount in the source account and a positive amount in the destination account
2. WHEN a user views a transfer from a bank account to a credit card (payment) THEN the system SHALL display a negative amount in the bank account and a negative amount in the credit card account
3. WHEN a user views a transfer between accounts with different currencies THEN the system SHALL display both amounts with their respective currencies and the exchange rate

### Requirement 7

**User Story:** As a user viewing the dashboard, I want income and expense summaries to show as positive values, so that I can quickly understand my financial activity without confusion about signs.

#### Acceptance Criteria

1. WHEN the dashboard displays total income for a period THEN the system SHALL show the amount as a positive value
2. WHEN the dashboard displays total expenses for a period THEN the system SHALL show the amount as a positive value
3. WHEN the dashboard displays net worth THEN the system SHALL calculate it as (total assets - total liabilities) and display with appropriate sign
4. WHEN the dashboard displays asset totals THEN the system SHALL show positive values for assets with positive balances
5. WHEN the dashboard displays liability totals THEN the system SHALL show positive values for liabilities owed

### Requirement 8

**User Story:** As a user importing transactions from bank statements, I want the system to correctly interpret transaction amounts based on the account type, so that my imported data displays correctly.

#### Acceptance Criteria

1. WHEN importing transactions into a bank account THEN the system SHALL interpret negative amounts as spending and positive amounts as income
2. WHEN importing transactions into a credit card account THEN the system SHALL interpret positive amounts as spending and negative amounts as payments
3. WHEN creating journal entries from imported data THEN the system SHALL store amounts using correct debit/credit conventions
4. WHEN displaying imported transactions THEN the system SHALL apply the same normalization rules as manual transactions
