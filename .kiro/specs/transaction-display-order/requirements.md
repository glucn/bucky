# Requirements Document

## Introduction

This feature enables users to manually adjust the display order of transactions within their accounting system. Since multiple transactions can occur on the same date, users need the ability to control the sequence in which these transactions appear. The system uses a double-entry bookkeeping model where each transaction (JournalEntry) creates corresponding entries in multiple accounts through JournalLines. When a user reorders transactions in one account view, the system must maintain consistent ordering across all related account views to preserve the integrity of the accounting records.

## Glossary

- **Transaction**: A JournalEntry record representing a financial event with a date, description, and associated journal lines
- **Journal Line**: A JournalLine record representing one side of a double-entry transaction, linked to a specific account
- **Display Order**: A Float field on JournalEntry that determines the sequence in which transactions appear in the user interface
- **Transaction Date**: The date field on JournalEntry representing when the transaction occurred (YYYY-MM-DD format)
- **Account View**: The user interface displaying transactions filtered by a specific account
- **Corresponding Account**: Another account that shares journal lines from the same transaction
- **User Account**: An account of type 'user' representing real-world financial accounts
- **Category Account**: An account of type 'category' used for categorizing transactions
- **System Account**: An account of type 'system' used for internal accounting operations

## Requirements

### Requirement 1

**User Story:** As a user, I want to reorder transactions that occurred on the same date, so that I can organize my transaction history in a meaningful sequence.

#### Acceptance Criteria

1. WHEN a user views transactions for an account THEN the system SHALL display transactions ordered by transaction date ascending, then by display order ascending
2. WHEN a user attempts to reorder a transaction THEN the system SHALL only permit reordering among transactions with the same transaction date
3. WHEN a user moves a transaction to a new position THEN the system SHALL update the display order field to place the transaction at the requested position
4. WHEN multiple transactions share the same transaction date THEN the system SHALL maintain distinct display order values for each transaction
5. WHEN a transaction is moved between two existing transactions THEN the system SHALL assign a display order value between the adjacent transactions' display order values

### Requirement 2

**User Story:** As a user, I want transaction order to remain consistent across all account views, so that my accounting records maintain integrity and coherence.

#### Acceptance Criteria

1. WHEN a user reorders a transaction in one account view THEN the system SHALL maintain the same display order for that transaction in all other account views
2. WHEN the system updates a transaction's display order THEN the system SHALL update the display order field on the JournalEntry record, not on individual JournalLine records
3. WHEN displaying transactions in any account view THEN the system SHALL use the JournalEntry display order field to determine sequence
4. WHEN a transaction involves multiple accounts THEN the system SHALL show the transaction at the same relative position in each account's transaction list for that date

### Requirement 3

**User Story:** As a user, I want newly created transactions to appear in a sensible default order, so that I don't need to manually reorder every transaction.

#### Acceptance Criteria

1. WHEN a new transaction is created THEN the system SHALL assign a display order value equal to the creation timestamp
2. WHEN multiple transactions are created on the same date THEN the system SHALL order them by creation time by default
3. WHEN a transaction is created between existing transactions with the same date THEN the system SHALL place it after all existing transactions for that date by default

### Requirement 4

**User Story:** As a user, I want to move transactions up or down in the list, so that I can quickly adjust the order without complex interactions.

#### Acceptance Criteria

1. WHEN a user initiates a move-up action on a transaction THEN the system SHALL swap the display order with the previous transaction having the same transaction date
2. WHEN a user initiates a move-down action on a transaction THEN the system SHALL swap the display order with the next transaction having the same transaction date
3. WHEN a user attempts to move up the first transaction of a date THEN the system SHALL prevent the action and maintain the current order
4. WHEN a user attempts to move down the last transaction of a date THEN the system SHALL prevent the action and maintain the current order
5. WHEN a transaction is moved THEN the system SHALL update the display order values for both the moved transaction and the swapped transaction

### Requirement 5

**User Story:** As a developer, I want the display order system to handle edge cases gracefully, so that the system remains robust and reliable.

#### Acceptance Criteria

1. WHEN two transactions have identical display order values THEN the system SHALL use the transaction ID as a secondary sort criterion for consistent ordering
2. WHEN a transaction's display order is null THEN the system SHALL treat it as having a display order equal to the creation timestamp
3. WHEN the system calculates a new display order value THEN the system SHALL ensure the value is a valid Float number
4. WHEN display order values become too close together THEN the system SHALL support renumbering all transactions for a given date to create adequate spacing
5. IF display order calculation results in an invalid value THEN the system SHALL log an error and maintain the previous display order
