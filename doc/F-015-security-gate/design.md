# Design: Security Gate (F-015)

Updated 2026-09-23. See [requirements](requirements.md) for the acceptance contract.
Sections below distinguish implemented boundaries from pending recovery/acceptance work.

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

## Implemented authentication and key architecture

The lifecycle is `setup required -> locked -> unlocking -> unlocked -> locking -> locked`,
with separate pending setup/recovery-confirmation and recovery-required states.
Error, denied authentication, and unsupported security capabilities return to a closed state.
The main process owns this state. Renderer views only request operations and render the result.
Every non-security handler additionally requires the unlocked state. The main-owned controller
revokes in-flight results, disconnects storage, quiesces enrichment, and destroys the renderer
on lock. The replacement renderer uses a new memory-only session partition. See
[authenticated launch](authenticated-launch.md) for the implementation and manual-acceptance limits.

Create one random data-encryption key per profile. Persist only wrapped forms of that key, with
versioned metadata and separate OS-keychain, optional passphrase, and recovery mechanisms.
Electron's [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) can protect key
material with macOS Keychain; it is not itself a database encryption layer. The controller
performs a Touch ID challenge before keychain decryption, or verifies an explicitly configured
passphrase before releasing a key to storage. Treating automatic
safeStorage decryption as a launch lock would not meet SEC-01.

The [versioned key-envelope foundation](key-envelopes.md) implements authenticated wraps,
fixed-cost scrypt passphrase derivation, and independent recovery/new-keychain binding. It is
now used by the [protected profile provisioning controller](protected-profile-setup.md), which
requires recovery confirmation and publishes the envelope with a verified encrypted book. The
setup view, OS authentication adapter, and lock lifecycle are now connected to the packaged app.
Protected recovery now has main-owned native dialogs, authentication, cancellation, and UI.
Real OS/keychain and full installed recovery acceptance remain open.
Incorrect credentials and authentication cancellation must neither initialize an empty book nor
overwrite existing keys.

## Encrypted-storage integration and remaining recovery work

Development storage and legacy `sqlite3` lifecycle/recovery helpers read and write plaintext
files. Packaged startup does not open those paths: new profiles require authenticated encrypted
storage, and existing plaintext profiles are refused without modification.
Encrypting a file only on quit, or decrypting into a temporary on-disk
SQLite file at startup, is explicitly not an acceptable implementation of SEC-03.

The [encrypted-storage compatibility probe](encrypted-storage-compatibility.md) now verifies
representative transactions, migrations, timestamps, encrypted snapshots, and reopen behavior
with a libSQL candidate against the pinned/generated Prisma client. It passed under the host,
packaging-toolchain, and Electron Node runtimes. The candidate is now integrated into
[the service layer, migration runner, and packaged dependencies](encrypted-service-integration.md).
The complete suite runs with either native or encrypted storage. A revocable session prevents
deferred work from reopening closed storage; the app lock controller now owns opening and
closing that session. The dependency override and CBC/backup-envelope distinction still require
security review. Isolate any Prisma or Electron upgrade and rerun both
complete storage suites and the packaged checks.

The integration must cover **all** connections: regular queries, migration initialization,
integrity checks, pre-upgrade snapshots, user backups, restore verification, and test fixtures.
Do not leave an independent plaintext SQLite path behind the recovery UI. Backup export must
produce a portable authenticated encrypted artifact without writing a plaintext intermediate.

Conversion of legacy data is copy-and-verify, with explicit user acknowledgement and a recovery
path before activation. Retain the original until the user has a verified protected copy; report
that old plaintext material still exists and do not claim cryptographic protection for it.
The [conversion service](legacy-conversion.md) now implements read-only, byte-faithful record
copying directly into encrypted staging and shares the recovery-confirmed publisher. Application
integration and installed conversion acceptance remain open.

## Remaining implementation sequence

1. Complete full installed backup/restore acceptance through authenticated encrypted artifacts;
   preserve encrypted migration behavior and verify crash/failure cases.
2. Implement recoverable legacy conversion and interrupted-profile recovery.
3. Exercise the installed app with real OS authentication/keychain, OS-session events, portable
   recovery, and legacy conversion; add durable credential changes and reviewed diagnostics.

Keep the full security gate open until these steps satisfy SEC-01 through SEC-08. Continue tracking
minimal onboarding, valuation correctness, the ledger verifier, and the representative pilot in
the [personal-use readiness plan](../personal-use-readiness.md).
