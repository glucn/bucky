# Implementation Plan

- [x] 1. Create display normalization utility module
  - Create `src/renderer/utils/displayNormalization.ts` with core normalization functions
  - Implement `normalizeTransactionAmount()` function with logic for all account types
  - Implement `normalizeAccountBalance()` function with logic for all account types
  - Implement helper functions: `isIncomeTransaction()`, `isExpenseTransaction()`, `getTransactionDisplaySign()`
  - Add TypeScript types and interfaces for normalization parameters
  - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.1, 4.2, 5.5_

- [x] 1.1 Write property test for asset account spending display
  - **Property 1: Asset account spending displays negative**
  - **Validates: Requirements 1.1, 1.3**

- [x] 1.2 Write property test for asset account income display
  - **Property 2: Asset account income displays positive**
  - **Validates: Requirements 1.2, 1.4**

- [x] 1.3 Write property test for asset account balance sign preservation
  - **Property 3: Asset account balance preserves sign**
  - **Validates: Requirements 1.5**

- [x] 1.4 Write property test for liability account spending display
  - **Property 4: Liability account spending displays positive**
  - **Validates: Requirements 2.1**

- [x] 1.5 Write property test for liability account payment display
  - **Property 5: Liability account payment displays negative**
  - **Validates: Requirements 2.2**

- [x] 1.6 Write property test for liability account balance display
  - **Property 6: Liability account balance displays as absolute value**
  - **Validates: Requirements 2.3, 2.4**

- [x] 1.7 Write property test for income category transaction display
  - **Property 7: Income category transactions display as positive**
  - **Validates: Requirements 3.1**

- [x] 1.8 Write property test for expense category transaction display
  - **Property 8: Expense category transactions display as positive**
  - **Validates: Requirements 4.1**

- [x] 1.9 Write property test for category balance display
  - **Property 9: Category balances display as positive**
  - **Validates: Requirements 3.2, 4.2**

- [x] 1.10 Write property test for multi-currency category balances
  - **Property 10: Multi-currency category balances display as positive**
  - **Validates: Requirements 3.3, 4.3**

- [x] 1.11 Write property test for non-destructive normalization
  - **Property 11: Normalization is non-destructive**
  - **Validates: Requirements 5.5**

- [x] 1.12 Write unit tests for edge cases
  - Test zero amounts
  - Test null/undefined handling
  - Test invalid account types
  - Test floating point precision
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 4.1_

- [x] 2. Enhance currency utilities with normalization support
  - Update `src/renderer/utils/currencyUtils.ts`
  - Add `formatNormalizedTransactionAmount()` function that combines normalization and formatting
  - Add `formatNormalizedBalance()` function for balance display
  - Ensure backward compatibility with existing currency formatting functions
  - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 2.3, 3.1, 4.1_

- [x] 2.1 Write unit tests for normalized currency formatting
  - Test formatting with different account types
  - Test currency symbol and code display
  - Test sign handling in formatted output
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 3. Update AccountTransactionsPage component
  - Import normalization utilities
  - Update transaction amount display to use `normalizeTransactionAmount()`
  - Update balance calculation display to use `normalizeAccountBalance()`
  - Handle transfer transactions between different account types correctly
  - Preserve multi-currency transfer display with exchange rates
  - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 2.3, 6.1, 6.2, 6.3_

- [x] 3.1 Write property test for asset-to-asset transfer display
  - **Property 12: Asset-to-asset transfer displays correctly**
  - **Validates: Requirements 6.1**

- [x] 3.2 Write property test for asset-to-liability transfer display
  - **Property 13: Asset-to-liability transfer displays correctly**
  - **Validates: Requirements 6.2**

- [x] 4. Update Dashboard component
  - Import normalization utilities
  - Update net worth calculation to use normalized balances
  - Update income/expense display to use absolute values
  - Update asset and liability totals to use normalized balances
  - Ensure multi-currency support is maintained
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 4.1 Write property test for dashboard income display
  - **Property 14: Dashboard income displays positive**
  - **Validates: Requirements 7.1**

- [x] 4.2 Write property test for dashboard expenses display
  - **Property 15: Dashboard expenses display positive**
  - **Validates: Requirements 7.2**

- [x] 4.3 Write property test for net worth calculation
  - **Property 16: Net worth calculation is correct**
  - **Validates: Requirements 7.3**

- [x] 5. Update Categories page component
  - Import normalization utilities
  - Update category balance display to use `normalizeAccountBalance()`
  - Update transaction amount display in category transaction views
  - Ensure multi-currency category balances display correctly
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3_

- [x] 6. Update ManualTransactionModal component
  - Import normalization utilities
  - Display normalized amounts when editing existing transactions
  - Ensure amount input interpretation matches account type
  - Update preview/confirmation displays to show normalized amounts
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 7. Update ImportTransactionsWizard component
  - Import normalization utilities
  - Implement import interpretation logic for asset accounts (negative = spending, positive = income)
  - Implement import interpretation logic for liability accounts (positive = spending, negative = payment)
  - Display normalized amounts in import preview
  - Ensure imported transactions display consistently with manual transactions
  - _Requirements: 8.1, 8.2, 8.4_

- [x] 7.1 Write property test for asset account import interpretation
  - **Property 17: Import interpretation for asset accounts**
  - **Validates: Requirements 8.1**

- [x] 7.2 Write property test for liability account import interpretation
  - **Property 18: Import interpretation for liability accounts**
  - **Validates: Requirements 8.2**

- [x] 7.3 Write property test for import and manual transaction consistency
  - **Property 19: Import and manual transaction consistency**
  - **Validates: Requirements 8.4**

- [x] 8. Update TransferModal component
  - Import normalization utilities
  - Display normalized amounts for both source and destination accounts
  - Show appropriate signs based on account types involved in transfer
  - Handle multi-currency transfers with proper normalization
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 9. Update Accounts page component
  - Import normalization utilities
  - Update account balance display in account list
  - Ensure balances display with correct signs for all account types
  - _Requirements: 1.5, 2.3, 2.4_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Add visual indicators for transaction types
  - Add CSS classes for positive/negative amounts
  - Implement color coding (green for income/positive, red for expense/negative)
  - Add ARIA labels for accessibility
  - Ensure visual indicators are consistent across all components
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 11.1 Write unit tests for visual indicator logic
  - Test CSS class assignment based on transaction type
  - Test color coding logic
  - Test ARIA label generation
  - _Requirements: 1.1, 1.2, 2.1, 2.2_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
