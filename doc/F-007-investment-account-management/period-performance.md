# Period performance and external cash-flow facts

Updated 2026-11-13. External cash-flow reporting and dated period returns are implemented
for holdings with complete activity history. Legacy baselines and correction/replay remain
separate readiness work.

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

Opening value is the close before the inclusive start date; closing value is the selected end
date's close. Both include all owned cash accounts and dated security quantities/basis, including
renamed and archived accounts. Historical valuation uses canonical raw complete prices and
canonical FX at or before the required date, never future/latest fallback FX. The compatibility
field `currentValue` now means closing value for this report. Positions and allocation use the
same selected end date. Unrealized gains are explicitly an end-of-period level; income and
realized gains retain their separate posting-date reporting contract.

Economic period gain is closing value minus opening value minus net external flows, retaining
unrounded converted flows until the final cent rounding. The percentage uses time-weighted
returns: incoming capital is available at the start of its posting day and outgoing capital
leaves at the end. Each funding day's factor is `(closing value + withdrawals) /
(previous close + contributions)`; factors compound geometrically. Intervals without flows use
their endpoint ratio. This date-only convention follows the
[Portfolio Performance method](https://help.portfolio-performance.info/en/concepts/performance/time-weighted/);
it does not claim intraday accuracy. Only period endpoints, flow days and their preceding closes
require valuation, so long idle periods do not require daily database reads.

Missing endpoint values or required flow FX leave economic gain unavailable. A missing
intermediate valuation can leave endpoint gain known while the percentage remains unavailable.
No invested capital and nonpositive capital denominators produce an explained unavailable
percentage, not zero. Complete capital loss yields -100%; withdrawing all capital without loss
yields 0%. Nonfinite valuations are unavailable. Cash checkpoints disagreeing with journal
balances cannot substitute unexplained funding or profit; the return remains unavailable.
This guard does not replace whole-book verification or establish global checkpoint semantics.
Incomplete legacy activity remains unavailable without inventing historical quantities.

The service and packaged cash-flow fixtures cover this concrete regression: CAD 50
opening funding plus USD 100 contributed at CAD 1.5, then USD 10 withdrawn at CAD 2 and an
internal USD 10 to CAD 15 conversion, leaves CAD 65 and USD 80. Its 3 January closing value is
CAD 225 and its economic gain is CAD 45 after CAD 200 deposits and CAD 20 withdrawals. The
time-weighted return is 22.5%. A second fixture holds ten CAD shares, opening at 10 and closing
at 12; a later price of 99 and later sale must not change the selected period's CAD 100 opening,
CAD 120 close, CAD 20 gain, 20% return or CAD 120 allocation.
