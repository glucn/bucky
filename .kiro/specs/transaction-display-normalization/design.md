# Design Document

## Overview

This design implements a presentation layer for normalizing transaction amounts and account balances in a double-entry accounting system. The system maintains accurate double-entry bookkeeping at the database level while providing an intuitive user interface that displays amounts according to user expectations rather than accounting conventions.

The core design principle is separation of concerns: the database layer stores raw debit/credit amounts following standard accounting rules, while utility functions transform these amounts for display based on account type and transaction context. This approach ensures data integrity while improving user experience.

## Architecture

### Layered Architecture

The system follows a three-layer architecture:

1. **Data Layer (Existing)**: Prisma database with Journal Entries, Journal Lines, and Accounts
2. **Business Logic Layer (Existing)**: DatabaseService handles all CRUD operations and maintains accounting rules
3. **Presentation Layer (New)**: Display normalization utilities transform raw amounts for UI consumption

### Key Design Decisions

1. **Non-Destructive Transformation**: All normalization happens at display time; stored data remains unchanged
2. **Centralized Logic**: All display normalization logic resides in utility functions, not scattered across components
3. **Type Safety**: TypeScript types ensure correct usage of display functions
4. **Backward Compatibility**: Existing database schema and business logic remain unchanged

## Components and Interfaces

### Display Normalization Utilities

Location: `src/renderer/utils/displayNormalization.ts` (new file)

#### Core Functions

```typescript
/**
 * Normalize a transaction amount for display based on account type and context
 */
function normalizeTransactionAmount(
  amount: number,
  accountType: AccountType,
  accountSubtype: AccountSubtype,
  isCurrentAccount: boolean
): number

/**
 * Normalize an account balance for display
 */
function normalizeAccountBalance(
  balance: number,
  accountType: AccountType,
  accountSubtype: AccountSubtype
): number

/**
 * Get display sign for a transaction (for styling purposes)
 */
function getTransactionDisplaySign(
  amount: number,
  accountType: AccountType,
  accountSubtype: AccountSubtype,
  isCurrentAccount: boolean
): 'positive' | 'negative' | 'neutral'
```

#### Helper Functions

```typescript
/**
 * Determine if an amount represents income for a given account
 */
function isIncomeTransaction(
  amount: number,
  accountType: AccountType,
  accountSubtype: AccountSubtype
): boolean

/**
 * Determine if an amount represents expense for a given account
 */
function isExpenseTransaction(
  amount: number,
  accountType: AccountType,
  accountSubtype: AccountSubtype
): boolean
```

### Updated Currency Utilities

Location: `src/renderer/utils/currencyUtils.ts` (existing file, enhanced)

Add new function:

```typescript
/**
 * Format a normalized transaction amount with currency
 */
function formatNormalizedTransactionAmount(
  amount: number,
  currency: string,
  accountType: AccountType,
  accountSubtype: AccountSubtype,
  isCurrentAccount: boolean,
  options?: FormatOptions
): string
```

### Component Updates

The following components will be updated to use normalization utilities:

1. **AccountTransactionsPage**: Display normalized amounts in transaction table
2. **Dashboard**: Display normalized balances and income/expense summaries
3. **Categories**: Display normalized category balances and transaction amounts
4. **ManualTransactionModal**: Display normalized amounts in edit mode
5. **ImportTransactionsWizard**: Apply normalization to imported transaction preview

## Data Models

No changes to existing data models. The database schema remains unchanged:

- `Account`: Stores account type and subtype
- `JournalEntry`: Stores transaction metadata
- `JournalLine`: Stores raw debit/credit amounts

The normalization logic operates on data retrieved from these models without modification.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property Reflection

After analyzing all acceptance criteria, several properties can be consolidated:
- Bank and cash accounts are both user accounts with asset subtype, so their display rules are identical
- Income and expense category balance displays follow the same pattern (absolute value)
- Multi-currency handling applies uniformly across category types
- Dashboard asset/liability displays are covered by general balance normalization

### Correctness Properties

Property 1: Asset account spending displays negative
*For any* user account with asset subtype and any spending transaction (negative raw amount), the normalized display amount should be negative
**Validates: Requirements 1.1, 1.3**

Property 2: Asset account income displays positive
*For any* user account with asset subtype and any income transaction (positive raw amount), the normalized display amount should be positive
**Validates: Requirements 1.2, 1.4**

Property 3: Asset account balance preserves sign
*For any* user account with asset subtype, the normalized balance should have the same sign as the raw balance (positive when funded, negative when overdrawn)
**Validates: Requirements 1.5**

Property 4: Liability account spending displays positive
*For any* user account with liability subtype and any spending transaction (positive raw amount), the normalized display amount should be positive
**Validates: Requirements 2.1**

Property 5: Liability account payment displays negative
*For any* user account with liability subtype and any payment transaction (negative raw amount), the normalized display amount should be negative
**Validates: Requirements 2.2**

Property 6: Liability account balance displays as absolute value
*For any* user account with liability subtype, the normalized balance should display as the absolute value of the raw balance (positive when owed, negative when credit balance)
**Validates: Requirements 2.3, 2.4**

Property 7: Income category transactions display as positive
*For any* category account with asset subtype and any transaction amount, the normalized display amount should be positive (absolute value)
**Validates: Requirements 3.1**

Property 8: Expense category transactions display as positive
*For any* category account with liability subtype and any transaction amount, the normalized display amount should be positive (absolute value)
**Validates: Requirements 4.1**

