# Design: Liability Unified Model (F-014)

## Summary

F-014 introduces a unified liability model where generic liability UX is the default for all liability accounts. Credit card behavior becomes a template-driven implementation of the same base model instead of a separate required flow. The design keeps accounting correctness and opening-balance semantics intact while adding template-specific validation, controlled conversion, and versioned liability profile history.

This design favors low-friction account creation plus structured setup where needed, and supports future payment-calculator work by versioning effective-dated liability terms.

## Product Direction

- Generic liability UX is the base model for all liabilities.
- Liability templates provide guided setup, not separate domain models.
- Credit card specialization is implemented within the base model.
- Existing credit-card pipeline remains temporarily as a compatibility layer and will be removed after F-014 stabilization.

## Scope

### In Scope (F-014 MVP)

- Guided account creation: choose `Asset` vs `Liability`; liability requires template selection.
- Liability templates: `Credit Card`, `Loan/Mortgage`, `Personal Debt`, `Blank`.
- Unified liability profile setup/edit flow.
- Template conversion in `Edit Liability > Advanced` only.
- Full-snapshot version history with effective dates, including backdated corrections.
- Read-only expandable history list in Advanced.
- Liability balance source of truth remains opening-balance/journal logic.
- High-level IPC/API updates for unified liability profile operations.

### Out of Scope (Deferred)

- Payment calculator behavior and UI.
- Version revert/delete tooling.
- History filtering/search.
- Full retirement of legacy credit-card pipeline (tracked as follow-up cleanup).

## Current Implementation Snapshot

- Liability semantics already exist at account subtype and transaction sign logic levels.
- Credit-card behavior is currently implemented via `CreditCardProperties` + dedicated service/IPC/UI flow.
- Credit-card setup is special-cased in account creation and details UI.
- Opening balance already supports liability-friendly display semantics and journal-backed balance correctness.

## UX Design

## 1) Account Creation Flow

- Replace current mixed account-type/subtype form with guided flow:
  1. Select `Asset` or `Liability`.
  2. If `Liability`, select required template.
  3. Create account and continue directly into liability profile setup.
- `Skip for now` behavior:
  - Allowed only for `Blank`.
  - Not allowed for `Credit Card`, `Loan/Mortgage`, `Personal Debt`.

## 2) Liability Templates

- `Credit Card`: revolving debt setup.
- `Loan/Mortgage`: installment-style debt setup.
- `Personal Debt`: one counterparty per account.
- `Blank`: minimal generic liability, no preset assumptions.

Template-derived account type labels are system-defined and not user-editable. Account names remain user-editable.

## 3) Unified Liability Profile

- Single setup/edit surface for all liability templates.
- Fields are mostly optional in the base model; UI enforces template-specific requirements.
- For accounts with existing transactions, `currentAmountOwed` is read-only in profile and live balance is shown.
- Opening balance can still be adjusted through dedicated opening-balance workflow.

## 4) Conversion UX

- Conversion is available only in `Edit Liability > Advanced`.
- Block conversion if target template required fields are missing; prompt user inline.
- On conversion away from a template, incompatible fields are retained and hidden (not deleted).

## 5) Version History UX

- Location: `Edit Liability > Advanced`.
- MVP history list is read-only, no filter.
- Each row shows:
  - effective date
  - changed-fields summary
  - update timestamp
- Rows are expandable to show exact old/new values.
- Optional change note is supported on update and immutable after save.
- Mistaken updates are corrected by creating a new version entry.

## Field Matrix

Legend:
- Visible: field appears for that template in setup/edit.
- Req Create: required at setup for that template.
- Req Convert Target: required when converting into that template.
- Convert Away: behavior when leaving a template where field is primary.

| Field | Credit Card | Loan/Mortgage | Personal Debt | Blank | Req Create | Req Convert Target | Convert Away |
| --- | --- | --- | --- | --- | --- | --- | --- |
| accountName | Yes | Yes | Yes | Yes | Yes (all) | Yes (all) | Keep |
| currentAmountOwed | Yes | Yes | Yes | Yes | Yes (all) | Yes (all) | Keep |
| asOfDate (for currentAmountOwed) | Yes | Yes | Yes | Yes | Required when amount entered | Required when amount entered | Keep |
| counterpartyName | Optional | Optional | Yes | Optional | Personal Debt only | Personal Debt only | Keep + hide |
| limitOrCeiling | Yes | Optional | Optional | Optional | No | No | Keep + hide |
| statementClosingDay | Yes | Optional | Optional | Optional | Credit Card only | Credit Card only | Keep + hide |
| paymentDueDay | Yes | Yes | Optional | Optional | Credit Card + Loan/Mortgage | Target template rules | Keep + hide |
| minimumPaymentPolicy | Yes | Optional | Optional | Optional | Credit Card only | Credit Card only | Keep + hide |
| interestRate | Optional | Yes | Optional | Optional | Loan/Mortgage only | Loan/Mortgage only | Keep + hide |
| scheduledPaymentAmount | Optional | Yes | Optional | Optional | Loan/Mortgage only | Loan/Mortgage only | Keep + hide |
| paymentFrequency | Optional | Yes | Optional | Optional | Loan/Mortgage only | Loan/Mortgage only | Keep + hide |
| dueSchedule | Optional | Yes | Optional | Optional | Loan/Mortgage only | Loan/Mortgage only | Keep + hide |
| repaymentMethod | Optional | Yes | Optional | Optional | Loan/Mortgage only | Loan/Mortgage only | Keep + hide |
| originalPrincipal | Optional | Optional | Optional | Optional | No | No | Keep + hide |
| effectiveDate (version write) | Yes | Yes | Yes | Yes | Optional, defaults to today | Optional, defaults to today | Keep |
| changeNote | Yes | Yes | Yes | Yes | Optional | Optional | Keep |

