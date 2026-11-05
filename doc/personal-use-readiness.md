# Personal-Use Readiness Review

**Review date:** 2026-09-06

**Code baseline:** `7351dbb`

**Status:** Implementation in progress. The findings below describe the review baseline;
the implementation log records subsequent changes and verification.

## Implementation Log

### Batch 23 — Fresh isolated E2E execution and onboarding/reset acceptance (2026-11-04)

- Added one validated development origin shared by runtime sender checks, Forge, Webpack and
  test navigation. The suite owns its server instead of reusing an unrelated listener.
  Preparation requires an executed fresh-launch marker and complete bundles, rejects quoted
  source diagnostics, and uses separate temporary ports so it cannot satisfy final-server readiness.
  Owned preparation processes are drained; port 3000's existing process remained untouched.
- Replaced private handler-map calls/fabricated events in liability/opening-balance tests with
  actual preload IPC. Repeated execution exposed a liability fixture choosing a CAD asset for
  an ordinary USD payment and ignoring the rejected posting. It now owns its USD source account
  and verifies the posting result before asserting transaction history. Production checks were
  retained throughout.
- Added real development reset acceptance: factory reset leaves no accounts, groups or settings
  before currency selection, including after restart; selecting CAD seeds CAD defaults; data reset
  retains CAD and clears book-derived reconciliation state. BL-022's implemented setup/reset
  policy now has complete automated development acceptance, alongside prior packaged checks.
- **All 25 development/browser E2E cases passed three repetitions (75 checks)**. The **13 focused
  configuration/preparation tests**, TypeScript and Apple Silicon packaging passed. All **nine
  packaged acceptance cases** passed with an intentionally invalid development-server override,
  confirming installed startup and sender checks still use the trusted file origin.
  Representative personal pilot, native security
  acceptance, canonical investment valuation, exact decimals and read-only verification remain open.

### Batch 22 — Enforce explicit currency setup before financial workflows (2026-11-04)

- Added a main-enforced setup gate for authenticated recovered and development books with
  missing/invalid currency. Financial IPC, providers, and views stay unavailable until explicit
  supported selection. The setting read/completion still require personal authentication.
  Startup no longer seeds USD defaults; empty-book selection and seeding commit together.
- Existing currencies and postings remain unchanged; legacy records receive pending valuation
  review. Competing setup is refused. Failed seeding rolls selection back. Lock rechecks its
  epoch after the asynchronous currency check before starting financial work, and late UI results
  are ignored after unmount. Recreated opening-balance system accounts honor selected currency.
- Initial failing service/main/renderer regressions drove implementation, including a generic
  settings validation bypass for non-string base currency. **818 tests across 104 files passed
  in each native and encrypted storage mode**, plus TypeScript and Apple Silicon packaging. Packaged cases verified missing and invalid
  currency, IPC denial, explicit selection, unchanged CAD posting balance with EUR selected,
  pending review and restart. All nine packaged cases passed three repetitions (**27 checks**),
  and the setup screen was visually inspected.
- Development fixtures now explicitly configure USD through the real setup form; browser-only
  fixtures declare mocked setup/authentication. Their E2E rerun still needs an isolated server;
  the existing process on port 3000 was left untouched. See the [setup/reset policy](BL-022-onboarding-reset-policy.md).

### Batch 21 — Explicit development reset modes (2026-11-04)

- Replaced the reset boolean/implicit default with validated data and factory modes across
  service, IPC and development controls. Data reset requires a supported configured currency,
  retains it, clears book-derived reconciliation/enrichment settings, and reseeds in that currency.
  Factory reset clears settings and leaves accounts/groups empty for explicit setup.
- Both modes remain prohibited for personal storage at the service boundary and for packaged
  IPC independently of environment flags. Invalid/ambiguous requests fail before deletion;
  reseed failure rolls back records and settings together. Test helpers explicitly distinguish
  fixture seeding from product factory reset.
- Ten reset regressions failed against the previous implementation. Added IPC and renderer
  coverage for explicit mode selection, confirmation cancellation, errors and service rejection.
  **799 tests across 101 files passed in each native and encrypted storage mode**, plus
  TypeScript and Apple Silicon packaging. All seven packaged acceptance cases passed, including
  actual packaged rejection of development reset before any data could be changed.
