# Requirements: Liability Unified Model (F-014)

## Goal

Define a generic liability account model as the default UX and data contract for all liability accounts, while keeping compatibility with existing credit-card workflows.

## Product Direction

- Generic liability UX is the base model for all liability accounts.
- Credit-card-specific UX may remain as a specialized implementation of the base model, but it must not be required for liability account setup/use.
- The base model must provide functionality close to current credit-card workflows for core liability management.

## MVP Scope

- Liability account creation/editing through a unified base flow.
- Generic liability profile fields and derived metrics where data is available.
- Liability detail view that surfaces required base metrics and payment context.
- Backward-compatible behavior for existing accounts configured with credit-card properties.

## Functional Requirements

### FR-1 Base Liability Creation Flow

- Users must be able to create and use liability accounts without entering a specialized credit-card setup flow.
- Liability accounts must remain first-class user accounts in existing account lists, transaction flows, and reporting surfaces.

### FR-2 Base Liability Profile

The base liability profile must support:

- Outstanding balance semantics for amounts owed.
- Optional liability limit/ceiling.
- Optional statement cycle fields:
  - `statementClosingDay`
  - `paymentDueDay`
- Optional payment policy fields:
  - Scheduled payment amount (installment-style liabilities)
  - Minimum payment policy (revolving-style liabilities), including percentage and fixed amount modes.

### FR-3 Derived Liability Metrics

- Liability detail view must show current amount owed.
- When enough supporting data exists, liability detail view must also show derived metrics such as:
  - Available limit
  - Utilization
- If required inputs are missing, metrics must degrade gracefully with a clear unavailable state (never misleading zeros).

### FR-4 Sign and Label Consistency

- Liability display conventions must remain intuitive and consistent with existing app behavior (for example, "Balance owed" wording for liability contexts).
- Amount sign behavior for liability accounts must remain consistent across account creation, account details, transaction pages, and summaries.

### FR-5 Backward Compatibility

- Existing credit-card accounts and their historical properties must continue to function after F-014 rollout.
- Users must not be required to perform manual migration to preserve existing liability/credit-card functionality.
- Existing credit-card metrics and workflows must remain available either through:
  - The base liability model, or
  - A specialized implementation layered on top of the base model.

### FR-6 Compatibility in Existing Flows

- Liability accounts under the base model must work with existing transaction entry and transfer flows.
- Existing reporting and balance-calculation behavior must continue to include liabilities correctly without requiring feature-specific account type branching.

## Non-Functional Requirements

- **Accounting Integrity**: Double-entry correctness and journal immutability rules remain unchanged.
- **Migration Safety**: Upgrade path must preserve existing liability and credit-card data with zero manual migration.
- **UX Consistency**: Liability behavior should be predictable and consistent across pages.
- **Testability**: Requirements must be implemented with deterministic service/UI behavior suitable for unit, service, and UI tests.

## Out of Scope (F-014)

- New advanced debt products (for example full amortization planners, refinancing calculators).
- Major reporting redesign beyond adopting the unified liability base model.
- User-facing provider/integration features unrelated to liability modeling.

## Acceptance Criteria

1. A user can create a liability account and use it end-to-end without any mandatory credit-card-specific setup step.
2. Liability detail view shows amount owed and, when data exists, derived metrics (available limit/utilization).
3. Liability labels and sign conventions remain consistent and intuitive in account setup and account detail/transaction contexts.
4. Existing credit-card-configured accounts continue to work after upgrade without manual migration.
5. Core credit-card-like functionality remains available at parity level via the base model and/or an optional specialized layer.
6. Existing transaction and reporting flows continue to include liabilities correctly with no accounting-regression behavior.
