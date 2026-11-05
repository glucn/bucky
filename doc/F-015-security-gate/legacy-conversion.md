# Verified legacy conversion

Implemented as trusted-process services on 2026-11-03, with application integration on 2026-11-04.
The packaged app preserves and refuses direct plaintext opening, and now exposes explicit
conversion through its recovery screen. Do not call the internal API manually against personal
data. SEC-06 remains incomplete pending full installed/native-dialog and personal acceptance.

## Application workflow

From a locked/setup/recovery-required screen choose **Encrypted backup recovery**, or open
**Backup & recovery** after unlocking. Under **Recovery source**, choose **Legacy plaintext
SQLite book**. Read and check the acknowledgement that the original book and existing copies
remain plaintext. Explicitly choose replacement protection and repeat any new passphrase.
Choose **Choose legacy book and convert** and select the source through the native file picker.

Main validates acknowledgement and credentials before choosing a source or starting conversion;
the renderer cannot supply a source path. Keychain mode requires an explicit successful OS
authentication challenge. A picker or authentication result arriving after lock is ignored.
Conversion shares the recovery owner's serialization, cancellation, and drainage before another
setup/unlock session. Inputs are cleared after attempts.

Save and re-enter the newly generated recovery code before publication. Review the verified
summary, then explicitly select/authenticate the new profile and confirm the native warning.
Quit completely and reopen to use it. The original plaintext profile is retained; direct opening
of it stays blocked. Use a matching older build on a copy if its plaintext records are needed.

## Copy and verify

`withVerifiedLegacyConversion` opens an existing regular plaintext SQLite source read-only. It
holds one read transaction across validation and copying, including committed WAL records. It
refuses corrupt/incompatible schemas, migration drift, and broken physical or Prisma-managed
references through the same recovery validator used for protected backup/restore.

The destination is a fresh encrypted database in private `.legacy-conversion-*` staging, initialized
with the bundled migrations. Records are copied directly into an encrypted write transaction;
there is no new plaintext financial snapshot, SQL dump, or on-disk manifest. The validator's
temporary reference database contains only the empty application schema.

Copying preserves SQLite storage types, exact 64-bit integers and rowids, text bytes (including
NULs), blobs, and double values. JS UTF-8 decoding and number conversion are not used for text or
integer fields. Migration records are copied too. Every table's count/digest, schema/history,
relationships, and raw posting balances must match the source snapshot before commit. The
encrypted database is reopened and checked again before a trusted callback receives its path.
The callback must finish all use before returning; staging is then removed.

The source is never migrated, checkpointed, reset, selected, renamed, or deleted by conversion.
A separate WAL writer can keep editing it: the converted book represents the consistent snapshot
used by validation, not subsequent changes. Finish source edits before using this workflow.
The caller owns the supplied data key and trusted staging parent; the primitive does not create
key envelopes or expose keys to a renderer.

## Recovery-confirmed publication

`ProtectedProfileRestore.beginLegacy` requires explicit acknowledgement that plaintext originals
and copies remain unencrypted, plus explicitly chosen keychain/passphrase protection. It creates
a fresh data key, distinct `restored-*` profile identity, key envelope, and recovery code. It uses
the converter and the same publication transaction as protected restore.

No profile is selectable until the user saves and re-enters the new recovery code. Confirmation
recovers the persisted staged key, rechecks the converted records, then publishes the encrypted
book and envelope together. It does not change the running book or next-launch marker. Explicit
authenticated selection and main-owned native consent remain separate actions.

Cancellation, expiry, competing-operation refusal, staged-record/envelope checks, existing-target
protection, and post-publication durability behavior are shared with
[protected restore](protected-profile-restore.md). Cancelling never deletes a published profile
or the plaintext source. Interrupted encrypted staging may remain after abrupt termination or
cleanup failure; automatic discovery, recovery, and user-directed discard still require dedicated
UX. No secure-erasure claim is made for retained plaintext, native/JS memory, or SSD storage.

## Evidence and remaining gates

Tests cover committed WAL records, concurrent source writes, encrypted/Prisma reopen, exact stored
values, unchanged source bytes, corrupt/history/reference/link refusal, injected disk-full and
mid-copy failure, cancellation/retry, callback failure, acknowledgement, fresh identity/key,
recovery confirmation, and publication without selection. Existing restore tests exercise the
shared publication/cancellation/failure path.

Run the synthetic Electron service check with:

```sh
ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/security/legacy-conversion-runtime.cjs
```

It verifies confirmation, encrypted reopen, independent protected-backup recovery, explicit
selection, and byte-for-byte source preservation. It loads checkout services, not the installed
UI or actual OS keychain. See the [readiness log](../personal-use-readiness.md) for suite results.
Main-owned source picking, authentication, acknowledgement UI, and lock cancellation are now
connected. Packaged navigation/acknowledgement tests do not execute the complete native picker,
conversion, selection, restart and return workflow. That installed drill, real OS/keychain, and
representative personal-data acceptance are still required.
