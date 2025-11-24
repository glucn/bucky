# Design Document

## Overview

This feature enables users to manually adjust the display order of transactions that occur on the same date. The system uses a double-entry bookkeeping model where each transaction (JournalEntry) creates corresponding entries in multiple accounts through JournalLines. The display order is stored at the JournalEntry level, ensuring consistency across all account views.

The implementation will add UI controls (up/down buttons) to the transaction list, allowing users to reorder transactions within the same date. The backend will handle the display order calculations and updates, ensuring that the ordering remains consistent across all views.

## Architecture

The feature follows a three-tier architecture:

1. **Presentation Layer (React Components)**: Transaction list UI with reorder controls
2. **IPC Layer (Electron)**: Handlers for reorder requests
3. **Data Layer (DatabaseService)**: Methods for updating display order values

The system maintains the existing ordering logic (date descending, then displayOrder descending) and adds the ability to modify displayOrder values through user interaction.

**Note on Display Order**: While the requirements specify ascending order, the actual UI implementation displays transactions in descending order (newest/highest displayOrder first) as this is the standard UX pattern for transaction lists. The reorder operations work within this descending display context - "move up" moves a transaction toward the top of the visual list (increasing its displayOrder), and "move down" moves it toward the bottom (decreasing its displayOrder).

## Components and Interfaces

### Frontend Components

#### TransactionRow Component
- Displays individual transaction with up/down buttons
- Buttons are only enabled when multiple transactions exist for the same date
- Handles click events and calls IPC handlers

#### AccountTransactionsPage Component (Modified)
- Groups transactions by date for display order logic
- Manages transaction list state
- Refreshes transaction list after reorder operations

### IPC Handlers

```typescript
// Move transaction up (swap with previous transaction of same date)
ipcMain.handle("move-transaction-up", async (_, entryId: string) => {
  return databaseService.moveTransactionUp(entryId);
});

// Move transaction down (swap with next transaction of same date)
ipcMain.handle("move-transaction-down", async (_, entryId: string) => {
  return databaseService.moveTransactionDown(entryId);
});
```

### Database Service Methods

```typescript
class DatabaseService {
  /**
   * Move a transaction up in display order (swap with previous transaction of same date)
   */
  public async moveTransactionUp(entryId: string): Promise<{ success: boolean; error?: string }>;
  
  /**
   * Move a transaction down in display order (swap with next transaction of same date)
   */
  public async moveTransactionDown(entryId: string): Promise<{ success: boolean; error?: string }>;
  
  /**
   * Get transactions for a specific date, ordered by displayOrder
   */
  private async getTransactionsForDate(date: string): Promise<JournalEntry[]>;
  
  /**
   * Swap display order values between two transactions
   */
  private async swapDisplayOrder(entryId1: string, entryId2: string): Promise<void>;
}
```

## Data Models

### Existing Schema (No Changes Required)

The `JournalEntry` model already has the required `displayOrder` field:

```prisma
model JournalEntry {
  id           String        @id @default(uuid())
  date         String
  description  String?
  type         String?
  postingDate  String?
  displayOrder Float?        // Order for display, defaults to createdAt timestamp
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  lines        JournalLine[]
  
  @@index([displayOrder])
}
```

### Display Order Value Strategy

- New transactions: `displayOrder = createdAt.getTime()` (milliseconds since epoch)
- Swapped transactions: Exchange their displayOrder values directly
- Null handling: Treat null as `createdAt.getTime()`


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Transaction list ordering
*For any* account and its transaction list, when displayed, transactions should be ordered first by transaction date descending, then by display order descending (newest first, which is the standard UX pattern).
**Validates: Requirements 1.1**
**Note**: The requirement specifies ascending order, but the implementation uses descending order for better UX.

### Property 2: Reorder constraint to same date
*For any* transaction and reorder operation (move-up or move-down), the system should only swap display orders with transactions that have the same transaction date.
**Validates: Requirements 1.2**

### Property 3: Distinct display orders for same date
*For any* set of transactions sharing the same transaction date, each transaction should have a unique display order value (or if values are equal, they should be consistently ordered by transaction ID).
**Validates: Requirements 1.4**

### Property 4: Consistency across account views
*For any* transaction that involves multiple accounts, when the transaction is reordered in one account view, it should appear at the same relative position (within its date group) in all other account views.
**Validates: Requirements 2.1, 2.4**

### Property 5: Default display order for new transactions
*For any* newly created transaction, its display order value should equal its creation timestamp (in milliseconds since epoch).
**Validates: Requirements 3.1**

### Property 6: Move-up swap behavior
*For any* transaction that is not the first transaction of its date (in descending display order), when moved up, its display order should be swapped with the previous transaction of the same date (the one with higher displayOrder), and both transactions should maintain valid display order values.
**Validates: Requirements 4.1, 4.5**
**Note**: "Previous" means the transaction with higher displayOrder value (appears above in the UI).

### Property 7: Move-down swap behavior
*For any* transaction that is not the last transaction of its date (in descending display order), when moved down, its display order should be swapped with the next transaction of the same date (the one with lower displayOrder), and both transactions should maintain valid display order values.
**Validates: Requirements 4.2, 4.5**
**Note**: "Next" means the transaction with lower displayOrder value (appears below in the UI).

