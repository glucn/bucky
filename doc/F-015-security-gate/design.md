# Design: Security Gate (F-015)

Updated 2026-09-08. See [requirements](requirements.md) for the acceptance contract.
Sections below distinguish implemented boundaries from pending storage/authentication work.

## Implemented process boundary

The Electron entry point constructs one `createSecureIpc` registrar and supplies it to every
handler module. It verifies the owning webContents, the exact main frame, and the application
document URL at invocation time. Packaged trust is limited to the bundled document (hash routes
are allowed); development trust is limited to the configured localhost origin. This follows
[Electron's sender-validation guidance](https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages).

`src/shared/ipcChannels.ts` is the reviewed operation inventory. Unknown channels are rejected
by preload and by registration in the main process. A source-inventory regression ensures
registered handlers remain aligned and handler modules do not import the raw Electron registrar.
The old unrestricted event-subscription bridge is removed. Existing renderer `invoke` calls
remain supported only for inventoried operations; typed per-operation methods are the preferred
direction, consistent with [Electron's context-isolation guidance](https://www.electronjs.org/docs/latest/tutorial/context-isolation#security-considerations).

Packaged state, not `NODE_ENV` or `VITEST`, prohibits development reset and synthetic enrichment
seeding. `databaseService.resetAllData` independently rejects personal databases before starting
a transaction. This does not add a personal factory-reset capability; any future personal reset
must have an explicit, separately reviewed recovery/confirmation contract.

The BrowserWindow explicitly uses context isolation, a sandbox, disabled Node integration, and
web security. Popups, unrelated navigation/redirects, webview attachment, and permission requests
are denied. Production CSP disallows renderer network requests, frames, objects, and evaluated
or inline scripts. Inline styles remain necessary for the current styling setup. Networked
enrichment remains in the main process. Development retains its hot-reload policy.

Production main-process `console.log/info/debug/warn/error/trace` are disabled before service
imports because existing calls include account names, transaction payloads, and raw errors.
This trades detailed console diagnostics for privacy until a reviewed event-code logger exists.
It does not promise to suppress native Electron diagnostics or all possible third-party output.

## Pending authentication and key architecture

The intended lifecycle is `setup required -> locked -> unlocking -> unlocked -> locking -> locked`.
Error, denied authentication, and unsupported security capabilities must return to a closed state.
The main process owns this state. Renderer views only request operations and render the result.
Every data handler will additionally require the unlocked state; the current sender guard alone
does not provide an app lock.

Create one random data-encryption key per profile. Persist only wrapped forms of that key, with
versioned metadata and separate OS-keychain, optional passphrase, and recovery mechanisms.
Electron's [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) can protect key
material with macOS Keychain; it is not itself a database encryption layer. The design also must
perform an authentication challenge before releasing a key to storage. Treating automatic
safeStorage decryption as a launch lock would not meet SEC-01.

The [versioned key-envelope foundation](key-envelopes.md) implements authenticated wraps,
fixed-cost scrypt passphrase derivation, and independent recovery/new-keychain binding. It is
not yet wired into profile persistence or the lock lifecycle. The OS authentication implementation
and protected recovery UX still need implementation and testing before provisioning real keys.
Incorrect credentials and authentication cancellation must neither initialize an empty book nor
overwrite existing keys.

## Encrypted-storage integration and remaining activation work

The current Prisma native SQLite engine and `sqlite3` lifecycle/recovery connections read and
write plaintext files. Encrypting a file only on quit, or decrypting into a temporary on-disk
SQLite file at startup, is explicitly not an acceptable implementation of SEC-03.

The [encrypted-storage compatibility probe](encrypted-storage-compatibility.md) now verifies
representative transactions, migrations, timestamps, encrypted snapshots, and reopen behavior
with a libSQL candidate against the pinned/generated Prisma client. It passed under the host,
packaging-toolchain, and Electron Node runtimes. The candidate is now integrated into
[the service layer, migration runner, and packaged dependencies](encrypted-service-integration.md).
The complete suite runs with either native or encrypted storage. A revocable session prevents
deferred work from reopening closed storage, but authentication and the app lock controller are
not yet implemented. The dependency override and CBC/backup-envelope distinction still require
review before changing live storage. Isolate any Prisma or Electron upgrade and rerun both
complete storage suites and the packaged checks.

The integration must cover **all** connections: regular queries, migration initialization,
integrity checks, pre-upgrade snapshots, user backups, restore verification, and test fixtures.
Do not leave an independent plaintext SQLite path behind the recovery UI. Backup export must
produce a portable authenticated encrypted artifact without writing a plaintext intermediate.

Conversion of legacy data is copy-and-verify, with explicit user acknowledgement and a recovery
path before activation. Retain the original until the user has a verified protected copy; report
that old plaintext material still exists and do not claim cryptographic protection for it.

## Remaining implementation sequence

1. Persist the implemented key envelopes atomically and verify recovery material during protected setup.
2. Implement launch authentication and a main-owned lock lifecycle; delay database access until unlock.
3. Route backup/restore through authenticated encrypted artifacts; preserve encrypted migration
   behavior and verify crash/failure cases.
4. Exercise the installed app with real OS authentication/keychain, portable recovery, and legacy conversion.

Keep the full security gate open until these steps satisfy SEC-01 through SEC-08. Continue tracking
minimal onboarding, valuation correctness, the ledger verifier, and the representative pilot in
the [personal-use readiness plan](../personal-use-readiness.md).
