# Portfolio identity and settlement cash

Updated 2026-11-14. Portfolio identity is explicit metadata, independent of account and group
names. New portfolio creation stores `AccountGroup.isInvestmentPortfolio` together with its
initial cash account and membership in one transaction. Failed cash creation leaves no group.
Additional-currency cash creation is also atomic and refuses existing same-currency cash,
including archived accounts, rather than creating a duplicate after a rename.

The migration marks existing user groups only when structured user/asset holding properties
establish investment intent. It does not guess from `Trade Cash` names. Native and encrypted
upgrade tests preserve account/position/price facts and an unchanged pre-upgrade snapshot.

Legacy cash-only groups remain available through **Use an existing account group as a portfolio**
on Investments. The user selects a group, reviews every account and currency, and confirms its
cash scope. Only user asset groups without holdings qualify for this review. Confirmation checks
the displayed membership IDs against the current transaction snapshot and changes only the marker;
it does not rewrite balances, journals, prices, quantities or currencies. Refusal stays visible.
Ordinary bank groups remain outside portfolio discovery unless explicitly confirmed.

Within an identified portfolio, settlement cash is a user asset account without investment
properties. Names remain editable display data. New setup/posting requires active cash; history
listing retains archived cash. Existing holding properties also establish portfolio identity for
legacy/imported records. Setup, trades, distributions, cash-only events and statement selection
require this identity before treating a group as a posting portfolio.

The shared predicate serves holding setup, trade/distribution settlement and imports. Cash lookup
by currency refuses multiple eligible matches; account-ID selection remains required when
ambiguous. The legacy `tradeCash` response field remains a compatibility alias; consumers should
use `tradeCashAccounts` and explicit IDs. [Portfolio funding](portfolio-funding.md) now selects
cash explicitly, preserves both FX amounts and posts/tag journals atomically. The compatibility
alias no longer determines a funding destination.

The portfolio review channel uses the ordinary authenticated IPC inventory. The optional review
component loads lazily, and obsolete portfolio-list/value reads cannot overwrite newer results.
