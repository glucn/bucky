# Backup and Recovery

## Encrypted profiles (2026-11-03)

The packaged app now exposes authenticated encrypted backup and separate-profile restore.
Full native-dialog and independent-device recovery acceptance is still outstanding; keep
another authoritative bookkeeping record until the readiness gates are complete.

To export, unlock Bucky and open **Backup & recovery**. Enter the current profile's configured
passphrase or choose Touch ID and OS keychain, then choose **Create encrypted backup**.
Authenticate again and choose a private folder. Wait for **Encrypted backup created and verified**.
The `.buckybackup` file includes an authenticated encrypted snapshot and record manifest, without
machine-bound keychain metadata. Keep its matching app version and saved recovery code or
configured passphrase separately. Existing files are never overwritten.

To restore, open **Encrypted backup recovery** from the locked/setup/recovery screen, or use
**Backup & recovery** after unlocking. Supply the backup's saved recovery code or configured
passphrase and explicitly choose the new profile's protection. Choose the encrypted file,
then save and re-enter the **new** recovery code before publishing. A failed confirmation can
be retried; cancellation drains pending work and preserves published profiles. Locking cancels
recovery and clears the renderer. Credentials are cleared from inputs after each attempt.

After publication, review the verified counts and posting balances. Select the new profile,
authenticate with its credentials, choose **Use on next launch**, and confirm the native warning.
Quit fully and reopen to use it. Relocking alone keeps the running profile. Authenticate the
original profile and select it the same way to return. No current book or backup is overwritten.
If selection metadata is damaged, the locked recovery screen can still restore and explicitly
select a verified profile. Interrupted staging cleanup/recovery still needs dedicated UX.

New credential wraps do not revoke old backup copies or rotate the underlying database key.
The checks prove recovery fidelity, not accounting correctness. Same-version schema compatibility,
real OS authentication, native dialogs, and an independent-device drill remain acceptance limits.
See the [artifact contract](F-015-security-gate/protected-backup-artifacts.md),
[restore contract](F-015-security-gate/protected-profile-restore.md), and
[readiness log](personal-use-readiness.md) for evidence and remaining work.

## Convert a legacy plaintext book

Open the recovery screen and set **Recovery source** to **Legacy plaintext SQLite book**.
Explicitly acknowledge that originals and existing copies remain plaintext, choose replacement
protection, then use **Choose legacy book and convert** to pick the source. Save and re-enter
the new recovery code before the encrypted profile is published. Review its verified summary
and select it explicitly for next launch. Conversion never overwrites, migrates, or deletes the
source. See [verified legacy conversion](F-015-security-gate/legacy-conversion.md) for limits.

## Historical plaintext workflow

Legacy workflow implemented 2026-09-07 for the packaged Apple Silicon macOS app.
**Status as of 2026-09-23: the workflow below is unavailable for newly encrypted profiles.**
The current app rejects its raw-SQLite recovery context and disables these controls. Existing
plaintext profiles are preserved but refused at launch pending verified conversion.
Authenticated portable backup/restore is the next [personal-use readiness](personal-use-readiness.md)
blocker. Do not treat manual copies or the setup recovery code as a completed recovery drill.

The instructions below document the previous plaintext implementation and its retained service
tests, not a supported recovery path for the current encrypted build.

The new [protected artifact service](F-015-security-gate/protected-backup-artifacts.md) implements
authenticated encrypted export and verified staging. Its companion
[restore controller](F-015-security-gate/protected-profile-restore.md) can publish a separate
profile after fresh recovery confirmation and verify explicit next-launch selection. These
services now have protected app controls described above. They do not enable the historical
plaintext controls or replace the manual acceptance drill below.

## Create a backup

1. Finish saving any edits. Open **Backup & recovery** in the navigation bar.
2. Choose **Create backup** and select a private folder in the native macOS dialog.
3. Wait for **Backup created**. The page shows the file path, schema version, record counts,
   digest, and expandable posting balances.
4. Keep multiple dated copies, including a copy on another device or protected drive. Retain
   the matching application build so older backups remain recoverable.

Each file is named `bucky-v1-<timestamp>-<unique-id>.sqlite`. The `v1` identifies this backup
convention; the database's migration history identifies its schema version. Existing files are
never overwritten. SQLite creates a consistent snapshot including committed WAL data while
the app is running. Unsaved forms and transactions committed after that snapshot are not included.

Backups contain all database tables, including account names, transactions, settings, rules,
and stored investment data. They do not include external statements, environment variables,
provider credentials supplied through the environment, or operating-system settings.

**These legacy backups and databases are not encrypted.** Their created files use
owner-only permissions on macOS; that does not provide encryption or protect copies made by
other software. Use storage appropriate for financial records. New protected profiles now use
encrypted storage and authenticated launch, but existing plaintext copies are not transformed.

