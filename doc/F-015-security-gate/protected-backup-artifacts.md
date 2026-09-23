# Protected backup artifacts

Implemented 2026-09-23 as a trusted-process service. This supplies the portable file and verified
staging portions of SEC-05. **It is not yet connected to the application UI, and does not publish
or activate a recovered profile.** The existing backup controls remain disabled for encrypted
books. Do not use this internal API manually against personal data.

## Contract

`createProtectedBackup` accepts an authenticated main-process data key and its matching profile
envelope, the encrypted source book, a new destination, and the bundled migrations. It creates
a consistent encrypted SQLite snapshot including committed WAL data, checks its schema,
relationships, every table's record digest/count, and posting balances, then writes a portable
authenticated artifact. It rereads and verifies the saved artifact before publication.

`withVerifiedProtectedBackup` accepts a recovery code or configured passphrase, without access
to the original keychain. Only after authentication and database validation does its callback
receive the encrypted staging path, ephemeral data-key buffer, portable envelope, and verified
summary. The callback must finish all use before returning. Staging is removed and the mutable
key buffer is cleared afterward, including on failure. No active-profile marker is changed.

The original profile ID remains cryptographically bound to the envelope. A future restore
controller must explicitly bind credentials to a new profile identity and confirm recovery
material before publishing that profile; it must not relabel this envelope or simply place it
under a different profile ID.

## Version 1 file layout

| Part | Contents and checks |
| --- | --- |
| Prefix | Eight ASCII bytes `BUCKYBK1`, then a four-byte big-endian header length. |
| Public header | JSON format/version, portable key envelope, random 32-byte salt, random 12-byte nonce, manifest length, and encrypted database length. Maximum 64 KiB. |
| Encrypted payload | JSON `{ summary }` manifest followed by the already-encrypted SQLite snapshot. Manifest maximum 1 MiB; database maximum 8 GiB. |
| Authentication tag | Exactly 16 bytes. Truncation and trailing bytes are refused. |

The header carries authenticated, encrypted key wraps, not raw keys or credentials. The local
keychain record is omitted. Profile/key IDs, KDF identifiers/salts, lengths, and cryptographic
parameters are public; financial records, counts, and balances are not. The complete prefix and
header are authenticated as additional data, including credential wraps not used for recovery.
Unknown versions/fields, invalid encodings, and out-of-range lengths are refused before large
allocation or database access.

The outer layer uses Node's AES-256-GCM implementation. HKDF-SHA256 derives a separate 32-byte
artifact key from the profile data key, random per-file salt, and the domain string
`bucky-protected-backup-v1`. Every export gets fresh salt and nonce. This separates artifact
encryption from the native SQLite cipher and existing profile-key wraps. These are standard
[Node crypto primitives](https://nodejs.org/api/crypto.html#cryptohkdfsyncdigest-ikm-salt-info-keylen),
not a cryptographic audit of the application protocol.

Recovery reads bounded chunks (64 KiB), retaining only the bounded manifest in memory. It does
not parse that manifest or open SQLite before
[GCM final authentication succeeds](https://nodejs.org/api/crypto.html#deciphersetauthtagbuffer-encoding).
Only the still-encrypted SQLite bytes are written to private staging. The reconstructed book
must then pass the same schema/history/integrity/Prisma-reference and record/balance checks as
legacy recovery, and its computed summary must match the encrypted manifest.

## Publication, failures, and cancellation

- Staging directories use private `0700` permissions; files use `0600`. Source artifact reads
  require regular files and reject final-component symlinks. Missing/plaintext source books
  are refused, not created or converted.
- Export staging is on the destination filesystem. The fully written, synced, verified artifact
  is published with an exclusive hard link and parent-directory sync. Existing files, empty
  files, and symlinks are never overwritten. Filesystems without hard-link support fail closed;
  there is no copy-overwrite fallback.
- Write/publication failures and cooperative cancellation clean only the current operation's
  staging. A directory-sync failure after publication preserves the complete destination and
  reports uncertain durability; it does not delete a potentially usable backup.
- Abrupt termination can leave private `.bucky-backup-*` or `.bucky-restore-*` directories.
  These are not selectable profiles. Startup cleanup/recovery policy remains future work; do
  not automatically delete an unknown leftover directory.
- The caller must wire lock/shutdown to the abort signal, await the operation, and enforce its
  own session checks during callback work. A query already in progress can finish before the
  next cancellation check. No claim of secure erasure or guaranteed native-memory zeroization
  is made.

The only plaintext SQLite file used by validation is an empty bundled reference schema, with
no user records. Migration compatibility currently requires matching history/schema; older
backups need the matching app version. Successful recovery proves copy fidelity, not accounting
correctness. Retained old backups keep the credentials valid when they were created.

## Evidence and next integration

The focused tests cover both independent credentials, WAL snapshot fidelity, encrypted staging,
permissions, absent plaintext sentinels, fresh encryption parameters, wrong credentials,
header/unused-wrap/ciphertext/tag tampering, invalid sizes/versions, truncation/appending,
authenticated-but-incorrect manifests, invalid references/schema/history, overwrite/symlink
refusal, cancellation, partial writes, and pre/post-publication failures.

An isolated synthetic check also passed under Electron's embedded Node 18.18.2: create the
encrypted book, export, recover with each credential, and reject a modified tag. This loads
the service from the checkout; it is not an installed UI recovery test.

Next: the main-owned restore controller, credential rebinding and recovery confirmation,
separate-profile publication/selection, native export/import dialogs, lock-aware cancellation,
and actual packaged recovery tests. Real cross-device/manual recovery remains an acceptance
gate. See the [readiness log](../personal-use-readiness.md) for full-suite evidence.
