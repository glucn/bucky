/* Synthetic checkout-service check, not installed/native-dialog acceptance. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
process.env.NODE_ENV = "test";
require("ts-node").register({ transpileOnly: true });
const { createClient } = require("@libsql/client");
const { ProtectedProfileSetup, readProtectedProfile, inspectProtectedProfile } = require("../../src/services/protectedProfiles");
const { ProtectedProfileRestore, selectProtectedProfile } = require("../../src/services/protectedRestore");
const { listInterruptedProfiles, preserveInterruptedSetup } = require("../../src/services/interruptedProfiles");
const { unlockWithRecovery, unlockWithPassphrase } = require("../../src/services/profileKeys");
const { createEncryptedPrisma } = require("../../src/services/encryptedDatabase");

async function main() {
  assert.ok(process.versions.electron, "Run with Electron's embedded Node");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-interrupted-runtime-"));
  const migrations = path.resolve("prisma/migrations"), passphrase = "Synthetic interrupted runtime passphrase";
  const restore = new ProtectedProfileRestore(directory, migrations);
  let key, live, recoveredKey;
  try {
    const setup = new ProtectedProfileSetup(directory, migrations);
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase });
    await setup.confirm(pending.setupId, pending.recoverySecret);
    const original = await readProtectedProfile(directory);
    key = unlockWithRecovery(original.envelope, pending.recoverySecret, "default");
    const artifactId = ".creating-default-runtime";
    const source = path.join(directory, "profiles", artifactId);
    await fs.rename(path.dirname(original.databaseFile), source);
    await fs.mkdir(path.join(directory, "profiles", ".setup-default.lock"));
    live = createClient({ url: pathToFileURL(path.join(source, "book.sqlite")).href, encryptionKey: key.toString("hex") });
    await live.execute("PRAGMA journal_mode=WAL");
    await live.execute("INSERT INTO Account(id,name,type,subtype,currency,updatedAt) VALUES('saved','Synthetic interrupted WAL account','user','asset','CAD',CURRENT_TIMESTAMP)");
    const before = await fs.readFile(path.join(source, "book.sqlite")), wal = await fs.readFile(path.join(source, "book.sqlite-wal"));
    assert.equal((await listInterruptedProfiles(directory)).find((item) => item.id === artifactId).canAttemptRecovery, true);
    const recovered = await restore.beginInterrupted({ artifactId, acknowledgeSnapshot: true,
      credential: { mode: "recovery", secret: pending.recoverySecret }, passphrase });
    await assert.rejects(restore.confirm(recovered.restoreId, pending.recoverySecret));
    await restore.confirm(recovered.restoreId, recovered.recoverySecret);
    assert.deepEqual(await fs.readFile(path.join(source, "book.sqlite")), before);
    assert.deepEqual(await fs.readFile(path.join(source, "book.sqlite-wal")), wal);
    live.close(); live = undefined;
    const preservedBefore = await fs.readFile(path.join(source, "book.sqlite"));
    const preserved = await preserveInterruptedSetup({ userData: directory, expectedIds: [artifactId, ".setup-default.lock"] });
    const archivedId = preserved.find((item) => item.originalId === artifactId).preservedId;
    assert.deepEqual(await fs.readFile(path.join(directory, "profiles", archivedId, "book.sqlite")), preservedBefore);
    assert.equal((await inspectProtectedProfile(directory)).kind, "missing");
    const profile = await readProtectedProfile(directory, recovered.profileId);
    recoveredKey = await unlockWithPassphrase(profile.envelope, passphrase, recovered.profileId);
    const prisma = createEncryptedPrisma(profile.databaseFile, recoveredKey);
    try { assert.equal((await prisma.account.findUniqueOrThrow({ where: { id: "saved" } })).name, "Synthetic interrupted WAL account"); }
    finally { await prisma.$disconnect(); }
    await selectProtectedProfile(directory, recovered.profileId, recoveredKey, migrations);
    console.log("Interrupted runtime: WAL snapshot, recovery confirmation, encrypted reopen, preserved source/archive, and explicit selection passed");
  } finally { live?.close(); key?.fill(0); recoveredKey?.fill(0); await restore.cancel(); await fs.rm(directory, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
