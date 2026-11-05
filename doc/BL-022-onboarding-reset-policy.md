# Currency setup and development reset policy

Updated 2026-11-04. BL-022 remains in progress; explicit reset modes are implemented.

Packaged personal books reject development reset at both the IPC registrar and database service,
regardless of inherited test/development environment variables. These controls do not provide a
personal-book deletion feature. Recovery publishes separate profiles and retains originals.

Development reset requires exactly `{ mode: "data" }` or `{ mode: "factory" }`. Missing modes,
the old boolean, extra fields, and unknown modes are rejected before any deletion. The renderer
names each mode and confirms its effect before submitting it. Service errors remain visible.

| Mode | Currency/setup context | Book data and defaults |
| --- | --- | --- |
| Data | Require and retain a supported, explicitly configured base currency. | Clear records and book-derived settings, then seed defaults in the retained currency in the same transaction. |
| Factory | Clear all settings, including base currency. | Clear records and leave accounts/groups empty until explicit setup. |

The current setup context consists of the validated `baseCurrency` setting. Reconciliation state
describes the old book's valuation work, and enrichment/UI settings describe old activity; both
are cleared in either mode. Unknown settings are cleared rather than treated as implicit setup
flags. No separate persisted onboarding-completion flag currently exists. Any future flag must
be deliberately included in this policy. A failed data-reset reseed rolls the entire operation
back, including settings and deleted records.

Test fixtures intentionally reset using factory mode and separately seed their legacy USD
defaults without claiming onboarding is complete. That fixture operation is not product
factory-reset behavior, and never targets packaged personal storage.

New encrypted-profile setup already requires explicit currency before publication/default seeding.
Still required: block ordinary financial workflows for legacy/recovered or development books
with missing/invalid currency until explicit setup, remove implicit startup/fallback seeding from
those paths, preserve existing record currencies/amounts, and verify restart and lock behavior.
The existing nonblocking navigation prompt does not establish that requirement.