- [Reset policy](BL-022-onboarding-reset-policy.md) defines retained setup context and cleared
  derived state. The broader onboarding gate for recovered/development books with absent or
  invalid currency is still required; BL-022 is not complete.

### Batch 20 — Main-owned credential changes and saved-code fallback (2026-11-04)

- Connected durable credential replacement to locked-only IPC and a dedicated form. Current
  passphrase, fresh OS challenge, or saved recovery code must authenticate before replacement.
  A saved code establishes ordinary protection; financial storage stays closed until separate
  unlock. Other configured wraps and recovery remain intact; retained copies keep old credentials.
- Main serializes the change, drains setup/recovery, shares the unlock cooldown, and cancels/drains
  on lock. Native consent is required before preserving an authenticated interrupted credential
  lock and retrying. Late consent cannot move files after revocation; a completed atomic publication
  survives a subsequent lock. Responses expose no keys or filesystem paths.
- Added eight main and four renderer tests through failing regressions. Review also fixed
  passphrase-only profiles defaulting to unavailable keychain protection on OS-capable machines.
  Navigation and success/failure clear form secrets without automatically mounting financial views.
- **783 tests across 98 files passed in each native and encrypted storage mode**. TypeScript and Apple Silicon packaging
  passed. All seven packaged cases passed three repetitions (**21 checks**), including actual
  passphrase replacement, old-passphrase rejection, restart/unlock, original saved-code fallback,
  and another restart. The credential-change screen was visually inspected.
- Real Touch ID/keychain, native preservation dialogs, power-loss and representative personal
  recovery remain acceptance gates. Onboarding/reset policy, valuation, exact decimals, read-only
  verification and representative pilot work remain open.

### Batch 19 — Atomic credential persistence and retained lock recovery (2026-11-04)

- Added verified atomic passphrase/OS-keychain wrap replacement without changing the data key,
  encrypted book, alternate wrap, or saved recovery code. Expected-envelope checks prevent stale
  writes, and the staged replacement must independently recover the key before publication.
- Cancellation/write failure before rename retains old credentials. Late cancellation and
  post-publication durability/cleanup failures preserve the new envelope. Known stale locks can
  be retained by rename after current-key verification; main must own the session and obtain
  native consent before using that recovery primitive. Old copies keep their old credentials.
- Added 19 service tests, with initial failing persistence regressions. Focused credential and
  interrupted-artifact checks passed (**39 tests**) plus TypeScript checking. App lifecycle/UI
  integration and the full suites remain next; this service batch does not complete F-015.
- See [credential persistence contract](F-015-security-gate/credential-changes.md).

### Batch 18 — Interrupted recovery controls and exclusive setup preservation (2026-11-04)

- Connected artifact inventory and authenticated interrupted/preserved snapshots to dedicated
  main-owned IPC and recovery UI. Source credentials and snapshot-limit acknowledgement precede
  fresh protection/recovery confirmation. Publishing does not select or switch the running book.
- Added exclusive security maintenance for reviewed unpublished setup preservation. Recovery/setup
  drain before native consent; financial/setup/unlock/recovery work is denied while maintenance
  owns the session. Lock cancels remaining moves and waits for the operation. Late inventory and
  confirmation responses cannot prompt or move files after revocation. The view stays mounted
  during maintenance, refreshes inventory, and offers explicit fresh setup after preservation.
- Ten new regressions failed before implementation/fixes. Review also exposed that a partially
  entered launch passphrase survived a round-trip through recovery; navigation now clears it.
- **752 tests across 96 files passed in each storage mode**, plus TypeScript checking and an Apple
  Silicon build. All six packaged cases passed three repetitions (**18 checks**). The new recovery case verifies actual app authentication,
  new-code confirmation, publication, restart/unlock, and restored posting balance. The fixture
  selects the target using the trusted service; native selection consent is not substituted into
  production code or claimed as tested. The recovered snapshot screen was visually inspected.
- Native preservation/selection dialogs, real OS authentication/keychain, actual crash/power-loss
  and representative personal recovery still require acceptance. Durable credential changes,
  remaining onboarding/reset policy, valuation, precision, verifier and pilot gates remain open.

