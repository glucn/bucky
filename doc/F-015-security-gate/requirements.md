# Requirements: Security Gate (F-015)

Updated 2026-11-04. This feature remains **incomplete and a personal-use release blocker**.
The parent [design](../design.md#security--privacy) requires a launch lock, database encryption,
and OS-keychain-first key management with an optional user passphrase. IPC hardening alone
does not satisfy this feature.

## Scope and threat model

Protect financial records from offline access to copied application files, accidental destructive
development operations, and untrusted web content invoking privileged application functions.
The lock must prevent access before authentication, not just cover an already populated screen.
Do not claim protection against an administrator, a compromised OS, or malware reading an
unlocked process. Existing user-managed plaintext copies require explicit handling; never
silently delete them or claim secure erasure on an SSD.

## Acceptance requirements

| ID | Requirement | Evidence required before completion |
| --- | --- | --- |
| SEC-01 | Start locked on every personal-app launch. Do not open the personal database, seed accounts, query financial data, run enrichment, or serve data IPC until authentication succeeds. | Packaged launch and IPC tests before/after unlock; cancellation and failure leave the book unopened. |
| SEC-02 | Support explicit locking and lock on OS session lock/suspend. Quiesce mutations and enrichment, disconnect storage, clear renderer data, and require reauthentication. | In-flight write tests, relock tests, and OS-event tests; no half-written transactions or stale data access. |
| SEC-03 | Encrypt the live database and its sensitive sidecars at rest, including while the app is open. No plaintext working database, temporary export, journal, or WAL may be used as a substitute. | Native encrypted-storage integration and packaged tests: ordinary SQLite cannot read the book; sentinel records are absent from all persisted artifacts. |
| SEC-04 | Generate per-profile random data keys in the trusted process. Use OS-keychain-backed wrapping by default and support an optional passphrase wrap; keys/passphrases must not enter logs, IPC responses, localStorage, or source control. | Key lifecycle tests; unavailable/denied keychain handling; passphrase change and wrong-key tests. |
| SEC-05 | Provide an independently recoverable encrypted backup and a verified recovery secret or configured passphrase. Losing the local keychain must not make a valid backup unusable when the recovery credential is available. | Restore on an isolated profile without the original keychain; wrong/missing recovery credential changes nothing. Setup verifies recovery material before claiming protection is ready. |
| SEC-06 | Upgrade existing plaintext personal data only through a recoverable, verified conversion. Never silently reset or delete the original. Explain remaining legacy plaintext copies. | Interrupted conversion, disk-full, corrupted input, successful reopen, and rollback tests on copies. |
| SEC-07 | Validate every privileged IPC sender and restrict channels; reject development reset/seeding in packaged mode independently of environment variables. Deny unrelated navigation, windows, webviews, and permissions. | Unit boundary tests plus real packaged reset/popup/CSP tests; development imports remain functional. |
| SEC-08 | Avoid financial payloads, secrets, and personal paths in production diagnostics. Preserve useful user-facing error feedback without logging raw exception/query payloads. | Sentinel-based logging tests and packaged output inspection; structured diagnostic review before enabling production logging. |

Authentication must require an explicit successful OS authentication challenge or a verified
user passphrase. Automatic keychain retrieval, a dismissible welcome screen, or a renderer-only
boolean does not count as authentication. On systems without an available OS-authentication
path, explain the limitation and require passphrase setup instead of bypassing the lock.

Encrypt backup contents and key metadata with authenticated encryption. Detect tampering and
unsupported format versions before making a recovered profile selectable. Passphrase-based
wrapping needs a salted, versioned password KDF with reviewed parameters and bounded resource
use. Do not invent cryptographic algorithms or silently fall back to plaintext storage.

## Current implementation status

- SEC-07: sender/channel checks, main/service reset guards, navigation/permission restrictions,
  and production CSP are implemented in the current hardening batch; see the readiness log
  for verification results.
- SEC-08: existing payload-bearing console methods are disabled in packaged main processes
  before service initialization. A non-sensitive structured diagnostic system is not yet implemented.
- SEC-01/SEC-02/SEC-03 now have [authenticated packaged launch](authenticated-launch.md),
  explicit relocking, renderer replacement, enrichment cancellation, encrypted live storage,
  and encrypted migrations/snapshots. The actual passphrase workflow is covered in packaged
  tests; real OS authentication/keychain and OS-session events still need manual acceptance.
- SEC-04/SEC-05 have a tested [key-envelope foundation](key-envelopes.md) and
  [recovery-confirmed setup](protected-profile-setup.md), now connected to the application.
  Durable credential replacement and portable authenticated backup/recovery remain incomplete.
  The [protected artifact service](protected-backup-artifacts.md) now exports authenticated
  files and verifies encrypted restore staging independently of the original keychain. The
  [restore controller](protected-profile-restore.md) adds credential rebinding, recovery
  confirmation, separate-profile publication, and verified next-launch selection. Main lifecycle
  and UI integration now own fresh authentication, native pickers/confirmation, and lock cancellation.
  Full installed recovery, actual OS authentication, native dialogs, and independent-device drills
  still need acceptance.
  [Interrupted recovery services](interrupted-recovery.md) now authenticate preserved staging,
  snapshot it without changing originals, and share confirmed publication. A reviewed setup retry
  can retain artifacts by rename. Main-owned controls, maintenance serialization, native
  confirmation, and lock cancellation are connected. Full native-dialog/real-data acceptance
  remains open.
- SEC-06 now has a [verified conversion service](legacy-conversion.md) that copies a consistent
  plaintext snapshot directly into encrypted staging and reuses recovery-confirmed separate-profile
  publication. Main/IPC/UI integration now requires acknowledged plaintext retention, native
  source selection, replacement authentication, and lock-aware cancellation. Complete installed
  and real-data acceptance remains pending. Direct plaintext opening is still refused, and old
  plaintext books and backup files remain plaintext.
  The old raw-SQLite export/restore UI is unavailable for encrypted profiles.
- The generic compatibility `ipcRenderer.invoke` surface is now restricted to an explicit
  inventory; migrating its remaining call sites to individually typed methods is still desirable.
- Input-schema coverage, dependency/security-update review, and external review of key/storage
  integration remain necessary before calling the application secure.

All requirements must pass in the installed build, not only in mocked unit tests. A matching-version
plaintext recovery smoke test does not prove encrypted recovery or launch locking.
