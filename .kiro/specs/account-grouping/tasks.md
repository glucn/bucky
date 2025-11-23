# Implementation Plan

- [x] 1. Create database schema and migration
  - [x] 1.1 Add AccountGroup model to Prisma schema
    - Add AccountGroup model with id, name, accountType, displayOrder, timestamps
    - Add unique constraint on (name, accountType)
    - Add index on (accountType, displayOrder)
    - _Requirements: 1.1, 1.2, 1.3, 9.4_
  
  - [x] 1.2 Add groupId field to Account model
    - Add nullable groupId field to Account model
    - Add relation to AccountGroup with onDelete: SetNull
    - Add index on groupId
    - _Requirements: 2.2, 3.1_
  
  - [x] 1.3 Generate and run Prisma migration
    - Run `npx prisma migrate dev --name add_account_groups`
    - Verify migration creates tables and indexes correctly
    - _Requirements: 1.4, 2.2_

- [x] 2. Implement DatabaseService methods for account groups
  - [x] 2.1 Implement createAccountGroup method
    - Accept name and accountType parameters
    - Set displayOrder to max(existing displayOrder) + 1
    - Handle unique constraint violations
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 9.5_
  
  - [x] 2.2 Write property test for group creation
    - **Property 1: Group creation persistence**
    - **Validates: Requirements 1.1, 1.2, 1.4**
  
  - [x] 2.3 Write property test for duplicate prevention
    - **Property 2: Duplicate group name prevention**
    - **Validates: Requirements 1.3**
  
  - [x] 2.4 Write property test for new group ordering
    - **Property 17: New group default ordering**
    - **Validates: Requirements 9.5**
  
  - [x] 2.5 Implement getAccountGroups method
    - Accept optional accountType filter
    - Order by displayOrder ascending
    - Include accounts relation
    - _Requirements: 1.5, 6.1, 6.2, 6.3_
  
  - [x] 2.6 Implement getAccountGroupById method
    - Query by id with accounts included
    - Return null if not found
    - _Requirements: 4.1, 5.1_
  
  - [x] 2.7 Implement updateAccountGroup method
    - Accept id and update data (name, displayOrder)
    - Handle unique constraint violations on rename
    - _Requirements: 4.1, 4.2, 4.3, 9.1, 9.2_
  
  - [x] 2.8 Write property test for group rename
    - **Property 8: Group rename persistence**
    - **Validates: Requirements 4.1, 4.3**
  
  - [x] 2.9 Write property test for duplicate prevention on rename
    - **Property 9: Duplicate group name prevention on rename**
    - **Validates: Requirements 4.2**
  
  - [x] 2.10 Implement deleteAccountGroup method
    - Set groupId to null for all accounts in the group (handled by cascade)
    - Delete the group
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 2.11 Write property test for empty group deletion
    - **Property 10: Empty group deletion**
    - **Validates: Requirements 5.2**
  
  - [x] 2.12 Write property test for group deletion orphaning
    - **Property 11: Group deletion orphans accounts**
    - **Validates: Requirements 5.3**
  
  - [x] 2.13 Write property test for account preservation
    - **Property 12: Account preservation on group deletion**
    - **Validates: Requirements 5.5**

- [x] 3. Implement account-group relationship methods
  - [x] 3.1 Implement addAccountToGroup method
    - Verify account type matches group type
    - Update account's groupId
    - Return updated account
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 3.2 Write property test for type matching validation
    - **Property 3: Account type matching validation**
    - **Validates: Requirements 2.1**
  
  - [x] 3.3 Write property test for account assignment
    - **Property 4: Account group assignment persistence**
    - **Validates: Requirements 2.2**
  
  - [x] 3.4 Write property test for account reassignment
    - **Property 5: Account group reassignment**
    - **Validates: Requirements 2.3**
  
  - [x] 3.5 Implement removeAccountFromGroup method
    - Set account's groupId to null
    - Return updated account
    - _Requirements: 3.1, 3.2_
  
  - [x] 3.6 Write property test for account removal
    - **Property 6: Account removal from group**
    - **Validates: Requirements 3.1**
  
  - [x] 3.7 Write property test for transaction preservation
    - **Property 7: Transaction preservation on group operations**
    - **Validates: Requirements 3.3, 5.5**

