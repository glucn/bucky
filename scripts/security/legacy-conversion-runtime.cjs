/* Synthetic checkout-service check under Electron's embedded Node. Not installed UI acceptance.
 * ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/security/legacy-conversion-runtime.cjs
 */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
process.env.NODE_ENV = "test";
require("ts-node").register({ transpileOnly: true });
const { initializePersonalDatabase, openSqlite, executeSql, closeSqlite } = require("../../src/services/localDatabase");
const { ProtectedProfileRestore, selectProtectedProfile } = require("../../src/services/protectedRestore");
const { readProtectedProfile } = require("../../src/services/protectedProfiles");
const { unlockWithPassphrase } = require("../../src/services/profileKeys");
const { createEncryptedPrisma } = require("../../src/services/encryptedDatabase");
const { createProtectedBackup, withVerifiedProtectedBackup } = require("../../src/services/protectedBackup");
const { readActiveProfile } = require("../../src/services/personalProfiles");

async function main() {
  assert.ok(process.versions.electron, "Run with Electron's embedded Node");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-legacy-runtime-"));
  const migrations = path.resolve("prisma/migrations");
  const source = path.join(directory, "profiles/default/book.sqlite");
  const passphrase = "Synthetic legacy runtime passphrase";
  const restore = new ProtectedProfileRestore(directory, migrations);
  let key;
  try {
    await initializePersonalDatabase(source, migrations);
    const legacy = await openSqlite(source);
    try {
      await executeSql(legacy, `INSERT INTO Account(id,name,type,subtype,currency,updatedAt)
        VALUES ('cash','Synthetic legacy cash','user','asset','CAD',CURRENT_TIMESTAMP),
          ('equity','Synthetic equity','equity','equity','CAD',CURRENT_TIMESTAMP);
        INSERT INTO JournalEntry(id,date,description,updatedAt) VALUES ('entry','2026-09-01','Synthetic entry',CURRENT_TIMESTAMP);
        INSERT INTO JournalLine(id,entryId,accountId,amount,currency) VALUES
          ('debit','entry','cash',72.12,'CAD'),('credit','entry','equity',-72.12,'CAD');`);
    } finally { await closeSqlite(legacy); }
    const before = await fs.readFile(source);
    const pending = await restore.beginLegacy({ source, passphrase, acknowledgePlaintext: true });
    await assert.rejects(restore.confirm(pending.restoreId, "incorrect code"));
    await restore.confirm(pending.restoreId, pending.recoverySecret);
    assert.equal(readActiveProfile(directory), "default");
    const profile = await readProtectedProfile(directory, pending.profileId);
    key = await unlockWithPassphrase(profile.envelope, passphrase, pending.profileId);
    const prisma = createEncryptedPrisma(profile.databaseFile, key);
    try { assert.equal((await prisma.journalLine.findUniqueOrThrow({ where: { id: "debit" } })).amount, 72.12); }
    finally { await prisma.$disconnect(); }
    const destination = path.join(directory, "converted.buckybackup");
    const backup = await createProtectedBackup({ source: profile.databaseFile, destination, migrations, dataKey: key, envelope: profile.envelope });
    assert.deepEqual(backup.summary, pending.summary);
    await withVerifiedProtectedBackup({ source: destination, stagingParent: directory, migrations,
      credential: { mode: "recovery", secret: pending.recoverySecret } }, async ({ summary }) => assert.deepEqual(summary, pending.summary));
    await selectProtectedProfile(directory, pending.profileId, key, migrations);
    assert.equal(readActiveProfile(directory), pending.profileId);
    assert.deepEqual(await fs.readFile(source), before);
    assert.equal((await fs.readFile(profile.databaseFile)).includes(Buffer.from("Synthetic legacy cash")), false);
    console.log("Legacy conversion runtime: confirmation, encrypted reopen, portable recovery, explicit selection, and preserved original passed");
  } finally { await restore.cancel(); key?.fill(0); await fs.rm(directory, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
