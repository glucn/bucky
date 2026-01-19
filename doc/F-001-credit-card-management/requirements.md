# Requirements: Credit Card Management (F-001)

## Summary

Enable credit card accounts with property configuration, metrics, and display conventions tailored to liability accounts.

## User Goals

- Configure credit card terms (limit, interest, statement dates, minimums).
- View credit utilization, available credit, and minimum payment.
- Manage updates to credit card properties over time.

## Functional Requirements

- Store credit card properties with versioning by effective date.
- Validate credit card configuration input.
- Provide computed metrics (utilization, available credit, minimum payment).
- Enforce liability subtype for credit card setup.

## Non-Functional Requirements

- Ensure property updates are transactional and auditable.
- Keep UI display consistent with liability account conventions.