### Batch 17 — Authenticated interrupted snapshots and retained setup retry (2026-11-04)

- Added metadata-only inventory of recognized interrupted setup/restore/temp/lock artifacts and
  authenticated encrypted snapshots from viable staging. No database driver opens the original
  files. Read-only no-follow copies preserve WAL/rollback journals, reject changing sources, and
  validate records before exposing a consolidated encrypted snapshot. Partial initial seeding is refused.
- Reused recovery-confirmed publication with fresh identity/credentials/recovery code and explicit
  acknowledgement that an interrupted snapshot does not prove its original operation completed.
  Original staged files and existing books remain intact and are never selected automatically.
- Added preservation-by-rename of reviewed unpublished default-setup artifacts, allowing first-run
  retry without deletion. Preserved viable setups remain recoverable. Existing books, changed lists,
  links, and unreviewed names are refused; partial moves retain every file for refresh/retry.
- Added 22 tests, including failing inventory/snapshot/publication/preservation regressions.
  **742 tests across 96 files passed in each storage mode**, plus TypeScript checking. A synthetic
  Electron check passed WAL recovery, new-code confirmation, encrypted reopen, retained source/archive,
  and explicit selection.
- See [interrupted recovery contract and limits](F-015-security-gate/interrupted-recovery.md).
  Main/IPC/UI integration, exclusive maintenance ownership, native confirmation, lock cancellation,
  and installed/manual acceptance remain required. This service batch does not complete F-015.

### Batch 16 — Main-owned legacy conversion and recovery UI (2026-11-04)

- Connected legacy conversion to the protected recovery owner, typed IPC/preload, native source
  picker, and locked/setup/recovery-required and unlocked recovery views. Main validates explicit
  plaintext-retention acknowledgement and replacement credentials before work; renderer-supplied
  paths are refused. Keychain mode requires a fresh OS challenge. Late picker results are revoked
  by lock, and conversion shares recovery cancellation/drainage before setup or unlock.
- Added three main regressions and a UI regression, all failing before implementation. They cover
  actual conversion/confirmation from recovery-required state, preserved originals and selection,
  acknowledgement, rejected paths, denied OS protection, late picker cancellation, and cleared
  replacement credentials. The installed navigation regression failed against the previous build.
- **720 tests across 95 files passed in each storage mode**, plus TypeScript checking and a rebuilt
  Apple Silicon app. All five packaged cases passed three repetitions (**15 checks**), including
  conversion navigation/acknowledgement; the conversion screen was visually inspected.
- The packaged conversion case checks navigation, acknowledgement and source preservation before
  opening a picker; it does not execute a full native-picker conversion/selection/restart drill.
  Installed/native-dialog, real OS/keychain and representative personal-data acceptance remain
  required. F-015 and the broader readiness goal remain open.

### Batch 15 — Verified legacy conversion and confirmed publication (2026-11-03)

- Added read-only snapshot conversion directly from plaintext SQLite into encrypted staging,
  without a new plaintext financial working file. Copying preserves exact stored integers,
  rowids, text bytes, blobs, double values, and migration records. The shared recovery validator
  compares all records, relationships, and posting balances before commit and after encrypted reopen.
- Extended the existing restore controller with acknowledged legacy conversion. It generates
  fresh profile/data-key identities and requires new recovery-code re-entry before publication.
  Selection remains separate; existing plaintext files and profiles are never replaced or deleted.
- Added 13 tests, including failing conversion/publication regressions, source WAL concurrency,
  disk-full/mid-copy failure, cancellation/retry, and exact-value preservation. **716 tests across
  95 files passed in each storage mode**, plus TypeScript checking. A synthetic Electron Node
  check passed conversion, confirmation, encrypted reopen, portable recovery, and explicit selection.
- See [conversion contract and limits](F-015-security-gate/legacy-conversion.md). Main-owned
  source picking, authentication/acknowledgement UI, lock cancellation, installed conversion,
  interrupted-profile handling, and real/personal recovery acceptance remain open. SEC-06 is
  not complete; this controller is not yet connected to app IPC/UI.

