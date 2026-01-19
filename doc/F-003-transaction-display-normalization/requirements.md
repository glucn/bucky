# Requirements: Transaction Display Normalization (F-003)

## Summary

Present transaction amounts and balances with user-friendly signs while preserving double-entry accounting data integrity.

## User Goals

- See income/spending with intuitive positive/negative conventions per account type.
- View category totals as positive values.
- Ensure transfers show meaningful signs for both sides.

## Functional Requirements

- Normalize transaction amounts by account type and subtype.
- Normalize balances for user and category accounts.
- Apply normalization consistently across UI surfaces.
- Preserve raw amounts in the database.

## Non-Functional Requirements

- Normalization must be pure (no data mutation).
- Formatting should remain consistent across pages and reports.
