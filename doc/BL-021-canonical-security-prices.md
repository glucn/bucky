# Canonical investment prices and market identity

Updated 2026-11-05. BL-021 remains in progress. The persisted identity and canonical price
services are implemented; existing application valuation, price controls and refresh targeting
still need cutover. This foundation does not establish investment readiness.

`SecurityDailyPrice(ticker, market, marketDate)` is the price source of truth. Market strings
are opaque, case-sensitive provider identities; surrounding whitespace is normalized, and
empty/`UNKNOWN` markets are refused. Ticker-only `SecurityPriceHistory` remains retained legacy
data. It is never read by `securityMarketData` or silently assigned to a market.

`InvestmentProperties.market` is nullable. Migration leaves old holdings unresolved and does
not change ticker, quantity, lots, account currency or journal lines. `bindSecurityMarket`
requires an explicit market, matching account quote currency and the exact expected current
binding. It fills missing quote metadata in the same transaction. Conflicting metadata currency
is refused. An already bound holding with units, lots or journal history cannot be relabeled
to another market; duplicate normalized identities in one portfolio are refused. Initial
assignment to an unresolved holding is explicit, including when it already has history.

The canonical service reads only the exact identity and the latest date at or before the
requested calendar date. A current read excludes future quotes. Missing identity/price never
falls back to another market or the legacy table. Zero prices are valid; negative/non-finite
prices and invalid dates are refused. It does not round quotes to two decimals. Storage still
uses binary floating point; this is not completion of BL-031's exact-decimal work.

Manual/import batches require explicit `fill` or `correct` policy and a manual/import source.
Fill retains existing daily points unchanged. Correction explicitly replaces a point and records
the new source; provider refresh remains insert-missing-only and cannot overwrite it. Batches
validate completely, reject duplicate normalized dates, and commit or roll back together.
`source` defaults to `provider` for existing canonical rows, which the prior application wrote
only through provider ingestion. Legacy manual prices stay in their original table.

Remaining required integration:

- Persist user/provider-selected identity through security setup and position controls. Use
  market-aware or account-ID APIs/routes so identical tickers on different markets cannot merge.
  Existing ticker-only creation/lookup is not sufficient.
- Make position, portfolio, overview and report valuation read the canonical service. Preserve
  currency context, use `FxDailyRate` for FX, and expose missing quotes as unavailable rather
  than silently presenting cost basis as market value.
- Migrate manual price and CSV controls to the canonical service with visible fill/correction
  choice. Offer explicit reviewed promotion of retained legacy prices to a selected market;
  never infer an exchange during schema migration.
- Remove refresh's first-metadata-row/first-search-result market guesses. Preserve each bound
  identity independently. Provider adapters must validate requested market and quote currency;
  the current Yahoo price adapter ignores market and metadata has first-result fallbacks.
  A canonical table alone cannot make those incorrectly targeted quotes trustworthy.
- Historical quantities/basis must reflect the requested date, including purchases, sales,
  reinvestment and splits. Existing current quantities/lots are insufficient after sales;
  user-editable descriptions are not an authoritative quantity ledger. Add structured dated
  investment activity and atomic posting/holding updates. Missing legacy history must be
  explained, not reconstructed from current quantities or guessed descriptions.
- Verify upgrade/recovery of old books, current and historical valuation, same-ticker market
  isolation, manual correction/refresh behavior and packaged controls before closing BL-021.

Service tests cover canonical-only data without legacy rows, conflicting markets/legacy prices,
date boundaries, retained precision/zero values, explicit correction and provider retention,
batch rollback, stale/conflicting bindings, preserved lot history and duplicate identity. Native
and encrypted upgrade fixtures preserve old holdings, both price tables and the encrypted
pre-upgrade snapshot without guessing a market.
