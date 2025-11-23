# Requirements Document

## Introduction

This document specifies the requirements for the Account Grouping feature in the personal bookkeeping application. The feature enables users to organize their accounts (both user accounts and category accounts) into logical groups for better organization and visualization. For example, users can group multiple bank accounts from the same institution, group credit cards together, or organize expense categories hierarchically (e.g., "Travel" group containing "Travel - Tickets", "Travel - Food", "Travel - Transport").

## Glossary

- **Account**: A financial account in the system, which can be a user account (asset/liability) or a category account (income/expense)
- **User Account**: An account representing real-world financial accounts (bank accounts, credit cards, etc.) with type "user"
- **Category Account**: An account used for categorizing transactions (income or expense categories) with type "category"
- **Account Group**: A named collection of accounts that share a common characteristic or purpose
- **System**: The personal bookkeeping application
- **Parent Group**: An account group that contains accounts or other groups
- **Ungrouped Account**: An account that does not belong to any account group

## Requirements

### Requirement 1

**User Story:** As a user, I want to create account groups, so that I can organize my accounts logically.

#### Acceptance Criteria

1. WHEN a user creates an account group, THE System SHALL accept a name for the group
2. WHEN a user creates an account group, THE System SHALL allow the user to specify whether the group is for user accounts or category accounts
3. WHEN a user creates an account group with a name that already exists for the same account type, THE System SHALL prevent creation and display an error message
4. WHEN a user creates an account group, THE System SHALL persist the group to the database
5. WHEN a user creates an account group, THE System SHALL display the new group in the appropriate account list

### Requirement 2

**User Story:** As a user, I want to add accounts to groups, so that I can organize related accounts together.

#### Acceptance Criteria

1. WHEN a user adds an account to a group, THE System SHALL verify that the account type matches the group type
2. WHEN a user adds an account to a group, THE System SHALL update the account's group assignment in the database
3. WHEN a user adds an account that already belongs to another group to a new group, THE System SHALL remove the account from the previous group and add it to the new group
4. WHEN a user adds an account to a group, THE System SHALL display the account under the group in the UI
5. WHEN a user views an account list, THE System SHALL display grouped accounts under their respective groups and ungrouped accounts separately

### Requirement 3

**User Story:** As a user, I want to remove accounts from groups, so that I can reorganize my account structure.

#### Acceptance Criteria

1. WHEN a user removes an account from a group, THE System SHALL update the account's group assignment to null in the database
2. WHEN a user removes an account from a group, THE System SHALL display the account in the ungrouped accounts section
3. WHEN a user removes an account from a group, THE System SHALL preserve all transaction history for the account

### Requirement 4

**User Story:** As a user, I want to rename account groups, so that I can update group names as my organizational needs change.

#### Acceptance Criteria

1. WHEN a user renames an account group, THE System SHALL accept the new name
2. WHEN a user renames an account group to a name that already exists for the same account type, THE System SHALL prevent the rename and display an error message
3. WHEN a user renames an account group, THE System SHALL update the group name in the database
4. WHEN a user renames an account group, THE System SHALL display the updated name in all UI locations where the group appears

### Requirement 5

**User Story:** As a user, I want to delete account groups, so that I can remove groups I no longer need.

#### Acceptance Criteria

1. WHEN a user deletes an account group, THE System SHALL verify whether the group contains accounts
2. WHEN a user deletes an empty account group, THE System SHALL remove the group from the database
3. WHEN a user deletes an account group that contains accounts, THE System SHALL move all accounts in the group to the ungrouped section
4. WHEN a user deletes an account group, THE System SHALL remove the group from the UI
5. WHEN a user deletes an account group, THE System SHALL preserve all accounts and their transaction history

### Requirement 6

**User Story:** As a user, I want to view grouped accounts in the sidebar and account pages, so that I can easily navigate my organized account structure.

#### Acceptance Criteria

1. WHEN a user views the sidebar, THE System SHALL display user account groups with their contained accounts in a collapsible format
2. WHEN a user views the Accounts page, THE System SHALL display account groups with their contained accounts
3. WHEN a user views the Categories page, THE System SHALL display category groups with their contained category accounts
4. WHEN a user views grouped accounts, THE System SHALL display group names distinctly from account names
5. WHEN a user views an account list, THE System SHALL display ungrouped accounts in a separate section after grouped accounts

### Requirement 7

**User Story:** As a user, I want to see aggregate balances for account groups, so that I can understand the total value across related accounts.

#### Acceptance Criteria

1. WHEN a user views a user account group, THE System SHALL calculate and display the sum of all account balances within the group
2. WHEN a user views a user account group containing accounts with different currencies, THE System SHALL display separate balance totals for each currency
3. WHEN a user views a category account group, THE System SHALL calculate and display the sum of all category balances within the group
4. WHEN a user views a category account group containing categories with different currencies, THE System SHALL display separate balance totals for each currency
5. WHEN an account balance changes, THE System SHALL update the group's aggregate balance in the UI

### Requirement 8

**User Story:** As a user, I want to collapse and expand account groups in the UI, so that I can focus on the accounts I'm currently working with.

#### Acceptance Criteria

1. WHEN a user clicks on a collapsed account group, THE System SHALL expand the group to show all contained accounts
2. WHEN a user clicks on an expanded account group, THE System SHALL collapse the group to hide contained accounts
3. WHEN a user collapses an account group, THE System SHALL persist the collapsed state for the user's session
4. WHEN a user expands an account group, THE System SHALL persist the expanded state for the user's session
5. WHEN a user returns to the application, THE System SHALL restore the previous collapsed or expanded state for each group

### Requirement 9

**User Story:** As a user, I want to reorder account groups, so that I can prioritize the groups most important to me.

#### Acceptance Criteria

1. WHEN a user reorders account groups, THE System SHALL accept the new order
2. WHEN a user reorders account groups, THE System SHALL persist the order to the database
3. WHEN a user reorders account groups, THE System SHALL display the groups in the new order across all UI locations
4. WHEN a user views account groups, THE System SHALL display them in the user-defined order
5. WHEN a new account group is created, THE System SHALL place it at the end of the current group order
