# Implementation Plan

- [x] 1. Implement database service methods for transaction reordering
  - [x] 1.1 Create moveTransactionUp method
    - Accept entryId parameter
    - Query the transaction and get its date and current displayOrder
    - Handle null displayOrder by treating it as createdAt timestamp
    - Find all transactions for the same date, ordered by displayOrder ascending
    - Find the previous transaction in the list
    - If no previous transaction exists, return error
    - Swap displayOrder values between the two transactions
    - Return success response
    - _Requirements: 1.2, 4.1, 4.3, 5.2_

  - [x] 1.2 Create moveTransactionDown method
    - Accept entryId parameter
    - Query the transaction and get its date and current displayOrder
    - Handle null displayOrder by treating it as createdAt timestamp
    - Find all transactions for the same date, ordered by displayOrder ascending
    - Find the next transaction in the list
    - If no next transaction exists, return error
    - Swap displayOrder values between the two transactions
    - Return success response
    - _Requirements: 1.2, 4.2, 4.4, 5.2_

  - [x] 1.3 Create helper method getTransactionsForDate
    - Accept date parameter
    - Query all JournalEntry records with matching date
    - Order by displayOrder ascending (treat null as createdAt timestamp)
    - Return ordered list of transactions
    - _Requirements: 1.1, 1.2_

  - [x] 1.4 Create helper method swapDisplayOrder
    - Accept two entryId parameters
    - Use transaction to ensure atomicity
    - Read both displayOrder values
    - Update both records with swapped values
    - Handle errors and rollback on failure
    - _Requirements: 4.1, 4.2, 4.5, 5.5_

  - [ ]* 1.5 Write property test for transaction list ordering
    - **Property 1: Transaction list ordering**
    - **Validates: Requirements 1.1**

  - [ ]* 1.6 Write property test for reorder constraint
    - **Property 2: Reorder constraint to same date**
    - **Validates: Requirements 1.2**

  - [ ]* 1.7 Write property test for distinct display orders
    - **Property 3: Distinct display orders for same date**
    - **Validates: Requirements 1.4**

  - [ ]* 1.8 Write unit tests for database methods
    - Test moveTransactionUp with valid middle transaction
    - Test moveTransactionUp with first transaction (should fail)
    - Test moveTransactionDown with valid middle transaction
    - Test moveTransactionDown with last transaction (should fail)
    - Test with null displayOrder values
    - Test with invalid entry IDs
    - Test error handling and rollback
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.2, 5.5_

- [-] 2. Add IPC handlers for transaction reordering
  - [ ] 2.1 Implement move-transaction-up IPC handler
    - Accept entryId parameter
    - Call databaseService.moveTransactionUp
    - Return result to renderer
    - Handle errors and return error response
    - _Requirements: 4.1_

  - [ ] 2.2 Implement move-transaction-down IPC handler
    - Accept entryId parameter
    - Call databaseService.moveTransactionDown
    - Return result to renderer
    - Handle errors and return error response
    - _Requirements: 4.2_

  - [ ] 2.3 Add IPC handler types to preload script
    - Add moveTransactionUp to electron API
    - Add moveTransactionDown to electron API
    - _Requirements: 4.1, 4.2_

- [ ] 3. Update transaction display to show reorder controls
  - [ ] 3.1 Add reorder buttons to transaction rows
    - Add up/down arrow icon buttons in Actions column
    - Style buttons to be minimal and unobtrusive
    - Show buttons only on row hover to keep UI clean
    - Disable up button for first transaction of each date
    - Disable down button for last transaction of each date
    - Disable both buttons when only one transaction exists for that date
    - _Requirements: 1.2, 4.3, 4.4_

  - [ ] 3.2 Implement reorder button click handlers
    - Call window.electron.moveTransactionUp on up button click
    - Call window.electron.moveTransactionDown on down button click
    - Show loading state during operation (disable buttons)
    - Refresh transaction list on success
    - Show error message on failure
    - _Requirements: 4.1, 4.2_

  - [ ] 3.3 Group transactions by date for button state logic
    - Create helper function to group transactions by date
    - Determine position of each transaction within its date group
    - Use position to enable/disable up/down buttons appropriately
    - _Requirements: 1.2, 4.3, 4.4_

  - [ ]* 3.4 Write property test for consistency across views
    - **Property 4: Consistency across account views**
    - **Validates: Requirements 2.1, 2.4**

- [ ] 4. Ensure default displayOrder for new transactions
  - [ ] 4.1 Update transaction creation to set displayOrder
    - Modify createJournalEntry method to set displayOrder = Date.now()
    - Ensure displayOrder is set for all transaction creation paths
    - _Requirements: 3.1_

  - [ ]* 4.2 Write property test for default display order
    - **Property 5: Default display order for new transactions**
    - **Validates: Requirements 3.1**

- [ ] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 6. Write remaining property tests
  - [ ]* 6.1 Write property test for move-up swap behavior
    - **Property 6: Move-up swap behavior**
    - **Validates: Requirements 4.1, 4.5**

  - [ ]* 6.2 Write property test for move-down swap behavior
    - **Property 7: Move-down swap behavior**
    - **Validates: Requirements 4.2, 4.5**

  - [ ]* 6.3 Write property test for valid display order values
    - **Property 8: Valid display order values**
    - **Validates: Requirements 5.3**

  - [ ]* 6.4 Write property test for error handling
    - **Property 9: Error handling maintains order**
    - **Validates: Requirements 4.3, 4.4, 5.5**

- [ ] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