## Restore without replacing the current book

1. Open **Backup & recovery** and choose **Restore backup into new profile**.
2. Select a backup. Cancellation leaves the current book and profile selection unchanged.
3. Wait for **Restored and verified in a separate profile**. Review the counts and posting
   balances. The recovered file is under `profiles/restored-<timestamp>-<unique-id>/book.sqlite`
   in Electron's application data directory.
4. Finish or cancel any unsaved work. Select that profile under **Open a profile on next launch**,
   choose **Use on next launch**, and confirm the native warning.
5. Quit Bucky completely with **Quit Bucky / Command-Q**, then reopen it. Closing the window alone
   does not quit the macOS app. Until quitting, edits still apply to the original running book.
6. Return to **Backup & recovery** to confirm the current profile. Check account balances,
   representative transactions, settings, and reports against the backup and your statements.

The original profile, normally `default`, is not deleted or overwritten. To return to it,
select it on the recovery page, confirm, quit, and reopen again. Selecting a profile persists
only its ID in `active-profile.json`; no running Prisma connection is switched. All restored
profiles and backup copies are retained; automatic pruning is not implemented.

## What is checked

- SQLite integrity and declared foreign keys.
- Completed migration names/checksums and schema objects against the bundled schema.
- Prisma relationships as well as physical SQLite foreign keys: the app uses `relationMode=prisma`,
  so SQLite's foreign-key check alone is insufficient.
- Every application table's record count and a deterministic SHA-256 digest of its records.
- Raw journal balances by account and posting currency, without FX conversion or display-sign changes.

Restore compares the staged copy with the source before publishing the new profile. A differing
record, failed validation, or failed publication rejects the restore and removes its temporary
staging directory. Existing books and the selected source backup remain untouched. Selecting
a profile validates it again; missing files, path traversal, and profiles linked outside app
storage are refused. A missing selected profile fails startup rather than silently creating an
empty replacement book.

The digest verifies copy fidelity, not authenticity: there is no signed or encrypted backup
manifest. These checks also do not prove that the original accounting entries or valuations
were correct. Statement reconciliation and the planned ledger verifier remain necessary.

## Compatibility and failure limits

Restore currently accepts only the same bundled migration history and schema. It rejects
untracked development databases, corrupt files, incompatible histories, and broken references.
It does not repair damaged books or migrate the selected source file.

The legacy recovery proposal was to restore an older backup with the matching older app build
into a separate profile first,
then upgrade that recovered profile with the newer app. Normal startup migrations create a
pre-upgrade snapshot beneath the profile's `backups` folder and apply upgrades atomically.
This older-build recovery procedure still needs a cross-version manual acceptance check and
verified plaintext-to-encrypted conversion before the current app will open that profile.
Do not treat the historical same-version test as proof of that whole workflow.

If startup reports a missing selected profile, preserve `active-profile.json`, the profile
directories, and backups for diagnosis. Do not reset data or substitute an empty file. Recovery
from a profile that cannot start is not yet exposed through a pre-startup recovery screen.

Backup/restore operations are serialized in the main process. Filesystem paths come from native
pickers, not renderer arguments, and only the owning main frame can invoke these handlers.
This does not replace the broader IPC/security review required by F-015.

## Verification and manual acceptance

Automated coverage includes WAL snapshots, record/balance equality, overwrite and symlink
protection, corrupt/incompatible backups, interrupted publication, profile switching, and
failure/cancellation UI behavior. An integration test runs the real recovery handlers and
SQLite services, substituting native dialog responses and an isolated storage context.

The historical packaged smoke test proved that a service-restored plaintext profile opened with
the expected balance and could return to the original profile. Current packaged tests instead
verify authenticated encrypted startup and refusal of legacy profiles; they do not establish
encrypted restore. Native picker and confirmation-dialog acceptance remains outstanding.

After implementing protected backup/restore, adapt and complete this manual acceptance drill:

- [ ] Create a synthetic account and transaction in a disposable packaged profile.
- [ ] Use the actual native dialogs to export a backup; cancel once and verify no changes.
- [ ] Make a later edit, then restore the backup through the UI into a separate profile.
- [ ] Confirm the restored profile has the earlier balance and the original retains the later edit.
- [ ] Use the native profile confirmation, quit fully, reopen, and inspect the recovered book.
- [ ] Return to the original profile and verify its records remain unchanged.
- [ ] Repeat with a backup copied to another device or protected drive.

For an isolated manual profile, launch the packaged executable with
`--user-data-dir=/absolute/path/to/a/new-disposable-directory`. Do not use your real profile
for destructive experiments.
