# Encrypted SQLite Compatibility Probe

Verified 2026-09-08 on Apple Silicon macOS. This is evidence for an implementation path,
**not an enabled application feature or completion of F-015**.

## Candidate and dependency boundaries

The isolated probe uses Prisma's `@prisma/adapter-libsql` 6.11.1, `@libsql/client` 0.18.0,
and the lockfile-resolved native `libsql` 0.5.29 binding. The adapter is the same version as
the app's Prisma client. The generated probe client enables `driverAdapters` without modifying
the production schema or generated client.

The adapter declares support for older libSQL client versions, so the probe has an explicit
override to 0.18.0. Passing these checks establishes compatibility only for the exercised paths,
not general upstream support for that override. Review it again on dependency upgrades and
run the full application/service suite through the adapter before enabling it for real books.

libSQL documents local-file encryption through `encryptionKey`; no server, remote URL, auth
token, cloud account, or sync configuration is used by the probe.
[Turso TypeScript reference](https://docs.turso.tech/sdk/ts/reference)

The installed native binding's `index.js` defaults `encryptionCipher` to `aes256cbc`. Do not infer
authenticated encryption from the name or from SQLite integrity checks. Portable backup and key
envelopes still require authenticated encryption and tamper tests under SEC-04/SEC-05. This probe
is not a cryptographic audit and does not yet select a permanent on-disk format.

## Reproduce

From the repository root, install only the probe's isolated dependencies:

```bash
npm ci --prefix scripts/security/libsql-probe --ignore-scripts --no-audit --no-fund
node scripts/security/encrypted-storage-probe.cjs
```

The package has a separate lockfile and does not change the app's dependencies. The script
generates a temporary client and database beneath a newly created, private
`node_modules/.bucky-encrypted-probe-*` directory, then removes that directory in `finally`.
It does not open `prisma/dev.db`, `prisma/test.db`, or any personal profile. All keys and records
are synthetic. An interrupted/killed process may leave a disposable probe directory for diagnosis.

Additional runtimes tested:

```bash
npm exec --yes --package=node@22 -- node scripts/security/encrypted-storage-probe.cjs
ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/security/encrypted-storage-probe.cjs
```

The Electron command uses the development Electron executable only to test its embedded Node
and native-module ABI. It is **not** a packaged-app smoke test and does not weaken the packaged
`RunAsNode` fuse.

## Observed results

Nine checks passed on each runtime: Node 26.8.1, Node 22.23.2, and Electron's Node 18.18.2.

1. All 18 bundled migration scripts apply inside an encrypted write transaction; SQLite integrity
   and declared foreign-key checks pass afterward.
2. The generated Prisma client reads/writes encrypted accounts and journal entries, including
   relations, enums, dates, and floating-point amounts.
3. Native-driver millisecond timestamps remain readable as Prisma `Date` values.
4. Interactive and batch transactions roll back without partial updates; duplicate primary keys
   retain Prisma's `P2002` error code.
5. An injected failed DDL migration rolls back schema creation and record changes.
6. The live main database and an asserted-present WAL contain no plaintext sentinel record;
   the main file does not have a standard SQLite header.
7. Ordinary SQLite and an incorrect encryption key cannot read the book.
8. `VACUUM INTO` produces an encrypted snapshot that opens separately with the same key and
   returns the saved records and balance without a plaintext intermediate.
9. Closing all connections and reopening preserves the saved records and balance.

The tests deliberately fail on any violated assertion; they do not substitute an unencrypted
connection when encryption is unavailable. They also do not prove that every possible sensitive
value is absent from every possible artifact merely because one sentinel is absent.

## Next implementation work

Update 2026-09-08: [service integration](encrypted-service-integration.md) now covers the complete
service suite, shared encrypted migrations/snapshots, revocable sessions, and packaged dependencies.
The probe above remains independently reproducible. The remaining activation work is listed below.

- Keep unencrypted development/test storage isolated; do not convert existing personal data automatically.
- Implement reviewed key wrapping, independent recovery credentials, authenticated portable
  backup envelopes, and tamper/failure tests.
- Add main-owned authentication/locking and delay every personal database connection until unlock.
- Move all backup/restore checks onto the encrypted connection path. Initialization, migration
  history, and pre-upgrade snapshots now support encrypted storage; the raw `sqlite3` recovery
  path still cannot read these encrypted files and is denied in encrypted service mode.
- Verify crash recovery, concurrent mutations, cross-version upgrades, encrypted migration
  rollback, legacy conversion, and the full installed-app workflow. The current probe covers
  representative operations, not those complete acceptance scenarios.

See [F-015 requirements](requirements.md) for the full gate; SEC-01 through SEC-06 remain open.
