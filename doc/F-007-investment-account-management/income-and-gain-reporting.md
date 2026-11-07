# Investment income and ledger gain reporting

Updated 2026-11-07. This addresses investment income/gain currencies and attribution in BL-021.
Period returns, historical opening positions, replay/corrections and whole-book verification
remain separate readiness work.

## Financial facts and attribution

Category journal lines supply income and expense amounts. Sale journal lines supply released
security basis, net cash proceeds and the gain/loss category amount. Account IDs and retained
activity/journal links supply ticker and sale quantity. The holding's explicit binding supplies
the resolved market, including after initial assignment to previously unresolved events.
`recordedMarket` separately retains each event's original market (including null); assignment
does not rewrite event history. Contradictory non-null recorded markets require review in both
reports and dated snapshots. Reports never parse editable
descriptions or infer disposed lots from today's remaining lots. Archived accounts/categories
remain visible in history. Date ranges normalize and include both endpoints; invalid or reversed
ranges fail explicitly.

Every portfolio cash currency participates. A scoped income entry spanning multiple user-account
groups requires attribution review rather than being counted in full for each portfolio. A
whole-book query can still report its known category amount.

Tagged single-category income/fee receipts retain their operation kind when the category is
renamed. Tagged receipts containing several categories use their explicit income/expense
category, preserving gross income separately from withholding. If classification becomes
ambiguous after renaming, the report requires review rather than inventing net income.
Untyped legacy entries use the existing category-name classification; immutable category roles
and legacy classification/review remain provenance work. Unknown holding attribution stays null.

Reinvested income counts the receipt once; its purchase leg and return-of-capital receipts do not
become dividend income. Acquisition/disposal charges already included in basis or net proceeds
are not added again to the standalone fee report.

Sales include zero-gain disposals even when no gain-category line was needed. Retained structured
units, prices, fees, quantity changes and basis/cash amounts must agree with the journal. A legacy
sale can retain known financial facts while its quantity and age remain unavailable. Separate
legacy sale costs remain separate from the ledger gain: `net cash proceeds - released basis +
other category postings = ledger gain`. Ambiguous gain classification requires review. Native
financial amounts are never replaced by quantities or prices guessed from descriptions.

## Currency policy

Each report captures its reporting currency and journal/FX snapshot. The performance income,
interest, fee and gain components share one snapshot. Conversion reads only `FxDailyRate`, using
the latest valid direct/inverse rate on or before each posting date. A future/latest-fallback
rate is unavailable for this historical purpose. Same-currency and known-zero amounts need no
external rate. Converted posting amounts round to the existing cent policy before aggregation;
exact decimal storage/arithmetic remains BL-031.

Responses retain native currency/amounts, native currency totals and conversion source/rate.
Empty gain arrays and scalar interest IPC responses also carry the captured reporting currency,
so the renderer does not label their zero using an initial or stale currency setting.
If any required conversion is unavailable, the combined base total is null; native facts stay
visible. `byTicker` is a compatibility aggregate in reporting currency, while row account IDs and
markets keep same-ticker listings distinct. Unknown attribution is not guessed from a memo.

The converted gain is the native ledger gain translated at disposal-date FX. It is not a
reconstruction of economic profit from acquisition-date base costs. Complete period performance,
including currency valuation changes, still requires the opening/closing values and external
cash-flow work described in BL-021.

## Presentation and holding age

Portfolio cards sum converted gains and show N/A for missing conversions or failed reports.
Dividend and performance income cards retain native currency breakdowns. Holding gain columns
use the holding's native currency. Sale rows show native basis, net cash proceeds, separate
category adjustments and ledger gain alongside the converted gain and its reporting currency.
Unknown legacy quantities show N/A. Calendar dates display without UTC-midnight shifts.

FIFO age uses the retained lot state immediately before the disposal, preserving purchase dates
through splits and basis changes. Consumed lots fall into under-365-day, at-least-365-day or mixed
buckets. Average-cost or unavailable prior lot history stays unknown. These are descriptive age
buckets; current remaining lots are never a substitute for disposal history.

Report-loading responses cannot overwrite another portfolio/date selection. Errors remain
visible with retry, failed gain reports are not described as no activity, and allocation remains
unavailable when the holding currencies cannot be loaded. The shared money formatter preserves
null, undefined and nonfinite values as N/A instead of coercing them to zero.
