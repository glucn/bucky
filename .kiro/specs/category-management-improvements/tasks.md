# Implementation Plan

- [x] 1. Update database service for currency-agnostic categories
  - Add method to get category balances grouped by currency
  - Modify transaction creation to allow currency mismatch for category transactions
  - Update balance calculation methods to support multi-currency aggregation
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Create Categories page component
- [x] 2.1 Implement Categories page layout and structure
  - Create new Categories.tsx page component
  - Add route configuration for /categories path
  - Implement two-section layout for income and expense categories
  - Add table structure with columns for name, balances, and actions
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 2.2 Implement category data fetching and display
  - Fetch all category accounts on page load
  - Separate categories by subtype (income vs expense)
  - Display multi-currency balances for each category
  - Format currency display with proper labels
  - _Requirements: 2.4, 2.5, 5.1, 5.2_

- [x] 2.3 Add category management actions
  - Implement archive/delete functionality for categories
  - Add "View Transactions" link to AccountTransactionsPage
  - Handle loading and error states
  - _Requirements: 2.4_

- [x] 3. Create CategoryModal component
- [x] 3.1 Implement CategoryModal form and validation
  - Create CategoryModal.tsx component
  - Add form fields for name, type (income/expense), and default currency
  - Implement form validation (required fields, unique name)
  - Add submit handler to create category account
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3.2 Integrate CategoryModal with Categories page
  - Add "Add Category" button to Categories page
  - Wire up modal open/close handlers
  - Refresh category list after creation
  - _Requirements: 3.1, 3.5_

- [x] 4. Update Accounts page to filter out categories
  - Modify Accounts.tsx to filter out category accounts from display
  - Update account fetching logic to exclude type "category"
  - Ensure system accounts remain visible or can be toggled
  - _Requirements: 2.3_

- [x] 5. Update navigation components
- [x] 5.1 Add Categories link to Navbar
  - Add "Categories" navigation item to Navbar.tsx
  - Position link appropriately in navigation menu
  - _Requirements: 2.1_

- [x] 5.2 Add Categories link to Sidebar
  - Add "Categories" navigation item to Sidebar.tsx
  - Position link appropriately in sidebar menu
  - _Requirements: 2.1_

- [ ] 6. Modify ManualTransactionModal for currency-agnostic categories
  - Remove currency validation that blocks category transactions with different currencies
  - Keep multi-currency transfer UI for user-to-user transfers
  - Display currency information for both accounts
  - Update transaction creation to handle currency mismatch
  - _Requirements: 1.1, 1.2_

- [ ] 7. Update ImportTransactionsWizard for category auto-creation
- [ ] 7.1 Implement category auto-creation logic
  - Detect when import references non-existent category
  - Determine category subtype from transaction amount sign
  - Create new category with user account currency
  - Track auto-created categories during import
  - _Requirements: 4.2, 4.3, 4.4_

- [ ] 7.2 Add import summary for auto-created categories
  - Display list of auto-created categories after import
  - Show category names and their assigned subtypes
  - Provide clear messaging about auto-creation
  - _Requirements: 4.5_

- [ ] 8. Update IPC handlers in main process
  - Add IPC handler for getting category balances by currency
  - Update existing handlers to support category filtering
  - Ensure all category operations are properly exposed
  - _Requirements: 1.4, 2.2, 5.1_

- [ ] 9. Add multi-currency balance display utilities
  - Create helper function to format multi-currency balances
  - Implement currency grouping logic for display
  - Add proper currency symbol/code display
  - _Requirements: 5.1, 5.2, 5.3, 5.5_

- [ ] 10. Update AccountTransactionsPage for category context
  - Ensure transaction page works correctly when accessed from Categories page
  - Display category-specific information in transaction list
  - Show currency for each transaction line
  - _Requirements: 5.3_