### Batch 14 — Protected recovery screens and packaged navigation (2026-11-03)

- Added encrypted recovery from locked, setup, and recovery-required screens without mounting
  financial views. Unlocked Settings exposes encrypted export, independent restore, new recovery-code
  confirmation, authenticated next-launch selection, verified summaries, and cancellation.
  Inputs are cleared after each attempt; failed confirmation remains retryable and leaving the
  view drains recovery. No restored profile is selected automatically.
- Three UI regressions and the locked navigation regression failed before implementation. A new
  packaged case failed against the old build, then passed three repetitions on the new build.
- **703 tests across 94 files passed in each storage mode**, plus TypeScript checking and an
  Apple Silicon package build using Node 22. All four packaged cases passed three repetitions
  (**12 checks**): startup/relock/persistence, plaintext preservation, shipped encrypted dependencies,
  and locked/unlocked recovery navigation. The recovery screen was visually inspected.
- These packaged tests cover navigation and access boundaries, not the complete native-picker
  export/restore/selection flow. Real OS/keychain, native-dialog, independent-device and personal
  recovery drills remain required. Legacy conversion, interrupted-profile handling, durable
  credential changes, valuation, precision, verifier, and representative pilot gates remain open.

### Batch 13 — Main-owned protected recovery lifecycle (2026-11-03)

- Connected encrypted export, locked-state restore, fresh recovery confirmation, and explicit
  next-launch selection to a dedicated typed IPC surface. Main owns file pickers, fresh OS or
  passphrase authentication, replacement credential validation, and native selection consent.
- Lock revokes delayed authentication/dialog responses and drains recovery before another
  setup or unlock. Recovery credentials and data keys stay out of response metadata; only
  the dedicated pending-recovery response exposes its newly generated recovery code.
- A failing relock regression exposed that next-launch selection was reread during lock.
  The running profile is now fixed for the process lifetime; selection applies after restart.
- Ten new regressions cover actual encrypted export/restore, authentication failure, native
  cancellation, delayed results, input validation, lock drainage, and next-launch semantics.
  **699 tests across 93 files passed** with native service storage; TypeScript checking passed.
- Recovery UI, packaged recovery flows, real OS authentication, and manual recovery acceptance
  remain outstanding. This batch does not complete F-015 or personal-use readiness.

### Batch 12 — Recovery-confirmed separate-profile publication (2026-09-28)

- Added a trusted-process restore controller that verifies an authenticated backup, binds its
  recovered data key to a distinct profile identity and explicitly chosen replacement credentials,
  and requires re-entry of a fresh recovery code before publication. The source backup and
  existing book are preserved; the restored records and posting balances are rechecked against
  the authenticated preview before publishing.
- Added verified, explicit next-launch selection, including return to the original profile.
  No running connection is switched. Pending recovery expires, cancellation drains active work,
  and cleanup failures retain ownership and block new restores until cleanup can be retried.
  Late cancellation after publication and failed final sync preserve the published profile.
- Added 18 tests. Three additional cancellation/cleanup regressions failed before their fixes.
  Reverified on 2026-11-03: **689 tests across 91 files passed in each storage mode**;
  TypeScript checking passed.
  The representative service fixture restores the backup's postings while preserving later
  balance edits in the original book. A synthetic Electron Node 18.18.2 check passed independent
  restore into another application-data directory, fresh recovery confirmation, replacement
  passphrase unlock, explicit selection, and encrypted Prisma reopen.
- See [the restore contract and limits](F-015-security-gate/protected-profile-restore.md).
  Rebinding does not rotate the database key or revoke old copies. Application IPC/UI integration,
  main-owned OS authentication and lock cancellation, native confirmation, and installed/manual
  recovery drills remain next. The app's encrypted-profile recovery controls are still disabled;
  SEC-05 and the wider readiness goal are not complete.

### Batch 11 — Authenticated portable backup files and verified staging (2026-09-23)

- Added a trusted-process export service that snapshots encrypted live storage, validates the
  book, wraps the snapshot and record manifest in authenticated encryption, verifies the saved
  artifact, and publishes without overwriting existing files. Machine-bound keychain metadata
  is excluded; no plaintext financial working database or manifest is written to disk.
