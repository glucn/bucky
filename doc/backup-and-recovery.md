# Backup and Recovery

Implemented 2026-09-07 for the packaged Apple Silicon macOS app. This is part of
[personal-use readiness](personal-use-readiness.md), not completion of the security gate.

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

**Backups and personal databases are not encrypted.** Newly created backup/database files use
owner-only permissions on macOS; that does not provide encryption or protect copies made by
other software. Use storage appropriate for financial records. App locking, key recovery, and
encrypted storage remain F-015 work.

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

For an older backup, restore using the matching older app build into a separate profile first,
then upgrade that recovered profile with the newer app. Normal startup migrations create a
pre-upgrade snapshot beneath the profile's `backups` folder and apply upgrades atomically.
This older-build recovery procedure still needs a cross-version manual acceptance check;
do not treat the current same-version test as proof of that whole workflow.

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

The packaged smoke test navigates to recovery and proves that a service-restored profile opens
in the real app with the expected balance, then returns to the original profile. It does not
automate interaction with the macOS file picker or confirmation dialog.

Before relying on this workflow with personal data:

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
