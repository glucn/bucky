# Requirements: Category Management Improvements (F-002)

## Summary

Improve category management with grouping, archiving, balance visibility, and safer deletion rules.

## User Goals

- Create, edit, archive, and delete categories safely.
- Group categories for better organization.
- See category balances, including multi-currency totals.

## Functional Requirements

- Prevent deletion when transactions exist; allow archive instead.
- Support grouped and ungrouped category views.
- Show per-category balances and multi-currency breakdowns.
- Allow reordering category groups.

## Non-Functional Requirements

- Category operations should keep balances consistent with journal data.
- Group operations should not lose category associations.
