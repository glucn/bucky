# Investment trade posting policy

Updated 2026-11-06. Buy/sell posting is implemented in `investmentTrades.ts`; this does not
establish historical investment readiness or exact-decimal precision.

A buy capitalizes the rounded purchase consideration plus rounded acquisition fee in both
the security account and its FIFO lot. Cash decreases by that same total. The acquisition
fee is not also debited to Investment Expenses. A sale increases cash by rounded gross proceeds
less the rounded disposal fee, releases cost basis, and posts the difference to Realized
Gains/Losses, including a one-cent difference. Its fee is not deducted again from cash or
posted again as a separate expense. Standalone investment fees retain their separate workflow.

Journal creation, position/lot updates and any implicit security creation run inside one
database transaction. Failure at any stage rolls all of them back. Each successful save reads
the position inside that transaction; concurrent saves cannot acknowledge a lost quantity
update. Database contention may reject a save, which must remain a visible failure to retry.

Ticker-only calls are accepted only when one holding matches in the portfolio. Duplicate
tickers require an explicit `securityAccountId`; the selected account must belong to that
portfolio and ticker. Existing holdings use an active trade cash account in their own currency.
Multiple eligible cash accounts require explicit `tradeCashAccountId`. New holdings inherit
the selected cash currency; multi-currency portfolios require a selection rather than silently
creating a USD security. These selectors are service/IPC capabilities; the investment UI still
needs explicit market/account selection throughout its creation and position controls.

Finite quantities, prices, fees, valid normalized dates and representable cent amounts are
required before any writes. FIFO lot quantities must match the stored position. Partial sales
release rounded lot cost and subtract that same cost from the retained lot, conserving its
basis; a final disposal releases the entire residual. Average-cost disposal reads journal basis
inside the same transaction and supports a zero-basis position.

The current storage still uses binary Float, cent-rounded consideration and floating-point
quantities. BL-031 must replace this with a defined exact-decimal policy. Dated structured
investment activity, historical replay/backdated corrections, generic journal edit/delete
coordination and canonical market valuation remain required. Reinvestment/split/return-of-capital
posting is now atomic; see the [distribution policy](distribution-posting-policy.md).
Current lots and descriptions must not be treated as a historical activity
ledger. Older fee postings are retained unchanged: buy entries can be unbalanced, and sale
cash can include a duplicate fee. The read-only whole-book verifier and reviewed corrections
must identify these rather than silently rewrite a user's financial history.

Regression coverage exercises fee/cash/balance outcomes, one-cent gains, real SQLite rollback,
currency selection, ambiguous ticker refusal, zero cost, partial FIFO basis and concurrent
acknowledgement. Packaged acceptance uses actual protected CAD storage and preload IPC, checks
an oversell failure, and verifies cash and lots after restart.
