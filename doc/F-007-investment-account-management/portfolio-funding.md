# Portfolio funding

Updated 2026-11-14. Deposit/Withdraw Cash on a portfolio opens the transaction dialog with
working Cash Deposit and Cash Withdrawal options. Both select active settlement cash by account
ID and an active external user account without holding properties. The other account may be an
asset or liability, including another portfolio's cash; this portfolio's own accounts and security
holdings are excluded. Renamed accounts retain their role. An unconfirmed ordinary group cannot
be used as a portfolio.

The dialog also submits its displayed cash and counterparty currency snapshots. The transaction
refuses a stale snapshot if an unused account's currency changed while the form was open, even
when equal numeric amounts would otherwise pass. Existing history prevents currency relabeling;
this guard covers the pre-first-posting window as well.

`amount` always denotes the selected portfolio cash account's native amount. Existing positional
service calls remain supported when there is exactly one eligible cash account. Multiple accounts
require `tradeCashAccountId`; array order and currency matching do not guess an FX destination.
Same-currency transfers use equal amounts on both sides. Different currencies require an explicit
`counterAmount`, the actual amount on the other account. For a deposit it is the amount sent;
for a withdrawal it is the amount received. An optional supplied exchange rate must agree with
those amounts. Otherwise their source-to-destination ratio is recorded on both journal lines.

The implied transaction rate is not a canonical valuation rate. Funding does not create or update
`FxDailyRate`; historical reporting still requires its own verified canonical data. Missing reporting
FX remains unavailable, even when a funding transaction retains an actual conversion rate.

Selection, account/currency checks, dated withdrawal availability, journal creation, existing
opening-balance backfill adjustments and final funding tagging share one transaction. A later
tag failure rolls everything back. Concurrent withdrawals cannot both spend the same available
cash. Archived accounts, securities, category/system counterparties and conflicting user-account
journal units require correction rather than a guessed cash movement.

Withdrawal availability uses journal cash through the selected posting date. A later deposit or
opening balance cannot fund an earlier withdrawal. Checkpoint-derived balance must agree with
the dated journal before withdrawing; discrepancy requires reconciliation, with no checkpoint
rewrite or invented adjustment. A deposit from another portfolio applies the same check to that
outgoing cash account, so choosing the receiving portfolio's form cannot bypass it.
This is not a whole-book verifier, historical baseline/replay,
margin-credit authorization or a guarantee about all future cash balances.

The dialog labels both currencies and the funding direction, shows the implied FX rate, and
clears native amounts when account or direction changes. Failed saves retain the dialog and
values for correction. Late responses cannot populate another portfolio's choices or close its
dialog. The new funding-account read uses the ordinary authenticated IPC inventory.

Funding uses the app's existing positive finite cent amounts and Float storage. Sub-cent amounts
rounding to zero are refused. This does not complete BL-031 exact decimal/commodity precision.
