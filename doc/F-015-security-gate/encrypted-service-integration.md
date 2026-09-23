# Encrypted storage service integration

Implemented 2026-09-08 and connected to [authenticated personal launch](authenticated-launch.md)
as of 2026-09-23. New packaged profiles use encrypted storage; **F-015 remains incomplete**.
Existing plaintext books are refused, and the raw-SQLite recovery UI is disabled for encrypted
profiles until authenticated portable backup/restore is implemented.

## Connection contract

`databaseService.openEncryptedDatabase(absoluteFilename, migrationsDirectory, dataKey)` accepts
a 32-byte key from a trusted main-process caller. It closes the previous connection, applies
bundled migrations through encrypted storage, and publishes the Prisma connection only after
successful connection. It has no renderer IPC entry point and does not authenticate the caller.
The main-owned lock controller authenticates before calling it.
If close races with initialization, it cancels publication; the controller must also await the
in-progress open request before declaring migration/key teardown finished. A migration already
underway may finish its atomic transaction before that request settles.

Selecting encrypted storage disables ordinary `initialize()` for the lifetime of that service
instance. A failed unlock leaves the service closed; it cannot fall back to the development or
plaintext personal book. An explicit close cancels a concurrent unlock before publication.
`getRecoveryContext()` rejects encrypted mode so existing raw-SQLite recovery cannot accidentally
operate on it. This refusal is temporary until the protected recovery workflow is implemented.

Services retain a stable Prisma facade, not the underlying connection. Closing revokes access
before awaiting disconnection. Lazy queries, batch requests, retained transaction clients, and
pending results/errors are tied to their original session. They cannot implicitly reconnect or
deliver financial results after that session closes. Ordinary service/delegate references can
be reused after an explicit new unlock. Lifecycle methods and Prisma internals are not exposed
through the facade. This is a boundary for trusted application services, not a JavaScript sandbox.

The existing services, including retained references in liabilities and enrichment, run through
this facade. Both native development storage and the encrypted driver use the same service code.
The encrypted Prisma client disables query logging. Mutable key copies are cleared on exit;
JavaScript strings and driver-owned key copies cannot be reliably zeroized by this code.

## Migrations and snapshots

Native SQLite and encrypted libSQL share one migration-history/checksum validator and migration
runner. The libSQL implementation pins a write transaction rather than sending `BEGIN` through
a pool that could release and roll back its connection between calls. Migration DDL and history
writes commit together; failures roll back and retain the pre-upgrade snapshot.

New files are reserved with mode `0600`. Successful reopen restores private file permissions.
Untracked schemas, migration drift, wrong keys, non-regular database files, and plaintext books
are refused. There is no automatic conversion or plaintext fallback. Pre-upgrade `VACUUM INTO`
snapshots remain encrypted with the same data key and use exclusive destination reservation.
These snapshots are not yet independently recoverable authenticated portable backup artifacts.

## Dependencies and verification

The application pins Prisma/client/adapter to 6.11.1, enables `driverAdapters`, and explicitly
overrides the adapter's older declared client range with `@libsql/client` 0.18.0. The lockfile
resolves native `libsql` 0.5.29. The native cipher remains AES-256-CBC, not authenticated encryption.
See the [compatibility probe](encrypted-storage-compatibility.md) for the original selection
evidence and limitations. Recheck compatibility and the copied runtime dependency list on upgrades.

Run the same complete unit/service/renderer suite with both storage setups:

```bash
npm test -- --silent
npm run test:encrypted -- --silent
./node_modules/.bin/tsc --noEmit --pretty false
```

The encrypted setup creates a fresh encrypted database and random key per test file, applies
real migrations, then resets and exercises the actual service singleton. It does not change
`prisma/dev.db`, select a personal profile, or add an environment-based runtime encryption bypass.
Reset failures preserve their original cause and fixture instead of deleting another database
or silently changing drivers. Independent raw-SQLite recovery/lifecycle fixtures remain separate;
their passing tests do not establish encrypted recovery.

Package and verify on Apple Silicon macOS:

```bash
npm exec --yes --package=node@22 -- node node_modules/@electron-forge/cli/dist/electron-forge.js package --arch=arm64 --platform=darwin
./node_modules/.bin/playwright test --config playwright.packaged.config.ts --repeat-each=3
```

Check port 3000 before Playwright; never terminate an occupying process without approval.
The packaged suite contains three distinct checks:

- Launch the packaged app with isolated personal data, complete recovery-confirmed setup,
  unlock with a passphrase, verify encrypted persistence and security boundaries, explicitly
  relock, and restart locked. Wrong credentials leave data IPC unavailable.
- Refuse a legacy plaintext profile and preserve its bytes without opening it for financial use.
- Load **shipped ASAR dependencies** with development Electron's embedded Node, apply shipped
  migrations to a synthetic encrypted book, write/reopen with shipped Prisma, reject wrong-key
  reads, and assert that no dependency fell back to the checkout's `node_modules`. This checks
  packaged assets/native ABI, independently of the authenticated application workflow. It does not
  modify or bypass the installed application's security fuses.

## Remaining gates

The [protected provisioning controller](protected-profile-setup.md), setup view, authentication,
lock lifecycle, renderer-data clearing, and enrichment cancellation are now integrated.
Authenticated backup/restore and recoverable legacy conversion remain open.
Crash/disk-full recovery and real OS/user recovery
drills remain acceptance work. Full-suite success is compatibility evidence, not a cryptographic
audit or permission to use the application as the sole financial record.