- [x] 4. Implement query and aggregation methods
  - [x] 4.1 Implement getAccountsWithGroups method
    - Fetch all groups with their accounts
    - Fetch all ungrouped accounts
    - Return GroupedAccountsView structure
    - Filter by accountType if specified
    - _Requirements: 2.5, 6.5_
  
  - [x] 4.2 Implement getGroupAggregateBalance method
    - Fetch all accounts in the group with balances
    - For single currency: sum all balances
    - For multi-currency: return Record<currency, sum>
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [x] 4.3 Write property test for aggregate balance
    - **Property 13: Aggregate balance calculation**
    - **Validates: Requirements 7.1, 7.3**
  
  - [x] 4.4 Write property test for multi-currency aggregation
    - **Property 14: Multi-currency aggregate balance calculation**
    - **Validates: Requirements 7.2, 7.4**
  
  - [x] 4.5 Implement reorderAccountGroups method
    - Accept array of {id, displayOrder}
    - Update all groups in a transaction
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [x] 4.6 Write property test for group ordering
    - **Property 16: Group order persistence**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [x] 5. Set up IPC handlers for account groups
  - [x] 5.1 Add IPC handler for create-account-group
    - Call databaseService.createAccountGroup
    - Return success/error response
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [x] 5.2 Add IPC handler for get-account-groups
    - Call databaseService.getAccountGroups
    - Return groups array
    - _Requirements: 1.5, 6.1, 6.2, 6.3_
  
  - [x] 5.3 Add IPC handler for update-account-group
    - Call databaseService.updateAccountGroup
    - Return success/error response
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [x] 5.4 Add IPC handler for delete-account-group
    - Call databaseService.deleteAccountGroup
    - Return success/error response
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 5.5 Add IPC handler for add-account-to-group
    - Call databaseService.addAccountToGroup
    - Return success/error response
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 5.6 Add IPC handler for remove-account-from-group
    - Call databaseService.removeAccountFromGroup
    - Return success/error response
    - _Requirements: 3.1, 3.2_
  
  - [x] 5.7 Add IPC handler for get-accounts-with-groups
    - Call databaseService.getAccountsWithGroups
    - Return GroupedAccountsView
    - _Requirements: 2.5, 6.5_
  
  - [x] 5.8 Add IPC handler for reorder-account-groups
    - Call databaseService.reorderAccountGroups
    - Return success/error response
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [x] 5.9 Write unit tests for IPC handlers
    - Test each handler delegates correctly to DatabaseService
    - Test error response formatting

- [x] 6. Create TypeScript types and interfaces
  - [x] 6.1 Add AccountGroup interface to types
    - Define AccountGroup interface with all fields
    - Add aggregateBalance and aggregateBalances optional fields
    - _Requirements: 1.1, 1.2, 7.1, 7.2_
  
  - [x] 6.2 Update Account interface
    - Add groupId and group optional fields
    - _Requirements: 2.2, 3.1_
  
  - [x] 6.3 Add GroupedAccountsView interface
    - Define structure with groups and ungroupedAccounts arrays
    - _Requirements: 2.5, 6.5_
  
  - [x] 6.4 Update electron.d.ts with new IPC methods
    - Add type definitions for all new IPC handlers
    - _Requirements: All_

- [x] 7. Implement AccountGroupModal component
  - [x] 7.1 Create AccountGroupModal component structure
    - Accept isOpen, onClose, onGroupCreated, accountType, editingGroup props
    - Render modal with form for name input
    - _Requirements: 1.1, 4.1_
  
  - [x] 7.2 Implement form validation
    - Validate name is not empty
    - Show error messages for validation failures
    - _Requirements: 1.1, 1.3, 4.2_
  
  - [x] 7.3 Implement create group functionality
    - Call create-account-group IPC handler
    - Handle success and error responses
    - Close modal and trigger onGroupCreated callback
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 7.4 Implement edit group functionality
    - Pre-populate form when editingGroup is provided
    - Call update-account-group IPC handler
    - Handle success and error responses
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [x] 7.5 Write unit tests for AccountGroupModal
    - Test form validation
    - Test create and edit flows
    - Test error handling

- [x] 8. Implement AccountGroupItem component
  - [x] 8.1 Create AccountGroupItem component structure
    - Accept group, isExpanded, onToggle, onEdit, onDelete props
    - Render group name with expand/collapse icon
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 8.1, 8.2_
  
  - [x] 8.2 Implement expand/collapse functionality
    - Toggle isExpanded state on click
    - Show/hide accounts based on isExpanded
    - _Requirements: 8.1, 8.2_
  
  - [x] 8.3 Implement aggregate balance display
    - Fetch and display group aggregate balance
    - Handle multi-currency display
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [x] 8.4 Implement edit and delete actions
    - Add edit button that calls onEdit
    - Add delete button that calls onDelete with confirmation
    - _Requirements: 4.1, 5.1, 5.4_
  
  - [x] 8.5 Write unit tests for AccountGroupItem
    - Test expand/collapse behavior
    - Test balance display
    - Test edit and delete actions