Property 9: Category balances display as positive
*For any* category account (regardless of subtype) and any balance value, the normalized balance should be positive (absolute value)
**Validates: Requirements 3.2, 4.2**

Property 10: Multi-currency category balances display as positive
*For any* category account with transactions in multiple currencies, each currency balance should normalize to a positive value (absolute value)
**Validates: Requirements 3.3, 4.3**

Property 11: Normalization is non-destructive
*For any* transaction or balance, applying normalization should not modify the original raw amount stored in the database
**Validates: Requirements 5.5**

Property 12: Asset-to-asset transfer displays correctly
*For any* transfer between two user accounts with asset subtype, the source account should display a negative amount and the destination account should display a positive amount
**Validates: Requirements 6.1**

Property 13: Asset-to-liability transfer displays correctly
*For any* transfer from a user account with asset subtype to a user account with liability subtype, both accounts should display negative amounts (outflow from asset, payment to liability)
**Validates: Requirements 6.2**

Property 14: Dashboard income displays positive
*For any* set of income category transactions in a period, the dashboard total income should display as a positive value
**Validates: Requirements 7.1**

Property 15: Dashboard expenses display positive
*For any* set of expense category transactions in a period, the dashboard total expenses should display as a positive value
**Validates: Requirements 7.2**

Property 16: Net worth calculation is correct
*For any* set of asset and liability accounts, the dashboard net worth should equal (sum of normalized asset balances - sum of normalized liability balances)
**Validates: Requirements 7.3**

Property 17: Import interpretation for asset accounts
*For any* transaction imported into a user account with asset subtype, negative amounts should be interpreted as spending and positive amounts as income
**Validates: Requirements 8.1**

Property 18: Import interpretation for liability accounts
*For any* transaction imported into a user account with liability subtype, positive amounts should be interpreted as spending and negative amounts as payments
**Validates: Requirements 8.2**

Property 19: Import and manual transaction consistency
*For any* equivalent transaction (same account, amount, type), whether created manually or imported, the normalized display amount should be identical
**Validates: Requirements 8.4**

## Error Handling

### Invalid Input Handling

1. **Null or Undefined Amounts**: Normalization functions should treat null/undefined as zero
2. **Invalid Account Types**: Functions should throw descriptive errors for unknown account types
3. **Missing Account Metadata**: Functions should require account type and subtype; throw error if missing

### Edge Cases

1. **Zero Amounts**: Should display as zero regardless of account type
2. **Very Large Numbers**: Should maintain precision and not overflow
3. **Floating Point Precision**: Should round to 2 decimal places for currency display
4. **Multi-Currency Transfers**: Should preserve both amounts and exchange rate information

### Validation

1. **Type Checking**: TypeScript types enforce correct parameter types at compile time
2. **Runtime Validation**: Functions validate account type/subtype enums at runtime
3. **Consistency Checks**: Unit tests verify normalization rules are applied consistently

## Testing Strategy

### Unit Testing

The testing strategy uses a combination of unit tests and property-based tests:

**Unit Tests** will cover:
- Specific examples of each normalization rule
- Edge cases (zero amounts, null values, boundary conditions)
- Error conditions (invalid account types, missing metadata)
- Integration with currency formatting functions

**Property-Based Tests** will verify:
- Universal properties hold across all valid inputs
- Normalization is consistent and non-destructive
- Rules apply correctly regardless of specific amount values
- Multi-currency handling works for any currency combination

### Property-Based Testing

We will use **fast-check** (JavaScript/TypeScript property-based testing library) to implement property tests. Each correctness property will be implemented as a property-based test that:

1. Generates random valid inputs (accounts, amounts, transactions)
2. Applies the normalization function
3. Verifies the property holds for all generated inputs
4. Runs a minimum of 100 iterations per property

Each property-based test will be tagged with a comment explicitly referencing the correctness property:
- Format: `// Feature: transaction-display-normalization, Property {number}: {property_text}`
- Example: `// Feature: transaction-display-normalization, Property 1: Asset account spending displays negative`

### Test Organization

Tests will be organized as follows:
- `src/renderer/utils/displayNormalization.test.ts`: Unit and property tests for normalization functions
- `src/renderer/utils/currencyUtils.test.ts`: Tests for enhanced currency formatting with normalization
- Integration tests in component test files to verify UI correctly uses normalization utilities

### Testing Configuration

- Property-based tests will run 100 iterations minimum
- Tests will use TypeScript for type safety
- Tests will mock database layer to focus on normalization logic
- Tests will verify both positive and negative test cases

## Implementation Notes

### Performance Considerations

1. **Caching**: Normalization functions are pure and stateless; results can be memoized if needed
2. **Batch Operations**: When normalizing multiple transactions, avoid redundant account lookups
3. **Lazy Evaluation**: Only normalize amounts when actually displayed, not during data fetching

### Migration Strategy

1. **Phase 1**: Implement normalization utilities without changing UI
2. **Phase 2**: Update one component at a time to use normalization
3. **Phase 3**: Add visual regression tests to catch display issues
4. **Phase 4**: Update all remaining components

### Backward Compatibility

- Existing database queries and business logic remain unchanged
- Existing API contracts (IPC handlers) remain unchanged
- Only presentation layer components are modified
- Changes are additive (new utilities) rather than modifications to existing code

### Future Enhancements

1. **User Preferences**: Allow users to customize display conventions
2. **Localization**: Support different accounting conventions by region
3. **Accessibility**: Add ARIA labels to indicate positive/negative amounts
4. **Visual Indicators**: Use color coding (green/red) to reinforce amount signs
