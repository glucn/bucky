# Protected profile restore controller

Implemented 2026-09-28 as a trusted-process service. The controller now publishes an independently
recoverable encrypted profile from a [protected backup](protected-backup-artifacts.md), but **is
not yet connected to application IPC or UI**. Native dialogs, authentication/session ownership,
and actual installed recovery remain the next integration work. Do not invoke this internal API
manually against personal data.

## Restore transaction

`ProtectedProfileRestore(userData, migrations)` never restores over an existing book:

1. `begin` verifies the backup using its recovery code or configured passphrase. It does not
   need the original machine's keychain. Wrong backup credentials do not invoke replacement
   keychain protection or change existing books/profile selection.
2. Generate a distinct `restored-*` profile ID. Verify the recovered data key against its original
   envelope, then bind it to the new identity with a new key ID, fresh recovery code, and explicitly
   chosen ordinary credentials: new-machine keychain, passphrase, or both. Requested keychain
   failure does not silently fall back.
3. Keep a private encrypted copy and its rebound envelope in owned `.restoring-*` staging.
   Return only the restore ID, proposed profile ID, verified summary, and one-time recovery code
   for the dedicated recovery presentation. The returned summary does not share mutable state
   with the pending transaction. No selectable profile exists yet.
4. `confirm` requires re-entry of the **new** recovery code. The backup's old code is not enough.
   Read the persisted envelope again, recover its key, reopen the staged encrypted book, and
   compare every record digest/count and posting balance with the verified backup summary.
   Changed records or key metadata abort publication.
5. Sync the book and staging directory and publish together by directory rename. Existing targets
   are refused, including empty directories. Cooperative publishers use an exclusive per-profile
   lock. Sync the parent directories before returning success. This does not select the profile
   or switch the running connection.

This is credential rebinding, **not database rekeying**. The restored snapshot retains the same
underlying data key. New recovery/passphrase wraps are bound to the new profile identity; the old
profile and old backup remain usable with their old credentials. Anyone already holding the old
data key can still decrypt the copied database. Revocation of old copies requires a separate,
explicit data-key-rotation design and is not claimed here.

## Cancellation and failure behavior

Pending restore keys expire after 15 minutes. Explicit cancellation and expiry clear those
mutable buffers and remove only the controller's owned staging. Cancellation waits for any
in-flight verification/provisioning to settle; competing operations are refused during that wait.
The main owner must call `cancel()` on locking/shutdown and await it before another authentication
session. It is not sufficient to dismiss the recovery view.

Cancellation is checked again after the last asynchronous filesystem validation, immediately
before publication or next-launch selection. Once a rename has published a complete profile,
later cancellation never deletes it. A parent-directory sync failure after publication reports
uncertain durability and preserves the recovered book. A rejected confirmation must therefore
not be interpreted as proof that no profile was published.

Failed staging/lock cleanup retains ownership and blocks new restores until cancellation can
retry cleanup successfully. Unrelated interrupted directories and locks are never deleted.
An abrupt process termination can leave owned encrypted staging or locks; the controller does
not automatically recover or discard these on the next launch. Interrupted-recovery UX remains
open, as does real power-loss validation beyond injected filesystem failures.

Profile directories are checked against the application-data root. Envelopes use bounded,
no-follow reads, and encrypted database reads reject non-regular files and plaintext headers.
New staging/profile directories use `0700` permissions and files use `0600`. The code does not
promise protection against a compromised OS or secure erasure of native/JavaScript memory.

## Explicit next-launch selection

`selectProtectedProfile` verifies a supplied authenticated key against the target envelope and
checks the encrypted book before atomically persisting `active-profile.json`. It never deletes
the current book or changes a running database connection. Wrong keys, invalid profiles,
cancellation before publication, or failed marker writes preserve the prior selection. A sync
failure after the marker rename preserves the new marker and reports uncertain durability.

Before calling it, the future main-process owner must obtain the target profile's authentication
and native confirmation. The service itself does not provide OS authentication or consent. It
can select the restored profile or return to the original after successful authentication.

## Verification and remaining gates

Tests cover fresh identity/recovery binding, wrong keys and credentials, new-machine keychain
substitution, recovery-code re-entry, actual restored postings/balances, preservation of later
edits to the original, cancellation/expiry, changed staging, existing-target refusal, publication
failure, post-publication durability failure, failed cleanup ownership, symlink refusal, and
selection/return without replacing the current book. Three late-cancellation/cleanup regressions
failed before their fixes.

An Electron Node 18.18.2 synthetic check independently restored into another application-data
directory, confirmed the new recovery code, used the replacement passphrase, selected the new
profile, and reopened it through encrypted Prisma. This loads the checkout's service modules,
not an installed UI or actual cross-device/keychain recovery workflow.

See the [readiness log](../personal-use-readiness.md) for full-suite results. SEC-05 remains open
until the app exposes export/restore from appropriate locked/unlocked states, connects cancellation
to the main security lifecycle, and passes packaged and manual recovery drills. Legacy conversion,
credential-change persistence, and the other personal-use gates are still required.
