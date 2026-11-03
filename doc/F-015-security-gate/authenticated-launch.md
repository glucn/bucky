# Authenticated personal-app launch

Updated 2026-11-03. New packaged profiles use encrypted storage behind main-process
authentication and now expose protected backup/restore. **F-015 is still incomplete: full
recovery acceptance and legacy conversion remain open. Do not use this build as the sole financial record.**

## User workflow

1. Launch a packaged build with a new, disposable profile. Choose a base currency explicitly.
2. On a supported Mac, setup defaults to Touch ID plus OS-keychain protection. Alternatively,
   explicitly select passphrase mode. If OS authentication is unavailable, a passphrase is
   required. Keychain mode can also have an optional passphrase. Repeat the passphrase exactly;
   spaces and Unicode are preserved, with a minimum of 12 code points and maximum of 1024 bytes.
3. Save the one-time recovery code separately and re-enter it. No book is written until the
   code has been verified. Creation publishes the verified encrypted book and wrapped keys
   together; it does not automatically unlock the book.
4. Authenticate to unlock. A wrong passphrase or denied OS challenge leaves financial IPC
   unavailable. Failed unlocks have a bounded retry delay.
5. Use **Lock Bucky**, quit, or close the window to revoke access. Every relaunch starts locked.
   OS session-lock, suspend, and user-session-deactivation events also request locking.

The recovery code is verified cryptographically during setup, but a user-facing recovery flow
has not been delivered. Keep the code; do not interpret its existence as a tested backup plan.
Existing plaintext profiles are preserved and shown as **Recovery required**, not converted,
opened, or replaced. Incomplete or malformed profiles likewise fail closed.

## Trust and lifecycle boundaries

`src/main/personalSecurity.ts` owns authentication state, credentials, in-flight work, and key
release. Startup inspects only bounded profile metadata/header bytes; it does not connect to
the personal database, seed records, or start enrichment. Development and test storage remain
separate and do not inherit personal authentication bypasses from environment variables.

The shared IPC registrar requires authentication for every non-security channel as well as
verifying the sender. The five security operations are inventoried separately. No data key,
wrapped-key envelope, or arbitrary event subscription is exposed through preload. The dedicated
setup response contains only a setup ID and the intentionally presented one-time recovery code.

OS mode explicitly challenges the user through Electron's
[Touch ID API](https://www.electronjs.org/docs/latest/api/system-preferences) before keychain
decryption. Automatic keychain access alone is not treated as authentication. Unsupported or
unavailable OS authentication does not silently downgrade an existing profile.

Locking revokes the session epoch immediately, destroys the financial renderer, and replaces
its memory-only partition. Old storage is cleared; a new renderer cannot reuse financial
localStorage or cached React state. One disposable security-state subscription controls the
React boundary, outside the accounts provider and all financial views. Revision checks ignore
late state snapshots. Data handlers reject late results and errors from a revoked epoch.

The lock waits for storage, setup/authentication operations, data IPC, and enrichment to settle
before allowing another unlock. Enrichment stops scheduling work, cancels retries, discards late
provider responses, and clears its run history. Already-started network requests may finish;
they cannot publish results after cancellation. Provider requests have a 15-second timeout.
The [OS-event adapter](https://www.electronjs.org/docs/latest/api/power-monitor/) never unlocks
automatically on resume. A single-instance guard avoids concurrent personal app processes.

The existing raw-SQLite recovery page is disabled for encrypted storage. A dedicated protected
recovery view now supports authenticated export while unlocked and independent restore while
locked, including fresh credential binding, recovery-code confirmation, and authenticated
next-launch selection with native consent. Lock/setup/unlock drain pending recovery. Actual
native-dialog and independent-device acceptance remains open. There is no temporary
plaintext working copy or unencrypted export fallback. Pre-upgrade encrypted snapshots remain
storage-level copies, not independently authenticated portable backups.

## Verification and limits

Automated tests cover setup, authentication denial, main-owned access checks, retained/late
request revocation, OS-event wiring, preload subscriptions, and financial-view mounting. The
packaged fixture uses the actual setup/unlock screens with synthetic passphrases, wrong recovery
input, wrong-password retry, account persistence, relock, and restart. It checks that ordinary
SQLite cannot read the book and that synthetic records/secrets do not appear in persisted
profile artifacts or process output. Another case preserves a legacy book byte-for-byte.
See the [readiness log](../personal-use-readiness.md) for final run counts.

The packaged runs do not invoke real Touch ID or exercise a user's keychain. OS authentication
and power events are mocked in their focused unit tests. Manual installed-build checks remain:

- [ ] Successful and cancelled Touch ID, unavailable keychain, and configured passphrase fallback.
- [ ] Real OS lock/suspend/user switch while requests and enrichment are pending.
- [ ] Portable encrypted backup, independent recovery on another profile/device, and legacy conversion.
- [ ] Interrupted setup recovery, durable credential replacement, and passphrase-change UI.
- [ ] Reviewed production diagnostics, dependency/security updates, and external key/storage review.

The live native database cipher is AES-256-CBC, not an authenticated backup format. JavaScript
strings and native key copies cannot be guaranteed erased from memory. These tests are not a
cryptographic audit and do not close the remaining readiness gates.