### Property 8: Valid display order values
*For any* transaction in the system, its display order value should be either null or a valid Float number.
**Validates: Requirements 5.3**

### Property 9: Error handling maintains order
*For any* invalid reorder operation (such as moving up the first transaction or moving down the last transaction), the system should reject the operation and all display order values should remain unchanged.
**Validates: Requirements 4.3, 4.4, 5.5**

## Error Handling

### Validation Errors
- **Invalid Entry ID**: Return `{ success: false, error: "Transaction not found" }`
- **No Same-Date Transactions**: Return `{ success: false, error: "Cannot reorder: no other transactions on this date" }`
- **Already First/Last**: Return `{ success: false, error: "Cannot move up: already first transaction" }` or similar

### Database Errors
- Wrap all database operations in try-catch blocks
- Use transactions to ensure atomicity of swap operations
- Roll back on any error to maintain data consistency
- Log errors for debugging

### Null Display Order Handling
- When querying, treat null displayOrder as `createdAt.getTime()`
- When swapping, if either transaction has null displayOrder, initialize it to `createdAt.getTime()` before swapping

## Testing Strategy

### Unit Testing

Unit tests will verify specific examples and edge cases:

1. **Move-up operation**:
   - Move a middle transaction up
   - Attempt to move the first transaction up (should fail)
   - Move with null displayOrder values

2. **Move-down operation**:
   - Move a middle transaction down
   - Attempt to move the last transaction down (should fail)
   - Move with null displayOrder values

3. **Edge cases**:
   - Single transaction on a date (cannot move)
   - Transactions with identical displayOrder values
   - Transactions with null displayOrder values
   - Invalid entry IDs

4. **Error handling**:
   - Database errors during swap
   - Invalid entry IDs
   - Concurrent modification scenarios

### Property-Based Testing

Property-based tests will verify universal properties across all inputs using **fast-check** (JavaScript/TypeScript property-based testing library):

1. **Property 1: Transaction list ordering**
   - Generate random sets of transactions with various dates and display orders
   - Query transactions for an account
   - Verify the result is sorted by date descending, then displayOrder descending

2. **Property 2: Reorder constraint to same date**
   - Generate random transactions with various dates
   - Perform move-up or move-down on a random transaction
   - Verify that only transactions with the same date were affected

3. **Property 3: Distinct display orders for same date**
   - Generate random transactions with the same date
   - Verify all have unique display order values (or are consistently ordered by ID if equal)

4. **Property 4: Consistency across account views**
   - Generate a transaction involving multiple accounts
   - Reorder it in one account view
   - Verify it appears at the same position in all account views

5. **Property 5: Default display order for new transactions**
   - Generate random transaction data
   - Create the transaction
   - Verify displayOrder equals createdAt timestamp

6. **Property 6: Move-up swap behavior**
   - Generate random transactions with the same date
   - Pick a non-first transaction and move it up
   - Verify display orders were swapped correctly

7. **Property 7: Move-down swap behavior**
   - Generate random transactions with the same date
   - Pick a non-last transaction and move it down
   - Verify display orders were swapped correctly

8. **Property 8: Valid display order values**
   - Generate random transactions
   - Verify all displayOrder values are null or valid Float numbers

9. **Property 9: Error handling maintains order**
   - Generate random transactions
   - Attempt invalid operations (move first up, move last down)
   - Verify all display orders remain unchanged

**Configuration**: Each property-based test will run a minimum of 100 iterations to ensure thorough coverage of the input space.

**Tagging**: Each property-based test will be tagged with a comment in the format: `**Feature: transaction-display-order, Property {number}: {property_text}**`

## Implementation Notes

### Display Order Initialization
- For existing transactions with null displayOrder, the system will treat them as having displayOrder = createdAt.getTime()
- No migration is needed; null handling is built into the query logic

### UI Considerations
- **Clean Design**: The reorder controls should not clutter the transaction table. Consider:
  - Using icon-only buttons (↑/↓ arrows) instead of text buttons
  - Showing reorder buttons only on hover for each row
  - Placing buttons in a compact "Actions" column
  - Using subtle, minimal styling that doesn't distract from transaction data
- **Display Order Context**: Transactions are displayed in descending order (newest/highest displayOrder first):
  - "Move up" (↑) moves a transaction toward the top of the list (increases its displayOrder by swapping with the transaction above)
  - "Move down" (↓) moves a transaction toward the bottom of the list (decreases its displayOrder by swapping with the transaction below)
- Up/down buttons should be disabled when:
  - Only one transaction exists for that date
  - The transaction is first (up button) or last (down button) for that date in the descending-ordered list
- After a successful reorder, refresh the transaction list to show the new order
- Show loading state during reorder operations (e.g., disable buttons, show spinner)

### Performance
- Reorder operations affect only 2 transactions (swap)
- No need to renumber all transactions
- Index on displayOrder ensures efficient sorting

### Future Enhancements
- Drag-and-drop reordering
- Bulk reordering operations
- Renumbering utility if displayOrder values become problematic