- Added independent recovery by saved recovery code or configured passphrase. The callback gets
  an encrypted stage only after authentication, schema/history/reference checks, and matching
  record counts/digests and balances. Cleanup clears the temporary key and stage; no profile is
  published or selected. Legacy and protected recovery now share their validation rules.
- Added 23 tests covering WAL data, both credentials, tampering and format limits, incorrect
  authenticated manifests, invalid books, overwrite/symlink refusal, cancellation, write failure,
  and uncertain durability after publication. **671 tests across 90 files passed in each storage
  mode**, plus TypeScript checking. A synthetic Electron Node 18.18.2 check passed export,
  recovery with both credentials, and tamper rejection.
- See the [artifact format and integration contract](F-015-security-gate/protected-backup-artifacts.md).
  This is not yet an app-level backup/restore flow: main-owned credential rebinding, recovery
  confirmation, separate-profile publication/selection, native dialogs, lock-aware cancellation,
  and installed recovery tests are next. Real cross-device recovery, legacy conversion, and all
  other readiness gates remain open. The encrypted-profile backup controls remain disabled.

### Batch 10 — Authenticated setup, launch, and relock (2026-09-23)

- Connected the protected setup view to main-owned authentication. New packaged books require
  explicit base currency, repeated credentials, and recovery-code re-entry before creation.
  They stay locked until a separate successful passphrase or OS-authentication challenge.
- All financial IPC requires an unlocked session; startup does not open or seed the personal
  database. Explicit lock, window close, and OS lock/suspend/session-deactivation events revoke
  access. Lock destroys the renderer and its memory-only storage partition and drains pending
  work before allowing another unlock. Enrichment cancellation/late-result suppression was
  committed separately in `6a786da`.
- Existing plaintext or incomplete profiles fail closed and are preserved. The earlier raw-SQLite
  backup/restore UI is disabled for encrypted profiles; no plaintext fallback is offered.
- The packaged test exposed a timezone bug after moving east of UTC: calendar-date validation
  compared local midnight with a UTC date. Four timezone regressions failed before the fix;
  calendar inputs now validate independently of local timezone and reject invalid-day rollover.
- **648 tests across 89 files passed in each storage mode**, plus TypeScript checking and an
  Apple Silicon package build. Three repetitions of all packaged cases passed (**nine checks**),
  including real passphrase setup, wrong credentials, persistence/relock/restart, plaintext
  preservation, and shipped encrypted-runtime assets. Setup and locked screens were inspected.
- Ten additional packaged setup/unlock/relock repetitions passed. An earlier isolated assertion
  failure between recovery confirmation and the unlock view did not recur in these thirteen
  successful workflow runs; its cause is not established. The harness now retains renderer
  lifecycle/state diagnostics on failure rather than assuming it is a product or timing bug.
  Development database-isolation and headered-import tests each passed three repetitions
  (**six E2E passes**).
- Real Touch ID/keychain and OS-session events require manual acceptance; automated OS tests
  substitute those APIs. No real personal profile was used. See
  [authenticated launch and remaining limits](F-015-security-gate/authenticated-launch.md).
- F-015 remains open. Next: authenticated encrypted backup/restore, verified legacy conversion,
  interrupted-profile recovery, durable credential changes, and the remaining onboarding/reset
  policy. Valuation, the verifier, precision work, and the representative personal pilot remain.

### Batch 9 — Recovery-confirmed protected profile provisioning (2026-09-09)

- Added a main-owned setup controller that requires explicit base currency and successful
  recovery-code re-entry before writing a book or key envelope. Pending keys expire and are
  cleared on cancellation/failure; unavailable requested keychain protection does not fall back.
- Creates and verifies the encrypted book and durable envelope in private staging, then publishes
  them together. Defaults use the selected currency. Existing/legacy/partial profiles and stale
  setup artifacts are refused; competing publishers cannot replace the winner. Failures after
  publication preserve the profile and report the uncertain durability instead of deleting it.
- Added 17 provisioning/failure tests. **629 tests across 84 files passed in each storage mode**,
  plus TypeScript checks. A synthetic Electron Node 18.18.2 setup recovered its persisted envelope
  and reopened the encrypted EUR book. No real OS keychain or personal profile was used.
