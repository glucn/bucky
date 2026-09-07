# Personal-Use Readiness Review

**Review date:** 2026-09-06

**Code baseline:** `7351dbb`

**Status:** Implementation in progress. The findings below describe the review baseline;
the implementation log records subsequent changes and verification.

## Implementation Log

### Batch 2 — Shared E2E database (2026-09-06)

- Schema setup and all direct SQLite fixtures now use `prisma/test.db`, matching the app.
- Added an Electron regression that proves an account seeded by the import fixture is readable
  through the app's IPC. It failed with the original paths and passed after alignment.
- Verification: the database regression and headered CSV import each passed three consecutive
  runs (**6 E2E passes**). The broader pilot and remaining E2E scenarios are still outstanding.
- Vitest and Playwright must run sequentially because they share the disposable test database.

### Batch 1 — Atomic journal mutations and save failures (2026-09-06)

- Added failing regression tests against real SQLite for interrupted posting writes,
  interrupted backfill adjustments, invalid edits, FX edits, and liability borrowing.
- Journal creation and edits now include their opening-balance adjustments and cleanup-rule
  updates in one transaction. Edit inputs are validated before any mutation.
- FX edits persist distinct source/destination amounts, currencies, and the exchange rate.
  Borrowing from a liability now credits the liability and debits the destination.
- Manual and transfer dialogs keep failed saves open, show the returned error, and allow retry.
- Verification: 12 new service regressions and two renderer regressions failed before the fixes;
  the full suite subsequently passed **522 tests across 68 files**. TypeScript checks passed.
- Remaining scope: end-to-end transfer/import/reconciliation coverage and all subsequent
  storage, recovery, security, valuation, verifier, and personal-pilot gates remain open.

## Assessment

Bucky is close to a useful personal pilot, but should not yet be the only bookkeeping record.
Most everyday features exist: account management, CSV import, opening balances and backfill,
placeholder cleanup, categorization rules, liabilities, overview, and basic reporting. The next
milestone should focus on correctness, recoverability, and dependable startup.

This review covers the current implementation, [project plan](project-plan.md),
[backlog](backlog.md), related feature docs, and [accounting research](text-based-accounting-research.md).
Recommendations below do not mark existing backlog items complete or replace their requirements.

## Verification and Limits

- `tsc --noEmit --pretty false` passed.
- `npm test -- --silent` passed: **508 tests across 66 files**.
- All 18 migration SQL files replayed successfully into an empty, in-memory SQLite database.
  This does not establish packaged initialization or safe upgrades of existing personal data.
- Isolated service probes using mocked persistence reproduced the FX-edit and partial-write
  problems described below. These probes did not modify the development database.
- A transpiled import probe reproduced the incorrect production/development branch selection.
- E2E tests and packaged-app tests were not run. The E2E database-path mismatch must be resolved
  before treating the UI suite as readiness evidence.

Passing existing tests does not establish coverage of these findings.

## Findings

### 1. Transaction edits can leave incorrect or unbalanced postings

[`updateJournalEntryLine`](../src/services/database.ts) performs multiple writes without starting
a database transaction when no transaction client is supplied. The normal
[`update-transaction` IPC handler](../src/main/index.ts) calls it without one.

In an isolated failure simulation, editing a $100 transfer to $200 left postings of -$200 and
+$100 when the second posting update failed. The description had already changed as well.

FX edits also ignore the destination amount and exchange-rate inputs submitted by
[`TransferModal`](../src/renderer/components/TransferModal.tsx). A requested
**200 USD -> 270 CAD** became **200 USD -> 200 CAD**, retaining the old rate of 1.35.
The edit service regenerates both amounts using its single-amount path.

Both the transfer dialog and
[`ManualTransactionModal`](../src/renderer/components/ManualTransactionModal.tsx) ignore
`{ success: false }` responses from the edit handler and can close as though the save succeeded.

**Required outcome:** Validate before writing; make each operation atomic, including related
opening-balance adjustments; preserve FX amounts, currencies, and rate semantics; surface failed
saves. Cover rollback and FX-edit behavior with regression tests.

### 2. Investment refresh and valuation use different price stores

[`enrichmentRepository`](../src/services/enrichmentRepository.ts) writes refreshed prices into
`SecurityDailyPrice`, while [`investmentService`](../src/services/investmentService.ts) reads
`SecurityPriceHistory` for position valuation. This is the unresolved **BL-021**.

Historical position valuation also combines historical prices with current quantities and current
cost basis. Selecting an earlier date can therefore produce incorrect holdings values.

**Required outcome:** Use the canonical, market-aware daily-price source throughout valuation,
and derive historical quantities and cost basis as of the requested date. Test canonical prices
with no legacy price rows, following the [source-of-truth guardrails](agent-learnings/source-of-truth-guardrails.md).

### 3. Personal storage and packaged startup are not ready

[`databaseService`](../src/services/database.ts) selects `process.cwd()/prisma/dev.db` in production
as well as development. Initialization connects to the database but does not apply migrations.

[`src/main/index.ts`](../src/main/index.ts) imports `electron-is-dev` as a module namespace and
tests that object as a boolean. The branch selects localhost even when the module's default
export is false. Packaged launch must be repaired and verified independently of the development
server, including renderer and Prisma resource resolution.

