/* Isolated compatibility proof. Never opens the application's dev/test/personal databases. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "../..");
const dependencyRoot = path.resolve(process.argv[2] || path.join(__dirname, "libsql-probe"));
const candidateRequire = createRequire(path.join(dependencyRoot, "package.json"));
const { createClient } = candidateRequire("@libsql/client");
const { PrismaLibSQL } = candidateRequire("@prisma/adapter-libsql");
const sqlite3 = require(path.join(root, "node_modules/sqlite3"));
const sentinel = "BUCKY_ENCRYPTED_PROBE_PRIVATE_RECORD_6e66337e";
let passed = 0;
async function check(name, action) {
  await action();
  passed++;
  process.stdout.write(`PASS ${name}\n`);
}

async function main() {
  // The generated client resolves the existing, pinned Prisma runtime through node_modules.
  const directory = await fs.mkdtemp(path.join(root, "node_modules/.bucky-encrypted-probe-"));
  const book = path.join(directory, "encrypted.sqlite");
  const key = crypto.randomBytes(32).toString("hex");
  const config = { url: `file:${book}`, encryptionKey: key, concurrency: 1, timeout: 1000 };
  let client;
  let prisma;
  try {
    const schema = (await fs.readFile(path.join(root, "prisma/schema.prisma"), "utf8"))
      .replace(/generator client\s*\{[^}]*\}/, `generator client {
        provider = "prisma-client-js"
        previewFeatures = ["driverAdapters"]
        output = ${JSON.stringify(path.join(directory, "client"))}
      }`);
    const schemaPath = path.join(directory, "schema.prisma");
    await fs.writeFile(schemaPath, schema);
    execFileSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "generate", "--schema", schemaPath],
      { cwd: root, stdio: "pipe" });
    const { PrismaClient } = require(path.join(directory, "client"));

    await check("encrypted driver applies all bundled migrations atomically", async () => {
      client = createClient(config);
      await client.execute("PRAGMA foreign_keys=OFF");
      const tx = await client.transaction("write");
      try {
        const migrations = path.join(root, "prisma/migrations");
        for (const name of (await fs.readdir(migrations)).filter((name) => /^\d/.test(name)).sort()) {
          const sql = (await fs.readFile(path.join(migrations, name, "migration.sql"), "utf8"))
            .replace(/^\s*PRAGMA\s+(?:defer_)?foreign_keys\s*=\s*(?:ON|OFF|0|1)\s*;/gim, "");
          await tx.executeMultiple(sql);
        }
        await tx.commit();
      } catch (error) { await tx.rollback(); throw error; }
      finally { tx.close(); }
      const integrity = await client.execute("PRAGMA integrity_check");
      assert.equal(integrity.rows[0][0], "ok");
      assert.equal((await client.execute("PRAGMA foreign_key_check")).rows.length, 0);
    });

    await check("Prisma reads and writes the encrypted book with dates, floats, enums, and relations", async () => {
      prisma = new PrismaClient({ adapter: new PrismaLibSQL(config), log: [] });
      await prisma.$connect();
      await prisma.account.create({ data: { id: "cash", name: sentinel, type: "user", subtype: "asset", currency: "CAD" } });
      await prisma.account.create({ data: { id: "equity", name: "Counterparty", type: "category", subtype: "asset", currency: "CAD" } });
      await prisma.journalEntry.create({ data: { id: "entry", date: "2026-09-08", description: sentinel,
        lines: { create: [{ accountId: "cash", amount: 123.45, currency: "CAD" },
          { accountId: "equity", amount: -123.45, currency: "CAD" }] } } });
      const account = await prisma.account.findUnique({ where: { id: "cash" }, include: { lines: true } });
      assert.equal(account.name, sentinel);
      assert.equal(account.lines[0].amount, 123.45);
      assert.ok(account.createdAt instanceof Date);
      assert.equal(account.type, "user");
    });

    await check("native-driver millisecond timestamps remain compatible with Prisma dates", async () => {
      const date = new Date("2024-03-01T12:34:56.789Z");
      await client.execute({ sql: "UPDATE Account SET createdAt=? WHERE id='cash'", args: [date.getTime()] });
      assert.equal((await prisma.account.findUnique({ where: { id: "cash" } })).createdAt.toISOString(), date.toISOString());
    });

    await check("Prisma interactive and batch transactions roll back without partial writes", async () => {
      await assert.rejects(prisma.$transaction(async (tx) => {
        await tx.account.update({ where: { id: "cash" }, data: { name: "MUST_ROLL_BACK" } });
        await tx.journalLine.updateMany({ where: { accountId: "cash" }, data: { amount: 999 } });
        throw new Error("injected failure");
      }), /injected failure/);
      assert.equal((await prisma.account.findUnique({ where: { id: "cash" } })).name, sentinel);
      assert.equal((await prisma.journalLine.findFirst({ where: { accountId: "cash" } })).amount, 123.45);
      await assert.rejects(prisma.$transaction([
        prisma.account.update({ where: { id: "cash" }, data: { name: "MUST_ROLL_BACK" } }),
        prisma.account.create({ data: { id: "cash", name: "duplicate", type: "user", subtype: "asset" } }),
      ]), { code: "P2002" });
      assert.equal((await prisma.account.findUnique({ where: { id: "cash" } })).name, sentinel);
    });

    await check("failed DDL migration rolls back schema and record edits", async () => {
      const tx = await client.transaction("write");
      try {
        await assert.rejects(tx.executeMultiple("CREATE TABLE MustRollBack(id TEXT); UPDATE Account SET name='bad'; INSERT INTO Missing VALUES(1);"));
        await tx.rollback();
      } finally { tx.close(); }
      assert.equal((await client.execute("SELECT name FROM sqlite_master WHERE name='MustRollBack'")).rows.length, 0);
      assert.equal((await prisma.account.findUnique({ where: { id: "cash" } })).name, sentinel);
    });

    await check("the live database and WAL do not persist plaintext financial records", async () => {
      await client.execute("PRAGMA journal_mode=WAL");
      await prisma.account.update({ where: { id: "cash" }, data: { name: sentinel + "_WAL" } });
      const names = (await fs.readdir(directory)).filter((name) => name.startsWith("encrypted.sqlite"));
      assert.ok(names.includes("encrypted.sqlite"));
      assert.ok(names.includes("encrypted.sqlite-wal"), "the probe must inspect a live WAL, not only the main file");
      for (const name of names) {
        const bytes = await fs.readFile(path.join(directory, name));
        assert.equal(bytes.includes(Buffer.from(sentinel)), false, `plaintext sentinel in ${name}`);
      }
      assert.notEqual((await fs.readFile(book)).subarray(0, 16).toString(), "SQLite format 3\0");
    });

    await check("ordinary SQLite and incorrect keys cannot read the encrypted database", async () => {
      const plain = new sqlite3.Database(book, sqlite3.OPEN_READONLY);
      try {
        await assert.rejects(new Promise((resolve, reject) => plain.all("SELECT * FROM Account", (error, rows) => error ? reject(error) : resolve(rows))));
      } finally { await new Promise((resolve, reject) => plain.close((error) => error ? reject(error) : resolve())); }
      await assert.rejects(async () => {
        let wrong;
        try { wrong = createClient({ ...config, encryptionKey: crypto.randomBytes(32).toString("hex") }); await wrong.execute("SELECT * FROM Account"); }
        finally { wrong?.close(); }
      });
    });

    await check("VACUUM snapshots stay encrypted and restore into a separate book", async () => {
      const backup = path.join(directory, "backup.sqlite");
      await client.execute({ sql: "VACUUM INTO ?", args: [backup] });
      const bytes = await fs.readFile(backup);
      assert.equal(bytes.includes(Buffer.from(sentinel)), false, "VACUUM backup leaked plaintext records");
      assert.notEqual(bytes.subarray(0, 16).toString(), "SQLite format 3\0", "VACUUM backup is plaintext");
      const restored = createClient({ ...config, url: `file:${backup}` });
      try {
        assert.equal((await restored.execute("SELECT name FROM Account WHERE id='cash'")).rows[0][0], sentinel + "_WAL");
        assert.equal((await restored.execute("SELECT SUM(amount) FROM JournalLine WHERE accountId='cash'")).rows[0][0], 123.45);
      } finally { restored.close(); }
    });

    await check("encrypted records and balances survive closing every connection and reopening", async () => {
      await prisma.$disconnect(); prisma = undefined;
      client.close(); client = undefined;
      prisma = new PrismaClient({ adapter: new PrismaLibSQL(config), log: [] });
      assert.equal((await prisma.account.findUnique({ where: { id: "cash" } })).name, sentinel + "_WAL");
      assert.equal((await prisma.journalLine.aggregate({ where: { accountId: "cash" }, _sum: { amount: true } }))._sum.amount, 123.45);
    });
    process.stdout.write(`Verified ${passed} encrypted-storage compatibility checks on Node ${process.versions.node}.\n`);
  } finally {
    await prisma?.$disconnect();
    client?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
