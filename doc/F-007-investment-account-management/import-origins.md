# Investment statement identity and review

Updated 2026-11-06. Investment imports use durable origins rather than journal descriptions,
current quantities or the first journal line. The portfolio page exposes the review wizard.

`InvestmentImportOrigin` retains portfolio/source scope, broker identifier when supplied,
normalized original financial data and description, a version-1 financial fingerprint, effective
date/type/ticker, and the resulting primary journal link. Broker IDs are opaque strings: leading
zeros and case are preserved. Empty IDs use financial matching. The same ID with different
financial data is a conflict, never an automatic replacement or additional posting.

Without an ID, matching uses established currency, normalized date, type, ticker, quantity,
price, gross consideration and commission. Descriptions are retained separately and do not
change identity. Buys/sells and
different commissions remain distinct. Reimported/overlapping rows are checked before activity
date-order validation, so an already imported older trade is skipped rather than posted again.
Origins and journal/activity/holding changes commit in the same per-row transaction; failed
provenance persistence rolls back every effect. Concurrent races cannot commit two origins for
one identity. A failed row remains retryable without duplicating previously committed rows.

An identical no-ID row may represent a duplicate or another legitimate trade. Preview shows
matching rows and skips them by default. Users can explicitly select an additional transaction;
the file review ID and physical row number make that choice stable across retry. Distinct broker
IDs retain otherwise identical trades automatically. Repeated IDs cannot be forced into additional
transactions. Mixed statements may supply IDs for trades and leave cash-row IDs blank.

Review can select an explicit trade cash account. Automatic context uses an existing holding's
currency or a single cash account; ambiguous cash records require selection. Currency is displayed
per row and participates in identity, so equal USD and CAD amounts remain separate. Reusing a
broker ID with a different selected currency is a conflict. Existing identified origins retain
their currency for reimport, even when no new account selection is necessary.

Matching manual activity, legacy holdings with unknown history, or later no-ID statements changing
same-day financial data require review. The UI excludes these rows unless the user explicitly
adds a separate transaction; it does not silently attach provenance to existing manual records.
Conflicting IDs block the UI import. Description-only changes and user corrections to imported
cash entries do not invalidate the original fingerprint. Deleting an ordinary imported cash entry
retains an origin with no journal pointer, preventing an old statement from resurrecting it.
Investment entries still require coordinated correction/replay rather than ordinary journal edits.

CSV parsing uses the existing [Papa Parse library](https://www.papaparse.com/docs), including
quoted delimiters, multiline fields, escaped quotes and parser cursor positions for physical
source row numbers. Headers must be unique; mapped columns must exist. Validation rejects
impossible calendar dates, partial numeric strings, non-finite/unsupported amounts and mismatched
trade consideration before posting any rows. Input is limited to 10 MB and 10000 records.

Amounts are positive consideration/distribution values under the existing CSV contract, with an
explicit gross/net commission policy for trades. Gross consideration must match rounded
quantity × price. Net buy consideration includes commissions; net sales subtract them and may
be negative if commissions exceed proceeds. Commissions are mapped separately, not ignored.
Ticker case is preserved. Chronological posting retains same-day file order and physical source
row numbers. Existing Float/cent policies remain; this is not BL-031 exact-decimal completion.

The preview displays units, price, amount, commission, cash change, broker ID and review status,
with pagination. Partial failures remain visible in the dialog. Retrying keeps the same review
identity; closing refreshes portfolio/account state after the user has seen the outcome. New and
legacy origins are not guessed by migration; native/encrypted upgrade tests verify an empty
origin store with old records preserved. Development reset clears origins with the book.

Remaining work includes reviewed association of manual/legacy entries, explicit restoration of
removed broker-ID records, full revision history, backdated replay/corrections, and ambiguous
market/currency controls in investment setup. Source IDs should be stable and unique in the
portfolio/source scope. Financial matching cannot identify arbitrary changed dates or otherwise
distinguish every broker restatement without those IDs; statement review remains necessary.
Canonical valuation, exact decimals, whole-book verification and representative personal
acceptance remain separate readiness gates.