**Required outcome:** Separate personal, development, and test storage; provide safe first-run
initialization and upgrades; verify startup and persistence from a packaged app without a
development server or repository working directory.

### 4. Recovery and security remain unfinished

Backup currently consists of [manual file-copy instructions](../README.md#database-backup).
There is no implemented app-level backup and restore workflow in the reviewed code.

The [design](design.md#security--privacy) requires launch locking and database encryption for
MVP readiness. However, F-015's [requirements](F-015-security-gate/requirements.md) and
[design](F-015-security-gate/design.md) contain only headings.

The destructive `reset-all-data` IPC handler is registered unconditionally; only its button is
development-only. Production database logging and the broadly exposed IPC bridge also need
review when implementing the security gate.

**Required outcome:** Specify and implement locking, encryption, and key recovery; guard
destructive operations in the main process; provide consistent backups with a tested restore
path. Restore into a separate profile and verify its contents before relying on recovery.

### 5. E2E fixtures and the application target different databases

The [E2E helper](../tests/e2e/helpers/importFlow.ts) seeds root `test.db`, and `e2e:db:push` prepares
that file. The application selects `prisma/test.db` under the test environment used by the helper.

**Required outcome:** Use one explicit test database path for schema setup, fixture writes,
application access, and assertions. Then run the relevant E2E workflows. Follow the
[stabilization guidance](agent-learnings/e2e-stabilization-learnings.md), including checking port
3000 before running Playwright and obtaining confirmation before killing an occupying process.

## Recommended Work Sequence

| Order | Work | Completion criterion |
| --- | --- | --- |
| 1 | Transaction correctness hardening | Edits, transfers, cleanup, and opening-balance adjustments succeed or roll back together. FX edits preserve both amounts and the rate. Failed saves remain visible. |
| 2 | Personal database and recovery workflow | Separate personal/dev/test storage; safe initialization and upgrades; versioned backups; successful restore into a separate profile with matching balances; packaged launch without a development server. |
| 3 | F-015 and minimal BL-022 onboarding | Locking, encryption, and key recovery are specified and implemented. Base currency is selected explicitly before setup. Destructive operations are guarded in the main process. |
| 4 | BL-021 and historical investment correctness | If investments are in the initial pilot, refreshed prices update holdings and net worth. Market identity is preserved, and historical values use holdings as of the requested date. |
| 5 | BL-032 verification and stronger reconciliation | Begin with read-only checks for journal balance, FX equivalence, opening balances, and position consistency. Compare against statement balances without automatically concealing discrepancies through adjustments. |
| 6 | Representative personal pilot | Import, correct, reimport, reconcile, restart, upgrade, back up, and restore a small set of actual workflows successfully. |

Repair the E2E database-path mismatch as part of the verification work for these steps.
F-015 remains a release blocker under the existing MVP security requirements.

## Backlog Priorities and Deferrals

Move **backup/restore from Phase 2 into the personal-use milestone**. A reliable database backup
should not wait for BL-033's portable ledger export or its decimal and verification dependencies.

**BL-031 exact decimal arithmetic should be prioritized before Bucky becomes the sole record**,
particularly for fractional investments and FX. Define domain precision and rounding policies
early, then stage storage and arithmetic migration. A limited pilot can help establish real
workflows while another record remains authoritative; it does not establish final precision
readiness. A preliminary BL-032 verifier can catch current defects, while its authoritative
precision checks must align with BL-031.

**BL-034 provenance and immutable history should follow closely.** Retaining import origin early
will help diagnose duplicates and corrections. **BL-033** remains valuable for portability after
its precision and verification prerequisites are satisfied.

During the pilot, defer F-016's allocation presentation, advanced charts, scheduled enrichment,
sophisticated rule controls, liability calculators, and App Store distribution. Defer investment
valuation work only if investments are excluded from the pilot.

## Pilot Acceptance Checklist

Use one checking account, one credit card, and, if relevant, one foreign-currency account and
one portfolio. Keep the existing bookkeeping record available throughout validation.

- [ ] Select base currency and establish opening balances at a documented cutover date.
- [ ] Import one month of representative statements and review all skipped or unassigned rows.
- [ ] Correct amounts, categories, dates, and transfers; verify both sides of affected entries.
- [ ] Reimport the same and overlapping statements, including after corrections, with no
      unintended duplicates. Check transfers appearing on statements from both accounts.
- [ ] Match account balances to statements and investigate discrepancies before making adjustments.
- [ ] Confirm reports agree with the underlying transactions, including Unassigned activity.
- [ ] If using investments, verify quantities, cost basis, refreshed prices, FX, and historical values.
- [ ] Restart the packaged app without a development server and confirm data persists.
- [ ] Exercise an upgrade on a copy of the personal database and verify the resulting book.
- [ ] Back up, restore into a separate profile, and verify restored balances and records.
- [ ] Run the relevant E2E workflows against the same isolated database used by their fixtures.

After this small pilot succeeds, expand toward the project plan's criterion: manage finances for
**three months without returning to the old app**. Retaining recovery copies during that period
remains necessary.

The immediate recommended implementation task is **transaction correctness hardening**, followed
by **personal storage and tested recovery**.
