# Design Document: Account Grouping

## Overview

The Account Grouping feature enables users to organize their accounts into logical groups for better visualization and management. This feature extends the existing account management system by introducing a new `AccountGroup` entity that can contain multiple accounts of the same type (user or category). Groups provide aggregate balance calculations, collapsible UI elements, and customizable ordering.

The design follows the existing architecture pattern of the application:
- Database layer using Prisma ORM with SQLite
- IPC communication between Electron main process and renderer process
- React components with context-based state management
- Service layer for business logic

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Renderer Process (React)                 │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Accounts Page  │  │ Categories   │  │ Sidebar         │ │
│  │                │  │ Page         │  │ Component       │ │
│  └────────┬───────┘  └──────┬───────┘  └────────┬────────┘ │
│           │                  │                    │          │
│           └──────────────────┼────────────────────┘          │
│                              │                               │
│                    ┌─────────▼──────────┐                    │
│                    │ AccountsContext    │                    │
│                    │ (State Management) │                    │
│                    └─────────┬──────────┘                    │
└──────────────────────────────┼───────────────────────────────┘
                               │ IPC
┌──────────────────────────────▼───────────────────────────────┐
│                      Main Process (Electron)                  │
│                    ┌─────────────────────┐                    │
│                    │  IPC Handlers       │                    │
│                    └─────────┬───────────┘                    │
│                              │                                │
│                    ┌─────────▼───────────┐                    │
│                    │ DatabaseService     │                    │
│                    └─────────┬───────────┘                    │
└──────────────────────────────┼───────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Prisma ORM         │
                    │  (SQLite Database)  │
                    └─────────────────────┘
```

### Data Flow

1. User interacts with UI components (Accounts page, Categories page, Sidebar)
2. Components call methods from AccountsContext
3. Context invokes IPC handlers in the main process
4. IPC handlers delegate to DatabaseService
5. DatabaseService performs database operations via Prisma
6. Results flow back through the same chain
7. UI updates via React state management

## Components and Interfaces

### Database Schema

#### AccountGroup Model

```prisma
model AccountGroup {
  id          String    @id @default(uuid())
  name        String
  accountType AccountType  // 'user' or 'category'
  displayOrder Int      @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  accounts    Account[]
  
  @@unique([name, accountType])
  @@index([accountType, displayOrder])
}
```

#### Updated Account Model

```prisma
model Account {
  id        String      @id @default(uuid())
  name      String
  type      AccountType
  subtype   AccountSubtype @default(asset)
  currency  String      @default("USD")
  isArchived Boolean   @default(false)
  archivedAt DateTime?
  groupId   String?     // NEW: Foreign key to AccountGroup
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  lines     JournalLine[]
  checkpoints Checkpoint[]
  creditCardProperties CreditCardProperties[]
  group     AccountGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)
  
  @@index([groupId])
}
```

### TypeScript Interfaces

```typescript
// Shared types
export interface AccountGroup {
  id: string;
  name: string;
  accountType: AccountType;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  accounts?: Account[];
  aggregateBalance?: number;
  aggregateBalances?: Record<string, number>; // For multi-currency
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  currency: string;
  isArchived: boolean;
  archivedAt: string | null;
  groupId: string | null;
  createdAt: string;
  updatedAt: string;
  balance?: number;
  balances?: Record<string, number>;
  group?: AccountGroup;
}

export interface GroupedAccountsView {
  groups: AccountGroup[];
  ungroupedAccounts: Account[];
}
```

### DatabaseService Methods

```typescript
class DatabaseService {
  // Account Group CRUD operations
  public async createAccountGroup(data: {
    name: string;
    accountType: AccountType;
  }): Promise<AccountGroup>;
  
  public async getAccountGroups(
    accountType?: AccountType,
    tx?: TransactionClient
  ): Promise<AccountGroup[]>;
  
  public async getAccountGroupById(
    id: string,
    tx?: TransactionClient
  ): Promise<AccountGroup | null>;
  
