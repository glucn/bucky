# Dated investment activity

Chronological activity, dated quantity and basis reads, and reviewed legacy cutovers are
implemented. Backdated replay and investment correction controls remain open.

`InvestmentActivity` is the source for dated quantities and basis in newly tracked security
accounts. Each event stores account identity, currency, effective date, a per-account sequence,
kind, before/after quantity and basis, resulting lots, and applicable units/price/fee/split ratio
and cash amount. `InvestmentActivityJournal` links every monetary or split journal in the event.
Reinvestments link receipt and purchase journals to one activity. Display ordering and editable
descriptions do not determine activity identity or quantity.

Buy, sell, held-security dividends, reinvestments, return of capital and splits record activity
inside the same transaction as their journal and current-position changes. Activity-write or
verification failure rolls back all effects. Before posting, tracked accounts must agree with
their activity chain. Verification checks sequence/date order, units/split transitions, basis,
FIFO lots, linked balanced journals, posting dates/currencies, untracked security-account lines,
and the current cached position. Invalid chains return unavailable rather than current quantities.

An inclusive as-of read selects the last verified event on or before the requested date. Before
the first event in a newly tracked account, holdings/basis are zero. A later complete sale or
split does not erase earlier quantities or basis. `getPositionDetails` uses this dated snapshot;
the existing main/preload endpoint carries the corrected values. Price lookup still uses the
canonical market-aware path described in [price controls](price-controls.md).

The migration adds `hasCompleteActivityHistory = false` to every existing holding and creates
empty activity tables. It does not infer trades, lot dates, starting quantities or completeness.
New empty holdings created through supported services establish complete tracking. A legacy
holding can establish a cutover from **Review baseline** on the holding page. Compare retained
units, native journal basis and FIFO lots with records, select a date at or after all retained
activity, and confirm. Average-cost holdings do not need lot data. FIFO lots must be in
acquisition order, dated no later than the cutover, and reconcile to the units and basis.

Confirmation records a baseline event and links retained basis journals without changing their
contents or writing new money. It verifies the chain in the same transaction and rolls back on
inconsistency. Dates before the cutover remain unavailable. The cutover is a reviewed closing
position; new activity must be dated after it so statements cannot silently post a cutover-day row
already reflected in the baseline. Current legacy views
retain their prior behavior until review. Ordinary posting and opening-balance changes cannot
bypass a reviewed baseline; later attempts to post before the cutover still require replay.

Ordinary journal edit/delete cannot change linked events or legacy investment buy/sell,
distribution/reinvestment and split entries. Money, lots and units must be corrected together.
Dedicated correction/void/replay is still required; this guard is not a substitute for that workflow.
Development reset deletes links/activity along with the rest of the book in one transaction.

Posting a date before the account's latest activity is refused until replay can recompute later
lot consumption and realized gains. Statement imports sort normalized dates ascending while
retaining same-day source order and original error row numbers. Importing older activity into an
already populated book still needs replay. [Durable investment import origins](import-origins.md)
now replace description signatures for reimports and expose explicit additional-row review.
Reviewed legacy association and representative reimport acceptance remain required.

Quantities and amounts still use Float with existing cent/unit policies. Exact-decimal migration
and full correction/reimport acceptance remain open. Dividends recorded without an existing security
account do not establish a security quantity history.

Tests exercise historical positions after sales/complete disposal, splits and distributions,
legacy/tampered history, description independence, generic edit/delete guards, rollback on
activity insert failure, and reverse-ordered statement imports. Native/encrypted upgrade fixtures
preserve old holdings and leave their history unverified. Packaged investment cases check dated
values after restart and later disposal through the actual preload/main boundary.
