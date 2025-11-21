# Requirements Document

## Introduction

This document outlines requirements for improving category account management in the personal bookkeeping application. Currently, category accounts are tightly coupled to specific currencies, making it difficult to use them across multi-currency transactions. Additionally, category accounts are mixed with user accounts in the UI, and users cannot manually create category accounts. These improvements will make the application more flexible for multi-currency users and provide better organization of different account types.

## Glossary

- **Category Account**: An account of type "category" used to classify income and expense transactions (e.g., "Groceries", "Salary", "Rent")
- **User Account**: An account of type "user" representing actual financial accounts owned by the user (e.g., bank accounts, cash, credit cards)
- **System Account**: An account of type "system" used for internal bookkeeping purposes (e.g., "Opening Balance Equity", "Checkpoint Adjustment")
- **Multi-Currency Transaction**: A transaction involving accounts with different currencies, requiring exchange rate calculation
- **Journal Entry**: A double-entry bookkeeping transaction with at least two journal lines
- **Journal Line**: A single debit or credit entry within a journal entry, associated with one account
- **Import Wizard**: The UI component that allows users to import transactions from CSV files
- **Accounts Page**: The main page displaying all accounts with their balances and management options

## Requirements

### Requirement 1: Currency-Agnostic Category Accounts

**User Story:** As a user with multiple currencies, I want category accounts to work seamlessly across all my currencies, so that I don't need to create duplicate categories for each currency.

#### Acceptance Criteria

1. WHEN a transaction is created between a user account and a category account, THE System SHALL allow the transaction regardless of currency mismatch between the accounts
2. WHEN a category account is used in a transaction, THE System SHALL record the journal line amount in the user account's currency on the user account side, and in the same currency on the category account side
3. WHEN displaying category account balances, THE System SHALL aggregate balances across all currencies and display them grouped by currency
4. THE System SHALL store each journal line with its own currency field, allowing category accounts to accumulate balances in multiple currencies
5. WHERE a category account does not exist for a transaction, THE System SHALL use the "Uncategorized Income" or "Uncategorized Expense" account and record the transaction in the user account's currency

### Requirement 2: Separate Category Account Management UI

**User Story:** As a user, I want to view and manage category accounts on a dedicated page separate from my user accounts, so that I can easily distinguish between my actual financial accounts and my expense/income categories.

#### Acceptance Criteria

1. THE System SHALL provide a dedicated Categories page accessible from the main navigation
2. THE Categories page SHALL display only accounts of type "category"
3. THE Accounts page SHALL display only user accounts and system accounts by default
4. WHEN the user navigates to the Categories page, THE System SHALL display all category accounts with their names, subtypes, and balances
5. WHEN displaying category accounts, THE System SHALL show aggregated balances grouped by currency for each category

### Requirement 3: Manual Category Account Creation

**User Story:** As a user, I want to manually create new category accounts through the UI, so that I can organize my income and expenses according to my personal classification system.

#### Acceptance Criteria

1. THE Accounts Page SHALL provide a button or option to create a new category account
2. WHEN the user initiates category account creation, THE System SHALL display a modal or form for entering category details
3. THE category creation form SHALL require a category name and subtype (asset for income, liability for expense)
4. THE category creation form SHALL allow the user to optionally specify a default currency
5. WHEN the user submits the category creation form, THE System SHALL create a new category account with type "category"
6. THE System SHALL validate that the category name is unique among category accounts before creation

### Requirement 4: Category Account Selection During Import

**User Story:** As a user importing transactions, I want to easily map my transactions to existing category accounts or create new ones, so that my transactions are properly categorized without manual intervention after import.

#### Acceptance Criteria

1. WHEN importing a transaction that does not specify a category account, THE System SHALL use the "Uncategorized Income" or "Uncategorized Expense" account based on the transaction amount sign
2. WHEN importing a transaction with a specified category that does not exist, THE System SHALL create a new category account with that name
3. WHEN auto-creating a category account during import, THE System SHALL determine the subtype (asset for income, liability for expense) based on the transaction amount sign
4. WHEN auto-creating a category account during import, THE System SHALL set the currency to match the user account currency for the first transaction
5. THE System SHALL notify the user after import completion about any auto-created category accounts

### Requirement 5: Category Account Balance Reporting

**User Story:** As a user with multi-currency transactions, I want to see category account balances broken down by currency, so that I can understand my income and expenses in each currency separately.

#### Acceptance Criteria

1. WHEN displaying a category account balance, THE System SHALL show separate balance amounts for each currency used in transactions
2. THE Accounts Page SHALL display category account balances with currency labels (e.g., "Groceries: 500.00 USD, 300.00 CAD")
3. WHEN viewing category account transaction history, THE System SHALL display the currency for each transaction line
4. THE System SHALL calculate total income and expense by currency for dashboard reporting
5. WHERE a category account has transactions in multiple currencies, THE System SHALL display all currency balances without attempting automatic conversion