- See [protected setup's contract and limits](F-015-security-gate/protected-profile-setup.md).
  This controller is not yet connected to app startup or a setup view. Authenticated launch,
  lock/relock, protected backup/restore, legacy conversion, and the remaining BL-022 work are open.

### Batch 8 — Encrypted service storage and revocable Prisma sessions (2026-09-08)

- Integrated the pinned encrypted libSQL adapter into the actual database service. Native and
  encrypted storage share migration-history validation, atomic upgrades, rollback, and snapshot
  reservation. Encrypted pre-upgrade snapshots remain encrypted; plaintext conversion is refused.
- Services retain a revocable Prisma facade. Closing blocks new work, deferred queries, retained
  transaction clients, and pending result/error delivery. Failed unlock cannot fall back to a
  plaintext book, and close-during-unlock cannot publish a new session.
- The same **612 tests across 83 files passed in each storage mode**, including actual encrypted
  service postings/reopen, batch rollback, in-flight write rollback, and migration failure cases.
  TypeScript checks and all nine checks in the original compatibility probe passed.
- The final Apple Silicon package passed **six repeated checks**: three real startup/recovery
  runs and three encrypted-runtime checks using shipped ASAR dependencies without checkout
  fallback. The latter verifies packaged native assets, not an authenticated installed workflow.
- Development database-isolation and headered CSV-import workflows each passed three repetitions
  (**six E2E passes**) through the session facade.
- Added [the storage integration contract and reproducible checks](F-015-security-gate/encrypted-service-integration.md).
  Personal-app startup and its backup/recovery UI still use plaintext storage. Protected setup,
  authenticated unlocking/relocking, encrypted portable backups, and legacy conversion remain
  release blockers; this batch does not enable F-015 or establish sole-record readiness.

### Batch 7 — Authenticated key wrapping and independent recovery (2026-09-08)

- Added a trusted-process key-envelope library: random per-profile data keys, AES-256-GCM wraps,
  fixed-cost scrypt passphrase support, independent recovery, passphrase replacement, and binding
  a recovered key to a new machine's keychain.
- Strict parsing, authenticated profile/purpose metadata, generic credential-failure errors, and
  a single-concurrent-KDF limit prevent malformed inputs from changing crypto work parameters
  or returning partial keys. Requested keychain failure never silently falls back.
- Added a macOS Electron keychain adapter with unavailable/unsupported-platform guards. Real OS
  APIs are substituted in unit tests; an Electron Node 18.18.2 check verified the crypto runtime
  with synthetic passphrase/recovery credentials and tampering.
- **596 tests across 80 files** and TypeScript checks passed. See the
  [key-envelope format and limitations](F-015-security-gate/key-envelopes.md).
- This is security foundation code, not enabled personal encryption. Protected setup/confirmation,
  atomic key persistence, real OS authentication, encrypted backup files, storage integration,
  and the lock lifecycle remain open.

### Batch 6 — Encrypted SQLite/Prisma compatibility proof (2026-09-08)

- Added an isolated, lockfile-pinned libSQL/Prisma probe without changing application dependencies,
  production schema, generated client, or personal storage.
- Nine checks passed on Node 26.8.1, Node 22.23.2, and Electron's embedded Node 18.18.2: all bundled
  migrations, Prisma relations/types, native timestamp compatibility, transaction/DDL rollback,
  live encrypted WAL inspection, wrong-key/plain-SQLite rejection, encrypted snapshots, and reopen.
- This supplies a tested candidate for the encrypted-storage integration, not an enabled security
  feature. The explicit adapter dependency override and native AES-256-CBC default require review;
  authenticated backup/key envelopes, full service/package integration, locking, and recovery
  remain open. See [probe evidence and commands](F-015-security-gate/encrypted-storage-compatibility.md).

### Batch 5 — Security boundary and F-015 acceptance contract (2026-09-07)

- Every runtime IPC handler now uses a shared registrar that verifies the owning window,
  main frame, and application URL before reaching services. Main/preload channel access is
  limited to an explicit inventory; unrestricted event subscriptions were removed.
- Packaged reset and synthetic seeding are denied regardless of inherited test/development
  flags. The database service also refuses destructive development reset for personal books.
- Packaged windows deny popups, unrelated navigation, webviews, permissions, and renderer
  networking. Production CSP blocks evaluated and inline scripts. Existing payload-bearing
  main-process console methods are disabled before service initialization.
- Added 20 regression/inventory tests. **575 tests across 78 files** and TypeScript checks
  passed. Three repeated packaged runs verified reset rejection, restricted preload, popup and
  inline-script blocking, recovery navigation, restored balances, and original-profile return.
- Development database-isolation and headered CSV-import scenarios each passed three runs
  (**6 E2E passes**) through the shared sender guard.
- Expanded F-015 [requirements](F-015-security-gate/requirements.md) and
  [design](F-015-security-gate/design.md) into explicit acceptance gates. Launch locking,
  encrypted live storage, protected backups, independent key recovery, and legacy conversion
  are **not implemented**. This is boundary hardening, not a completed security gate.

### Batch 4 — Backup and separate-profile recovery (2026-09-07)

- Added a packaged-app recovery page, native folder/file selection, versioned SQLite snapshots,
  and restore into a new profile without overwriting the current book.
- Restores verify SQLite integrity, bundled migration/schema compatibility, Prisma relationships,
  every table's record digest/count, and posting balances. A regression exposed that SQLite's
  foreign-key checks alone miss relationships managed by Prisma; these are checked explicitly.
- Profile selection requires a native confirmation and applies only after quitting/reopening.
  The original profile remains selectable. Missing selected books and external profile symlinks
  are refused rather than replaced with an empty book.
- Added 26 service, IPC, integration, and renderer tests through test-driven implementation.
  **555 tests across 73 files** and TypeScript checks passed. The rebuilt packaged app passed
  **three repeated smoke runs** covering recovery navigation, restored balances after restart,
  and return to the original profile.
- The integration tests substitute native dialog responses; the packaged tests prepare restored
  profiles through the real service. Actual macOS picker/confirmation interaction and a
  representative personal-data recovery drill still require manual acceptance.
- See [Backup and Recovery](backup-and-recovery.md). Backups remain unencrypted; restore currently
  requires matching migration history. Cross-version recovery and pre-startup recovery from an
  unopenable profile are not established by these tests. F-015 and the remaining readiness gates
  are still open.

### Batch 3 — Personal storage, migrations, and packaged startup (2026-09-06)

- Packaged apps now use `profiles/default/book.sqlite` beneath Electron's application data
  directory. Inherited test/development variables cannot redirect that personal database.
- Added bundled-migration initialization with history/checksum validation, consistent pre-upgrade
  snapshots, and transaction rollback on failure. Untracked existing schemas are refused.
- Included external Prisma/SQLite runtime modules and migrations in the package; corrected local
  renderer/preload resource handling, hash routing, production build mode, and graceful shutdown.
- Added seven lifecycle tests covering initialization, preservation across upgrade/reopen,
  rollback, path isolation, and migration drift. The full unit/component suite passed
  **529 tests across 69 files**; TypeScript checks passed.
- Added a packaged-app smoke test using an isolated profile and unrelated working directory.
  It verifies local-file startup, account navigation/creation, clean shutdown, and persistence
  after relaunch, even with inherited test environment variables. The test passed on Apple Silicon.
- Packaging was verified using Node 22; the host Node 26 build exited without an artifact during
  extraction. `.nvmrc` and README record the working toolchain and commands.
- After the production build changes, the development-mode database-isolation and headered
  import tests each passed three consecutive runs (**6 E2E passes**).
- This completes the startup/migration portion of work item 2. User-facing backup/restore,
  encryption/locking, onboarding, valuation, verification, and the real-data pilot remain open.

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

The original recommended first tasks were transaction correctness hardening and personal storage
with recovery. See the implementation log for delivered portions. The next implementation work
is **canonical investment valuation, exact decimals and whole-book verification**,
alongside full installed/native recovery/conversion acceptance. Real OS-authentication
acceptance and the manual recovery drill remain acceptance
gate; do not treat the delivered recovery code as approval to use Bucky as the sole record.
