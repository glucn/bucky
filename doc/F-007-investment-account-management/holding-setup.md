# Holding setup and transaction selection

Updated 2026-11-07. This closes the market-aware creation gap in BL-021; historical
baselines, reporting, precision and verification remain separate readiness work.

The portfolio's **Add holding** action creates an empty security account with an explicit
ticker, opaque case-sensitive market, quote currency, trade cash account and FIFO or average
cost policy. It creates no journal entry, opening position or inferred lot history. Record
purchases afterward; legacy opening positions still require a reviewed baseline workflow.

Creation validates the selected active cash account's portfolio ownership and currency. It
atomically creates the account, group membership, tracked empty properties and market binding,
including shared quote-currency metadata. A metadata conflict or persistence failure leaves
no orphan account. The same ticker may have multiple resolved markets. An existing unresolved
same-ticker holding must be assigned its market first, and duplicate listing identities are
refused, including archived accounts. An established holding is never relabeled by creation.

Account edits also preserve financial units. A user account's currency cannot change once it
has journal lines, checkpoints, structured investment activity, retained units or lot history,
including malformed legacy lots that need review. A zero current balance is not evidence that
the account is unused. The check and update are atomic, so a refused currency edit also leaves
the proposed name unchanged. Renaming in the same currency and correcting an unused ordinary
account remain supported. An unused bound holding must match its confirmed market quote
currency; missing metadata requires review. Category/system default currencies do not redefine
their multi-currency journal lines. Currency edits require uppercase three-letter codes.

The old service-only ticker creation helper remains compatible for a portfolio with one active
trade cash account, derives that account's currency and creates an unresolved holding atomically.
It refuses ambiguous cash or any existing same-ticker holding. Ticker-only lookup refuses multiple
listings. The renderer's new creation channel requires an explicit market and cost policy;
legacy implicit creation is not exposed by the new form.

Transaction entry selects holdings by account ID and labels ticker, market and native currency.
It submits that ID and a matching trade cash account for buys, sales, cash dividends and
reinvestments. A position action preselects its exact account; a ticker-only initial selection
is accepted only when unique. Cash-only interest and fees select their cash account explicitly
when several are present. No selector depends on the first matching ticker or first cash account.
Archived accounts are excluded from the forms, with service ownership/currency checks repeated
at posting time. Service-only legacy callers may omit cash selection when exactly one is eligible.

Fees and interest share a transactional posting helper with statement imports. It normalizes
dates, refuses nonfinite/nonpositive/subcent amounts, uses the selected cash currency on both
journal lines and requires an active category. Imported cash events retain atomic posting and
origin creation in their existing outer transaction.

The creation dialog loads lazily and guards late account responses. It preserves failed setup
for correction and derives the displayed quote currency from cash selection. Market entry is
manual; existing **Market & prices** controls provide optional provider discovery and reviewed
closing prices. No lookup result automatically creates or binds a holding.

Statement import still refuses multiple same-ticker holdings rather than guessing a listing.
Explicit statement/row holding selection remains required for those imports; selected cash
currency alone is not currently a listing selector.

TDD regressions cover orphan rollback, actual cash currency, ticker ambiguity, independent
same-ticker trades, metadata conflicts, cash ownership/archival, malformed cash events, strict
new-creation inputs and real registered IPC forwarding. Renderer tests cover explicit cost
selection, opaque identity, retained errors and selected holding/cash payloads. Packaged acceptance
creates two same-ticker listings through the form and records purchases, a sale, a dividend,
a fee and interest in their selected currencies before verifying both holdings and cash after restart.
