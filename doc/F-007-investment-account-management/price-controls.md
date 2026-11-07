# Reviewed market and closing-price controls

Updated 2026-11-07. Existing holdings expose **Market & prices** from their account-ID position
page. Assignment is explicit, whether the user types the exact source market or chooses a
provider search result. Discovery filters by exact ticker and compatible supplied currency;
missing currency is labelled for manual verification. Discovery never assigns a listing.
The existing binding service preserves quantity, lots, journals and account currency and
refuses stale/conflicting or established-market relabelling.

Price controls use the holding's persisted ticker/market and native currency. Quotes are shared
by all holdings of that identity, including other portfolios; the dialog explains that scope.
Known metadata/account currency conflicts refuse changes. This does not create a second listing
for a ticker already held: market-aware security creation remains separate work.

Manual entry, `Date,Price` CSV and selected legacy records use an explicit **fill** or **correct**
policy. Preview shows proposed and existing values, existing adjustment/completion status and
each effect. A raw completed-close confirmation names the ticker, market and currency. A new
preview resets that confirmation; changing inputs invalidates it. Zero and quote precision are
retained. Future book dates, non-finite/negative values, malformed/duplicate dates and invalid
CSV batches are refused before any write. CSV permits 1–10000 records and at most 10 MB, with
plain numbers and supported calendar-date formats. Error numbers refer to parsed price records.

Save checks the persisted market, proposed date/value and destination record version again in
one transaction. The version covers identity, value, source, adjustment basis, status and write
time. Another correction, a newly filled date or changed legacy source makes review stale;
save refuses the whole batch. A later SQLite failure also rolls back every point. The canonical
writer accepts the enclosing transaction, so review guards and writes cannot separate. Fill
retains existing quarantined points and reports that effect; correction explicitly establishes
verified raw/completed status. Provider refresh cannot overwrite these points.

Legacy promotion requires selected IDs for this ticker and the same explicit market/currency/
raw-close review. Originals remain unchanged. Legacy dates are normalized for ordering/filtering
in memory, preserving their original strings. Invalid dates remain visible for review but cannot
be promoted; verified manual entry can establish a correct dated point independently. No exchange,
currency or adjustment basis is inferred from a legacy ticker or price.

Stored-history responses show up to 200 points per source; an earlier history-through date exposes
older points. Preview paginates batches in groups of 100. Canonical basis/status and retained
legacy origins are visible. Legacy normalization currently reads that ticker's retained series
before returning its bounded review window. Very large legacy series may need indexed review
metadata in a later migration.

An unreliable raw quote can be **excluded from valuation**. Exclusion checks its current version
and market in a transaction, preserves the value and numeric source, and changes its completion
status to unknown. It cannot advance provider coverage or be silently refilled. A reviewed
correction restores eligibility. Exclusion is reversible and does not delete the original point;
the broader immutable revision/audit requirement remains open.

The modal loads lazily. Failed saves remain visible; closing a successful review refreshes the
position and account state. Stale asynchronous responses cannot populate another holding's dialog.
The six new IPC channels use the explicit inventory and ordinary authenticated data boundary,
including packaged locked-state denial. They are not recovery/security bypass channels.

Tests cover canonical writes with conflicting retained legacy data, stale destination/source
review, raw confirmation, currency conflicts, atomic rollback, exact listing discovery, legacy
date filtering, exclusion/restoration and UI confirmation/error behavior. Packaged acceptance
exercises assignment, quarantine retention/correction, CSV, legacy promotion, a competing
correction, exclusion, restart persistence and unchanged legacy records.

Market-aware creation is documented in [holding setup](holding-setup.md). Remaining gates include
historical baseline/correction/replay workflows, complete performance/income/gain reporting, verified raw
Yahoo support, exact decimals, whole-book verification and representative personal acceptance.
