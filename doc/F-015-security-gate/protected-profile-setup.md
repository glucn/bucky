# Protected profile setup

Implemented 2026-09-09 as a trusted-process provisioning controller; connected to
[authenticated personal startup and the protected setup view](authenticated-launch.md) as of
2026-09-23. Do not invoke this internal controller manually against an existing profile.

## Setup contract

`ProtectedProfileSetup(userData, migrations)` creates only a new `default` profile. Its workflow is:

1. `begin({ baseCurrency, keychain?, passphrase? })` requires an explicitly supported currency
   and an explicitly selected ordinary credential mode. It refuses existing, incomplete, or
   interrupted profiles. It returns a setup ID and one-time recovery code to the trusted caller;
   no book, envelope, directory, or selection marker is written yet.
2. The protected setup view presents that code and asks the user to save it separately.
   `confirm(setupId, reenteredRecoveryCode)` must recover the exact pending data key before any
   filesystem provisioning. A checkbox alone is insufficient. Wrong input leaves setup pending
   and creates nothing. A confirmed setup ID is consumed even if provisioning later fails.
3. Provision in a new private staging directory, durably write the key envelope, initialize the
   encrypted database, save the selected base currency, and seed defaults in that currency.
   No financial transactions are seeded. Re-read the persisted envelope, independently recover
   its key, and reopen the database to verify initialization.
4. Sync the book/staging directory, then publish the complete directory as `profiles/default`.
   Sync its parent directories. Raw data keys and recovery credentials are never stored beside
   the book. The envelope and book have mode `0600`; the new profile directory has mode `0700`.

Setup data keys are cleared on cancellation, completion, failure, or the 15-minute expiry timer.
Recovery-code and passphrase strings cannot be reliably erased from the JavaScript runtime.
The UI must keep the recovery presentation separate from general app state and clear its view
on cancellation/confirmation. The controller does not verify that the user kept the code on
another device or durable medium; it verifies that the re-entered code actually recovers the key.

`cancel()` invalidates pending work and waits for an active operation to settle. Cancellation
before publication removes that operation's staged files. Publication is the commit point;
cancellation arriving after publication never deletes the newly created profile. The main lock
controller inspects state after cancellation rather than assuming nothing was created.

## Filesystem and failure behavior

Setup publishers coordinate through an exclusive `.setup-default.lock` directory. Only the
operation that created a lock may remove it. Another publisher or a leftover lock is not a
reason to overwrite or clean up someone else's work. Profile storage cannot redirect through
symlinks outside the application data root. Key reads are bounded to 64 KiB, reject non-regular
files, and use no-follow/nonblocking opens. Malformed or mismatched key metadata is refused.

Failures before publication remove only the current operation's staging directory and lock.
An abrupt process termination can leave `.creating-default-*` or a lock; inspection reports
interrupted setup, and another setup is refused. These files are not automatically deleted.
Existing plaintext, protected, missing-key, corrupt, or even empty profile directories are
never intentionally replaced by setup. Legacy conversion remains a separate workflow.

If the directory was published but its final durability check fails, the operation reports that
the profile was created and must be unlocked/recovered. It preserves the book and envelope and
refuses a second setup. It cannot promise power-loss durability after an operating-system sync
failure. The tests inject I/O failures; they do not emulate every filesystem or physical power loss.

`inspectProtectedProfile` reads only bounded metadata and the file header, without opening
SQLite or decrypting a key. It distinguishes missing, legacy, incomplete, interrupted, and
structurally protected profiles. Its method hints are untrusted metadata until authentication
and database opening succeed; this inspection is not an integrity or cryptographic verification.
Neither inspection nor provisioning changes the active-profile selection or exposes a data key.

## Verification and remaining work

The 17 tests exercise recovery confirmation, passphrase/recovery interoperability, explicit
currency seeding, private permissions, expiry, cancellation during migration, two competing
controllers, migration/envelope-write/publication failures, post-publication sync failure,
stale locks, legacy preservation, symlink rejection, and bounded/mismatched metadata.

Both full storage-mode suites pass: **629 tests across 84 files in each mode**, plus TypeScript
checking. A synthetic passphrase-only setup also passed on Electron's embedded Node 18.18.2,
including wrong-code refusal, persisted-envelope recovery, and reopening the encrypted EUR book.
That smoke check loads project declarations with `TS_NODE_FILES=true`; loading only transitively
imported declarations omits Electron's `Process.resourcesPath` augmentation.

The setup UI, main-owned OS/passphrase boundary, fail-closed startup, lock/relock, and OS-event
wiring are now implemented; see the authenticated-launch note for newer verification evidence.
Protected portable backups now have app controls. Still required: installed recovery acceptance,
interrupted-setup recovery UX, legacy conversion,
and real keychain/user recovery drills. Existing credential-envelope
replacement and passphrase-change persistence are not provided by this initial-creation controller.
BL-022's reset modes and onboarding-state policy also remain open; this controller establishes
explicit base-currency-before-seeding only for newly provisioned encrypted profiles.

See [F-015 requirements](requirements.md) and the [readiness plan](../personal-use-readiness.md).
