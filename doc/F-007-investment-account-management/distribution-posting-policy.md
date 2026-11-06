# Investment distributions and splits

Updated 2026-11-06. `investmentDistributions.ts` owns transactional cash dividends, reinvestments,
return of capital and splits. Account selection and lot validation are shared with buys/sells.

An income dividend debits matching-currency trade cash and credits Dividend Income. Reinvestment
records that receipt and the purchase together, adds units and a lot at the full rounded dividend
amount, and leaves cash unchanged. Missing holdings may be created for income reinvestment,
using the selected cash currency. A missing income category or failed purchase/position write
rolls back the receipt and implicit account too.

A cash return of capital credits security basis and debits cash. FIFO lot amounts decrease by
the same total. The API represents a distribution applying equally to every currently held share:
allocation follows lot quantities, independent of acquisition prices. Integer weights derived
from stored quantity decimal representations and deterministic cent remainders conserve the
rounded distribution. An allocation exceeding any lot's basis is refused for explicit excess
classification; it is never concealed by shifting the reduction to another lot. Average-cost
holdings reduce journal basis. Conflicting FIFO lot/journal basis is refused.

A reinvested return of capital first reduces existing basis, then uses that cash to purchase
additional shares. Its two entries, old-lot reductions and new lot commit together. Cash and
total basis are unchanged; neither income nor Opening Balances equity is invented. A holding
must already exist, and the distribution cannot exceed available basis. The legacy boolean
`recordAsIncome: false` now consistently means reinvested return of capital.

These are bookkeeping inputs for a whole-position distribution, not inferred lot-specific tax
events. [IRS Publication 550](https://www.irs.gov/publications/p550) distinguishes distributions
attributable to identified shares from unidentifiable lots. Jurisdiction-specific classification,
lot-specific allocation and excess-distribution treatment require an explicit workflow rather
than an automatic assumption. User-entered return-of-capital classification remains explicit.

A split changes units and per-unit lot prices by the ratio while retaining lot amounts and all
monetary postings. The zero-line split journal and position changes share one transaction.
Invalid dates, non-finite inputs, unrepresentable monetary/quantity results and archived holdings
are refused. Reinvestment retains the current six-decimal unit policy and cent-rounded dividend
amount; exact-decimal storage and domain precision remain BL-031 work.

Old dividend/reinvestment/split records are retained unchanged. In particular, older FIFO return
of capital may leave lots above journal basis, and older reinvested returns may have invented
equity. Read-only verification and reviewed correction must surface these inconsistencies.
Structured dated investment activity, entitlement/as-of holdings, backdated replay and coordinated
edit/delete remain required before claiming historical correctness. Current lots and editable
descriptions are not an authoritative historical ledger.

Tests include real SQLite failures at receipt/purchase/position/split publication, per-share
allocation across differently priced and fractional lots, cent conservation, excess rejection,
average-cost disposal and reverse-split preservation. Packaged acceptance exercises CAD income
reinvestment, cash/reinvested return of capital, split, restart and full disposal through IPC.
