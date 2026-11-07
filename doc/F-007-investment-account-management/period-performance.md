# Period performance and external cash-flow facts

Updated 2026-11-07. External cash-flow reporting is implemented. Dated opening/closing
valuation and the return calculation remain open; the existing total return must not yet
be treated as a complete economic return for a selected historical period.

External cash flows come from journal lines crossing the selected portfolio's user-account
ownership boundary. Account names, descriptions and deposit/withdrawal tags do not define
funding. All cash currencies and archived account history participate. Transfers between
portfolios are a withdrawal from one and a contribution to the other. Transfers within a
portfolio, including currency exchanges, are internal even if incorrectly tagged as deposits.
Trades, distributions, interest and fees remain investment activity rather than contributions.

Tagged cash opening balances are funding, independent of the system account's current name.
New and explicitly updated opening entries post both sides in the user account's native
currency; the system account's default currency remains unchanged. This change does not
automatically rewrite retained legacy entries.

Rows retain journal/line/account IDs, current cash-account name, posting date, native amount,
currency, converted amount and FX source. Base totals use canonical `FxDailyRate` rates at or
before each posting date. A future/latest fallback is unavailable for historical flows. Missing
required FX nulls the affected base deposit or withdrawal total; native facts remain visible.
The report shows native summaries and dated rows alongside base amounts. Converted rows retain
full FX precision, with fractional-cent amounts visible for audit. Base totals round only after
aggregation; ten USD 0.01 contributions at 1.5 therefore total CAD 0.15 rather than CAD 0.20.

Mixed external funding with category lines, in-kind transfers and unclassified system
adjustments require review rather than inferred fee allocation or security valuation. Conflicting
user-line units, inconsistent directions and unbalanced same-currency funding are refused.
Zero-valued retained journals contribute no flow. These checks are not a whole-book verifier.

The remaining period-return work must establish opening value before the inclusive start date,
closing value at the selected end date, complete cash-flow effects and an explicitly documented
return method. It must handle a zero/negative denominator, missing historical prices/FX and
legacy dated holdings without inventing zero returns or using today's value. Income and
realized gains retain their separate posting-date reporting contract.

The packaged cash-flow fixture also provides a concrete remaining return regression: CAD 50
opening funding plus USD 100 contributed at CAD 1.5, then USD 10 withdrawn at CAD 2 and an
internal USD 10 to CAD 15 conversion, leaves CAD 65 and USD 80. Its 3 January closing value is
CAD 225 and its economic gain is CAD 45 after CAD 200 deposits and CAD 20 withdrawals. The
existing valuation path misses the renamed USD settlement account and still uses today's
cutoff. The cash-flow acceptance case verifies the funding table, not that unfinished return.
