# Canonical investment prices and market identity

Updated 2026-11-06. BL-021 remains in progress. The persisted identity and canonical price
services and market-aware refresh targeting are implemented; existing application valuation and
price controls still need cutover. This foundation does not establish investment readiness.

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

Canonical valuation reads now require `priceBasis=raw` and `barStatus=complete`. The additive
policy migration marks retained rows `unknown` for both fields without changing their prices.
Unknown and split-adjusted records remain stored but are excluded from valuation, history,
provider coverage and price freshness. Fill still retains those records; only explicit manual
or import correction can replace them with an attested raw completed close. New writes require
explicit policy. Refresh reports retained unusable records as issues instead of claiming usable
price coverage.

Twelve Data security requests explicitly set `adjust=none`; the documented default is `splits`.
Daily data uses the exchange-local calendar. Both adapters require a valid exchange time zone
and retain only dates earlier than the exchange date when the request began. This deliberately
waits until the next local day, even after market close, and prevents a response crossing midnight
from freezing a partial candle. It does not promise that providers never revise older closes.
Yahoo's [historical Close series](https://finance.yahoo.com/quote/CASK/history/) is split-adjusted;
the adapter labels it `split_adjusted` with its request-date adjustment reference. Such prices
are retained for review and reported as unusable for dated holdings. There is no verified raw
Yahoo conversion in this implementation; choose verified raw manual/import prices or a provider
with an explicit unadjusted contract. Adjusted prices from different retrieval dates must not
be combined as an equivalent raw series.

Manual/import batches require explicit `fill` or `correct` policy and a manual/import source.
Fill retains existing daily points unchanged. Correction explicitly replaces a point and records
the new source; provider refresh remains insert-missing-only and cannot overwrite it. Batches
validate completely, reject duplicate normalized dates, and commit or roll back together.
`source` defaults to `provider` for existing canonical rows, which the prior application wrote
only through provider ingestion. Legacy manual prices stay in their original table.

Refresh now queries each holding's persisted market and account quote currency. Same-ticker
holdings on different markets remain separate. An unresolved holding can discover only one exact
ticker candidate; ambiguity is reported, and discovery never persists a binding. Metadata and
price adapters must verify the requested listing and quote currency. Yahoo daily bars use the
exchange time zone and an inclusive requested calendar range; Twelve Data requests include the
exchange and validate response metadata. These are fixture-tested contracts, not proof of live
provider availability. Invalid batches are refused before writing, and provider batches commit
atomically. Manual/import prices and future points do not advance provider backfill coverage.

Remaining required integration:

- Persist user/provider-selected identity through security setup and position controls. Use
  market-aware or account-ID APIs/routes so identical tickers on different markets cannot merge.
  Existing ticker-only creation/lookup is not sufficient.
- Make position, portfolio, overview and report valuation read the canonical service. Preserve
  currency context, use `FxDailyRate` for FX, and expose missing quotes as unavailable rather
  than silently presenting cost basis as market value.
- Income/gain reports must include every trade cash currency and retain structured identity.
  Current income helpers filter by the first cash account, sum nominal amounts across currencies
  and extract ticker labels from editable descriptions. Current-position posting fixes do not
  establish correctness of those reports.
- Migrate manual price and CSV controls to the canonical service with visible fill/correction
  choice. Offer explicit reviewed promotion of retained legacy prices to a selected market;
  never infer an exchange during schema migration.
- Carry the implemented basis/completion policy into price controls and valuation cutover.
  Offer explicit review/correction for quarantined records. Verified raw Yahoo reconstruction
  remains unsupported; never relabel its historical split-adjusted closes as raw.
  [Twelve Data's time-series contract](https://twelvedata.com/docs/market-data/time-series)
  defines the explicit unadjusted request and exchange-local daily dates used by its adapter.
- Structured [dated activity](F-007-investment-account-management/dated-investment-activity.md)
  now records chronological trades, held-security distributions and splits atomically. Dated
  position reads retain pre-sale/split quantities and basis, with chain/journal verification.
  Backdated replay, reviewed legacy baselines and dedicated corrections remain required.
  Durable import IDs/fingerprints now support reviewed reimports; legacy association/restoration
  still needs its own workflow. Existing current quantities/lots and descriptions are never
  sufficient to reconstruct missing legacy history; that history remains explicitly unavailable.
- Verify upgrade/recovery of old books, current and historical valuation, same-ticker market
  isolation, manual correction/refresh behavior and packaged controls before closing BL-021.

Service tests cover canonical-only data without legacy rows, conflicting markets/legacy prices,
date boundaries, retained precision/zero values, explicit correction and provider retention,
batch rollback, stale/conflicting bindings, preserved lot history and duplicate identity. Native
and encrypted upgrade fixtures preserve old holdings, both price tables and the encrypted
pre-upgrade snapshot without guessing a market.