- [x] 9. Implement GroupedAccountsList component
  - [x] 9.1 Create GroupedAccountsList component structure
    - Accept groups, ungroupedAccounts, accountType props
    - Render list of AccountGroupItem components
    - Render ungrouped accounts section
    - _Requirements: 2.5, 6.1, 6.2, 6.3, 6.5_
  
  - [x] 9.2 Implement group collapse state management
    - Store collapse states in component state or localStorage
    - Pass isExpanded and onToggle to AccountGroupItem
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  
  - [x] 9.3 Write property test for collapse state persistence
    - **Property 15: Group collapse state persistence**
    - **Validates: Requirements 8.3, 8.4, 8.5**
  
  - [x] 9.4 Implement account move functionality
    - Add UI for moving accounts between groups
    - Call add-account-to-group or remove-account-from-group IPC handlers
    - _Requirements: 2.3, 2.4, 3.1, 3.2_
  
  - [x] 9.5 Write unit tests for GroupedAccountsList
    - Test rendering of groups and ungrouped accounts
    - Test collapse state management
    - Test account move functionality

- [x] 10. Update Accounts page to use grouped display
  - [x] 10.1 Replace flat account list with GroupedAccountsList
    - Call get-accounts-with-groups IPC handler
    - Pass groups and ungroupedAccounts to GroupedAccountsList
    - Filter to user accounts only
    - _Requirements: 6.2, 6.5_
  
  - [x] 10.2 Add "Create Group" button
    - Open AccountGroupModal with accountType="user"
    - Refresh account list after group creation
    - _Requirements: 1.1, 1.5_
  
  - [x] 10.3 Implement group edit and delete
    - Pass onEdit and onDelete handlers to GroupedAccountsList
    - Open AccountGroupModal for editing
    - Call delete-account-group IPC handler for deletion
    - _Requirements: 4.1, 4.4, 5.1, 5.4_
  
  - [x] 10.4 Write integration tests for Accounts page
    - Test creating a group
    - Test adding accounts to groups
    - Test editing and deleting groups

- [x] 11. Update Categories page to use grouped display
  - [x] 11.1 Replace flat category list with GroupedAccountsList
    - Call get-accounts-with-groups IPC handler with accountType="category"
    - Pass groups and ungroupedAccounts to GroupedAccountsList
    - _Requirements: 6.3, 6.5_
  
  - [x] 11.2 Add "Create Group" button
    - Open AccountGroupModal with accountType="category"
    - Refresh category list after group creation
    - _Requirements: 1.1, 1.5_
  
  - [x] 11.3 Implement group edit and delete
    - Pass onEdit and onDelete handlers to GroupedAccountsList
    - Open AccountGroupModal for editing
    - Call delete-account-group IPC handler for deletion
    - _Requirements: 4.1, 4.4, 5.1, 5.4_
  
  - [x] 11.4 Write integration tests for Categories page
    - Test creating a category group
    - Test adding categories to groups
    - Test editing and deleting groups

- [x] 12. Update Sidebar to display grouped accounts
  - [x] 12.1 Fetch grouped accounts data
    - Call get-accounts-with-groups IPC handler with accountType="user"
    - Store in component state
    - _Requirements: 6.1_
  
  - [x] 12.2 Render groups with collapsible sections
    - Use GroupedAccountsList or custom rendering
    - Show group names distinctly from account names
    - _Requirements: 6.1, 6.4, 8.1, 8.2_
  
  - [x] 12.3 Persist collapse state in localStorage
    - Store collapse states keyed by group id
    - Restore states on component mount
    - _Requirements: 8.3, 8.4, 8.5_
  
  - [x] 12.4 Write unit tests for Sidebar grouping
    - Test grouped account rendering
    - Test collapse state persistence

- [x] 13. Implement group reordering functionality
  - [x] 13.1 Add reorder UI to Accounts and Categories pages
    - Add up/down buttons or drag handles to groups
    - Calculate new displayOrder values
    - _Requirements: 9.1_
  
  - [x] 13.2 Call reorder-account-groups IPC handler
    - Send array of {id, displayOrder} to backend
    - Refresh group list after reordering
    - _Requirements: 9.2, 9.3_
  
  - [x] 13.3 Write integration tests for reordering
    - Test reordering groups
    - Test persistence across page reloads

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