## Validation Rules

### Global

- `currentAmountOwed` maps to opening-balance semantics and requires `asOfDate` when provided.
- Interest rate is entered as percentage in UI and stored as decimal.
- Duplicate version `effectiveDate` for same liability profile is rejected.
- Monthly due-day values clamp to end of month where needed.

### Credit Card Template

- Required in setup:
  - `limitOrCeiling`
  - `statementClosingDay` (1-31)
  - `paymentDueDay` (1-31)
  - minimum payment policy (percent or amount)
- Optional in F-014:
  - `interestRate`
  - `effectiveDate` (defaults to today)

### Loan/Mortgage Template

- Required in setup:
  - `currentAmountOwed`
  - `interestRate`
  - `scheduledPaymentAmount`
  - `paymentFrequency`
  - `paymentDueDay`
  - `dueSchedule`
  - `repaymentMethod`
- `originalPrincipal` is optional.

### Due Schedule by Frequency

- `monthly`: require `dueDayOfMonth`.
- `weekly` and `biweekly`: require `dueWeekday` plus cadence `anchorDate`.

### Personal Debt Template

- Required in setup:
  - `counterpartyName`
  - `currentAmountOwed`
- One counterparty per personal-debt account.

### Blank Template

- Required in setup:
  - `accountName`
  - `currentAmountOwed`

## Data Model

F-014 uses a hybrid persistence approach: structured tables for business-critical fields and a minimal optional JSON field for non-critical metadata.

### Core and Capability Blocks

- `LiabilityProfile` (1:1 with account)
  - account linkage
  - template
  - base state metadata
  - optional non-critical `meta` JSON
- Structured terms blocks (as normalized structured relations)
  - revolving terms
  - installment terms
  - counterparty details

### Versioning

- Unified version timeline for terms and rate in one effective-dated snapshot record.
- Full snapshot per version (not delta-only).
- Backdated corrections allowed.
- Duplicate effective dates rejected.
- Historical entries are immutable for edit/delete in MVP.
- Optional immutable `changeNote` stored with version record.

### Refinance/Renewal (MVP)

- In-place refinance/renewal is supported by adding a new effective-dated unified version.
- No separate replacement-account refinance flow required in F-014.

## Balance and Accounting Semantics

- Liability balance source of truth remains journal + opening-balance workflows.
- Liability profile does not create a second competing balance source.
- After transactions exist:
  - profile balance input is locked/read-only
  - current balance displays from computed ledger value
- Opening-balance corrections remain possible via dedicated opening-balance workflow.

## IPC/API Contract (High Level)

Add/replace renderer-facing operations for unified liability profile:

- Create/get/update liability profile for account.
- Create new effective-dated liability version snapshot.
- Convert liability template with validation.
- Get liability metrics (derived where inputs are sufficient).
- Get liability version history (list + row details).

Compatibility period:

- Existing credit-card IPC/service surface remains temporarily available.
- Unified endpoints become primary renderer path in F-014.

## Compatibility and Cleanup TODOs

- Keep legacy credit-card pipeline during F-014 stabilization.
- Cleanup to execute after manual user trigger:
  - Remove legacy credit-card setup entry flow.
  - Remove legacy credit-card IPC handlers once unified flow is complete.
  - Remove duplicated `creditCardService` business logic replaced by unified liability logic.
  - Remove `CreditCardProperties` persistence once unused.
  - Remove renderer branches tied to legacy credit-card checks.
  - Run regression checklist before and after cleanup.

## Testing Strategy

### Unit Tests

- Field-level validation per template.
- Due-schedule validation (monthly clamp, weekday + anchor requirements).
- Interest-rate UI percent-to-decimal conversion.
- Version creation rules:
  - duplicate effective date rejection
  - backdated insertion acceptance
  - snapshot diff generation for history display

### Service Tests

- Liability profile create/read/update across all templates.
- Conversion validation gating and required-field enforcement.
- Unified version snapshot writes and read ordering.
- Backdated version behavior.
- Balance source-of-truth consistency with opening-balance integration.
- Derived metrics graceful degradation when optional inputs are missing.

### Renderer/UI Tests

- Guided account creation (`Asset` vs `Liability`) and required template selection.
- Post-create setup continuation behavior and `Skip for now` gating.
- Template-specific required-field UX and inline validation.
- Conversion flow in Advanced with required-field prompts.
- History list rendering (summary row + expandable old/new details).
- Read-only balance behavior when transactions exist.

### E2E Tests

- Create each liability template account end-to-end.
- Verify required setup for non-Blank templates.
- Verify Blank skip path.
- Convert template in Advanced and verify retained/hidden fields.
- Create multiple versions (including backdated) and verify history ordering/content.
- Verify opening-balance-driven liability balance display and edit boundaries.

## Deferred Features (Backlog)

- Payment calculator implementation using versioned liability snapshots.
- Advanced history filtering/search.
- Version revert/admin correction tooling.
- Rich refinance flows beyond in-place versioning.
- Legacy credit-card pipeline full removal (manual trigger after stabilization).