  public async updateAccountGroup(
    id: string,
    data: { name?: string; displayOrder?: number },
    tx?: TransactionClient
  ): Promise<AccountGroup>;
  
  public async deleteAccountGroup(
    id: string,
    tx?: TransactionClient
  ): Promise<AccountGroup>;
  
  // Account-Group relationship operations
  public async addAccountToGroup(
    accountId: string,
    groupId: string,
    tx?: TransactionClient
  ): Promise<Account>;
  
  public async removeAccountFromGroup(
    accountId: string,
    tx?: TransactionClient
  ): Promise<Account>;
  
  // Query operations
  public async getAccountsWithGroups(
    includeArchived: boolean = false,
    accountType?: AccountType,
    tx?: TransactionClient
  ): Promise<GroupedAccountsView>;
  
  public async getGroupAggregateBalance(
    groupId: string,
    tx?: TransactionClient
  ): Promise<number | Record<string, number>>;
  
  public async reorderAccountGroups(
    groupOrders: Array<{ id: string; displayOrder: number }>,
    tx?: TransactionClient
  ): Promise<void>;
}
```

### IPC Handlers

```typescript
// In main/index.ts
ipcMain.handle("create-account-group", async (_, data) => {
  return databaseService.createAccountGroup(data);
});

ipcMain.handle("get-account-groups", async (_, accountType?: string) => {
  return databaseService.getAccountGroups(accountType);
});

ipcMain.handle("update-account-group", async (_, { id, data }) => {
  return databaseService.updateAccountGroup(id, data);
});

ipcMain.handle("delete-account-group", async (_, id: string) => {
  return databaseService.deleteAccountGroup(id);
});

ipcMain.handle("add-account-to-group", async (_, { accountId, groupId }) => {
  return databaseService.addAccountToGroup(accountId, groupId);
});

ipcMain.handle("remove-account-from-group", async (_, accountId: string) => {
  return databaseService.removeAccountFromGroup(accountId);
});

ipcMain.handle("get-accounts-with-groups", async (_, { includeArchived, accountType }) => {
  return databaseService.getAccountsWithGroups(includeArchived, accountType);
});

ipcMain.handle("reorder-account-groups", async (_, groupOrders) => {
  return databaseService.reorderAccountGroups(groupOrders);
});
```

### React Components

#### AccountGroupModal Component

```typescript
interface AccountGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: () => void;
  accountType: AccountType;
  editingGroup?: AccountGroup | null;
}

export const AccountGroupModal: React.FC<AccountGroupModalProps>;
```

#### GroupedAccountsList Component

```typescript
interface GroupedAccountsListProps {
  groups: AccountGroup[];
  ungroupedAccounts: Account[];
  accountType: AccountType;
  onAccountClick?: (account: Account) => void;
  onGroupEdit?: (group: AccountGroup) => void;
  onGroupDelete?: (group: AccountGroup) => void;
  onAccountMove?: (accountId: string, groupId: string | null) => void;
}

export const GroupedAccountsList: React.FC<GroupedAccountsListProps>;
```

#### AccountGroupItem Component

```typescript
interface AccountGroupItemProps {
  group: AccountGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAccountMove: (accountId: string, groupId: string | null) => void;
}

