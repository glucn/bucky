# Currency setup and development reset policy

Updated 2026-11-04. Explicit reset modes and the main-enforced currency setup gate are implemented.
Full development E2E and representative personal acceptance remain open.

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

New encrypted-profile setup requires explicit currency before publication/default seeding.
After authentication, recovered/legacy and development books must also have a valid supported
base currency before financial IPC or financial providers/views can run. The setup-state read
and completion are ordinary authenticated IPC, so they cannot inspect encrypted settings while
locked. Main permits only setup and the already-guarded development reset through this gate;
setup read failure denies ordinary data access. Startup no longer seeds default accounts.

The setup form starts with no selected currency. Completion commits the selection and initial
seeding together for an empty book. Existing account currencies and postings are preserved
exactly, with valuation reconciliation marked pending; selecting base currency never converts
or relabels those records. Setup cannot replace an already configured base currency. Competing
setup requests are refused while one transaction owns initialization. Ordinary currency changes
continue through settings, with non-string currency writes rejected in IPC.

Lock drains setup IPC and closes/revokes storage. The security owner rechecks its session after
the asynchronous currency preflight and before invoking a financial action. The renderer ignores
late setup responses after unmount. Restart requires authentication again and uses the committed
selection. A recreated Opening Balances system account now respects the configured currency.

Native/encrypted service tests cover setup transaction failure and retained records; main tests
cover setup gating and lock revocation; renderer tests verify no early financial mounts and retry.
Packaged cases cover missing and malformed currency, pre-authentication denial, post-authentication
financial denial, explicit selection, unchanged CAD records while selecting EUR, pending review,
and restart. Development import fixtures now explicitly choose USD through the setup UI, and
browser-only financial fixtures declare their mocked authenticated/configured state. Those
development/browser E2E changes still need a fresh run on an isolated server: port 3000 is owned
by an existing process and has been left untouched. Packaged acceptance uses separate disposable
profiles and does not rely on that server.
