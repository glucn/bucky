# Interrupted setup and restore recovery

Trusted-process services and main/IPC/UI integration implemented 2026-11-04. Full native-dialog
and real-data acceptance are still pending. Do not call these internal APIs manually against personal data. Existing
profiles, staged books, and backups are not automatically deleted or promoted at startup.

## Application controls

Open **Encrypted backup recovery** from the locked/setup/recovery-required screen. The inventory
shows recognized interrupted/preserved files without opening their records. Under **Recovery
source**, choose **Interrupted or preserved profile**, select an available candidate, acknowledge
its snapshot limits, enter its saved recovery code or configured passphrase, and explicitly choose
replacement protection. **Verify interrupted snapshot** creates a separate pending recovery;
saving and re-entering its new code precedes publication. Selection for next launch is separate.

For unpublished default setup, **Preserve unfinished setup files** invokes an exclusive main-owned
maintenance operation. Setup and recovery drain before native confirmation of the exact reviewed
artifact list. Setup/unlock/data/recovery calls are refused while it owns the session. Lock cancels
the operation, suppresses late inventory/confirmation responses, and waits for drainage. Successful
preservation returns to setup-required; **Back to setup** offers explicit fresh currency/protection
choices. No new empty book is created automatically. Preserved candidates stay in inventory.

The recovery view remains mounted through maintenance so cancellation/failure messages and refreshed
inventory stay visible. Credentials are cleared after attempts and when leaving the launch form
for recovery. Native profile-selection consent, source authenticity limits, and real OS/keychain
acceptance remain as described below.

## Inventory and candidate snapshots

`listInterruptedProfiles` inventories recognized setup/restore directories, temporary working
directories, and setup/restore locks under the application's `profiles` directory. Its response
contains only artifact IDs, kinds, and bounded metadata availability. It does not open a financial
database or return envelopes, keys, records, or credentials. Unknown names are ignored.

`canAttemptRecovery` means a candidate has matching key metadata and a regular encrypted book
header. It does not prove that the book is valid or the interrupted operation finished. Missing
keys, malformed/linked files, or an identity mismatch cannot become selectable profiles.

`withInterruptedProfileSnapshot` authenticates the candidate using its saved recovery code or
configured passphrase, independent of the old keychain. It copies the encrypted book and any
WAL/rollback journal directly through read-only, no-follow file handles into private staging.
Shared-memory indexes are rebuilt only in the copy. Original file identities, sizes, modification
times, and change times must stay stable across copying, and the envelope is checked again.
The original book and sidecars are never opened by a database driver, migrated, or checkpointed.

Only the encrypted copy is opened. Recovery excludes uncommitted journal changes, validates its
integrity, bundled schema/history, relationships, every record digest/count, and posting balances,
then creates and rechecks a consolidated encrypted snapshot. Interrupted initial setup also
requires a supported saved base currency and committed default accounts; an empty or partially
seeded setup is refused. No plaintext financial working database or manifest is created.

The trusted callback receives the validated encrypted snapshot and temporary key. Callback keys
are cleared and owned temporary files removed on success/failure/cancellation. Cleanup failures
or abrupt termination can leave encrypted working files, which inventory preserves for diagnosis.

## Separate-profile publication

`ProtectedProfileRestore.beginInterrupted` requires explicit acknowledgement of the snapshot's
limits. It binds the recovered key to a new profile identity, replacement protection, and fresh
recovery code. Re-entry of that new code and another staged-record check precede publication.
Publication/cancellation/durability rules are shared with [protected restore](protected-profile-restore.md).
The source is retained, and no running book or next-launch marker is changed automatically.

Unlike an authenticated portable backup, an interrupted directory has no saved authenticated
manifest proving the original operation completed. The new digest proves fidelity to the staged
snapshot recovered now. It does not prove fidelity to an unavailable original book or statement.
Users must compare the recovered book with statements and available source backups. Credential
rebinding does not rotate the data key or revoke retained old copies.

## Preserve unfinished setup and retry

An empty setup lock or incomplete initial staging must not permanently prevent a new first-run
setup. `preserveInterruptedSetup` moves the exact reviewed set of unpublished default-setup
artifacts to unique `.preserved-*` names under `profiles`, without deleting their contents.
Valid preserved setups remain inventory candidates and can be recovered later using their saved
credentials. Preserved names do not block a new initial setup.

This operation refuses any existing `default` directory, non-default selected book, changed
artifact list, or linked/non-directory source. It does not reset, move, hide, or replace a
published book. If a rename, cancellation, or final directory sync fails, completed moves and
untouched source directories are all retained. Refresh inventory before retrying the remaining
artifacts; there is no rollback that could overwrite a newer file.

The trusted main caller must hold installed-app single-instance ownership, drain setup/recovery,
serialize against other security work, and obtain native confirmation of the exact artifact list
before entry. The library does not decide that another process's lock is stale. No secure erasure
or real power-loss guarantee is claimed.

## Verification and remaining work

Tests cover metadata-only inventory, WAL and rollback-journal snapshots, configured passphrase
recovery, unchanged originals, wrong metadata and credentials, links/traversal, source
mutation, incomplete setup, disk-full, cancellation and key cleanup, recovery confirmation,
preservation-by-rename, existing-book refusal, and partial-preservation retry.

Run the synthetic Electron service check with:

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/security/interrupted-recovery-runtime.cjs
```

This loads checkout services, not the installed UI or actual OS keychain. The packaged recovery
test authenticates a staged snapshot, rejects the old code at fresh confirmation, publishes, then
restarts/unlocks the recovered book and checks its posting balance. Its next-launch selection is
prepared through the trusted service fixture; it does not exercise native selection consent.
Native preservation/selection dialogs, real OS authentication/keychain, actual crash/power-loss,
and representative personal-data recovery still require acceptance.