export const AccountGroupItem: React.FC<AccountGroupItemProps>;
```

## Data Models

### AccountGroup Entity

- **id**: UUID primary key
- **name**: String, unique per account type
- **accountType**: Enum (user, category) - determines which type of accounts can be in this group
- **displayOrder**: Integer for custom ordering
- **createdAt**: Timestamp
- **updatedAt**: Timestamp
- **accounts**: One-to-many relationship with Account

### Account Entity Updates

- **groupId**: Nullable foreign key to AccountGroup
- **group**: Many-to-one relationship with AccountGroup

### Relationships

- One AccountGroup can have many Accounts
- One Account can belong to zero or one AccountGroup
- When an AccountGroup is deleted, associated Accounts have their groupId set to null (cascade: SetNull)
- AccountGroups are scoped by accountType to prevent mixing user and category accounts


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Group creation persistence
*For any* valid group name and account type, creating a group then querying the database should return a group with the same name and account type.
**Validates: Requirements 1.1, 1.2, 1.4**

### Property 2: Duplicate group name prevention
*For any* existing group with a given name and account type, attempting to create another group with the same name and account type should fail with an error.
**Validates: Requirements 1.3**

### Property 3: Account type matching validation
*For any* account and group, attempting to add an account to a group with a mismatched account type should fail with an error.
**Validates: Requirements 2.1**

### Property 4: Account group assignment persistence
*For any* account and group with matching types, adding the account to the group then querying the account should show the account's groupId equals the group's id.
**Validates: Requirements 2.2**

### Property 5: Account group reassignment
*For any* account currently in group A, adding it to group B should result in the account having groupId equal to B's id and group A no longer containing the account.
**Validates: Requirements 2.3**

### Property 6: Account removal from group
*For any* account in a group, removing it from the group then querying the account should show the account's groupId is null.
**Validates: Requirements 3.1**

### Property 7: Transaction preservation on group operations
*For any* account with transactions, the count of transactions before and after any group operation (add, remove, delete group) should remain the same.
**Validates: Requirements 3.3, 5.5**

### Property 8: Group rename persistence
*For any* group and new name (that doesn't conflict with existing groups), renaming the group then querying should return the group with the new name.
**Validates: Requirements 4.1, 4.3**

### Property 9: Duplicate group name prevention on rename
*For any* group A and existing group B with the same account type, attempting to rename group A to group B's name should fail with an error.
**Validates: Requirements 4.2**

### Property 10: Empty group deletion
*For any* group with no accounts, deleting the group then querying for it should return null.
**Validates: Requirements 5.2**

### Property 11: Group deletion orphans accounts
*For any* group containing accounts, deleting the group should result in all those accounts having groupId set to null.
**Validates: Requirements 5.3**

### Property 12: Account preservation on group deletion
*For any* group, the count of accounts before and after deleting the group should remain the same (accounts are not deleted, only orphaned).
**Validates: Requirements 5.5**

### Property 13: Aggregate balance calculation
*For any* group containing accounts, the calculated aggregate balance should equal the sum of all account balances within the group.
**Validates: Requirements 7.1, 7.3**

### Property 14: Multi-currency aggregate balance calculation
*For any* group containing accounts with multiple currencies, the calculated aggregate balances should contain a separate total for each currency, where each currency total equals the sum of account balances in that currency.
**Validates: Requirements 7.2, 7.4**

### Property 15: Group collapse state persistence
*For any* group and collapse state (collapsed or expanded), setting the state then querying the stored state should return the same collapse state.
**Validates: Requirements 8.3, 8.4, 8.5**

### Property 16: Group order persistence
*For any* set of groups and new ordering (array of displayOrder values), setting the order then querying the groups should return them in the specified order.
**Validates: Requirements 9.1, 9.2, 9.3, 9.4**

### Property 17: New group default ordering
*For any* existing set of groups, creating a new group should result in the new group having a displayOrder value greater than all existing groups of the same account type.
**Validates: Requirements 9.5**

## Error Handling

### Validation Errors

1. **Duplicate Group Name**: When attempting to create or rename a group with a name that already exists for the same account type, return a validation error with message "A group with this name already exists for this account type"

2. **Account Type Mismatch**: When attempting to add an account to a group with mismatched types, return a validation error with message "Account type does not match group type"

3. **Group Not Found**: When attempting to operate on a non-existent group, return a not found error with message "Account group not found"

4. **Account Not Found**: When attempting to add a non-existent account to a group, return a not found error with message "Account not found"

### Database Errors

1. **Transaction Failures**: Wrap all multi-step operations in database transactions to ensure atomicity
2. **Constraint Violations**: Handle unique constraint violations gracefully and return user-friendly error messages
3. **Foreign Key Violations**: Should not occur due to SetNull cascade, but log if they do

### UI Error Handling

1. **Display Error Messages**: Show validation errors in modal dialogs or toast notifications
2. **Graceful Degradation**: If group data fails to load, display ungrouped accounts only
3. **Retry Logic**: Implement retry for transient network/IPC errors

## Testing Strategy

### Unit Testing

The testing approach will use Vitest as the testing framework (already configured in the project).

**Unit tests will cover:**

1. **DatabaseService methods**:
   - Test each CRUD operation for AccountGroup
   - Test account-group relationship operations
   - Test aggregate balance calculations
   - Test error conditions (duplicate names, type mismatches)

2. **IPC handlers**:
   - Test that handlers correctly delegate to DatabaseService
   - Test error response formatting

3. **React components**:
   - Test AccountGroupModal form validation
   - Test GroupedAccountsList rendering logic
   - Test AccountGroupItem expand/collapse behavior

4. **Utility functions**:
   - Test group ordering logic
   - Test balance aggregation helpers

### Property-Based Testing

Property-based testing will be implemented using **fast-check** library for JavaScript/TypeScript. Each property-based test should run a minimum of 100 iterations.

**Property-based tests will cover:**

1. **Group CRUD operations** (Properties 1, 2, 8, 9, 10):
   - Generate random group names and account types
   - Verify creation, update, and deletion properties hold

2. **Account-group relationships** (Properties 3, 4, 5, 6):
   - Generate random accounts and groups
   - Verify assignment and reassignment properties hold

3. **Data preservation** (Properties 7, 11, 12):
   - Generate random accounts with transactions
   - Verify transactions and accounts are preserved during group operations

4. **Aggregate calculations** (Properties 13, 14):
   - Generate random groups with accounts of varying balances and currencies
   - Verify aggregate calculations are correct

5. **Ordering and state** (Properties 15, 16, 17):
   - Generate random group orderings and collapse states
   - Verify persistence and retrieval properties hold

Each property-based test must be tagged with a comment explicitly referencing the correctness property from this design document using the format: `**Feature: account-grouping, Property {number}: {property_text}**`

### Integration Testing

Integration tests will verify end-to-end workflows:

1. Create group → Add accounts → Verify UI display
2. Move account between groups → Verify database and UI update
3. Delete group with accounts → Verify accounts become ungrouped
4. Reorder groups → Verify order persists across page reloads

## Implementation Notes

### Migration Strategy

1. Create migration to add AccountGroup table
2. Create migration to add groupId column to Account table
3. Existing accounts will have null groupId (ungrouped by default)
4. No data migration needed - users will organize accounts into groups after feature deployment

### Performance Considerations

1. **Indexing**: Add database indexes on `groupId` in Account table and `(accountType, displayOrder)` in AccountGroup table
2. **Eager Loading**: Use Prisma's `include` to fetch groups with their accounts in a single query
3. **Caching**: Consider caching group collapse states in localStorage to avoid database queries
4. **Batch Operations**: When reordering multiple groups, use a single transaction

### UI/UX Considerations

1. **Drag and Drop**: Consider implementing drag-and-drop for reordering groups and moving accounts between groups (future enhancement)
2. **Visual Hierarchy**: Use indentation and icons to clearly distinguish groups from accounts
3. **Empty States**: Show helpful messages when no groups exist or when groups are empty
4. **Confirmation Dialogs**: Require confirmation before deleting groups that contain accounts
5. **Keyboard Navigation**: Ensure groups can be expanded/collapsed via keyboard

### Backwards Compatibility

1. Existing accounts without groupId will be displayed in the "Ungrouped" section
2. All existing account operations continue to work unchanged
3. The feature is purely additive - no breaking changes to existing functionality
