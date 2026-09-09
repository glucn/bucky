/* Exercise the shipped ASAR dependencies with Electron's native-module loader.
 * Uses the development Electron's RunAsNode mode; never changes installed-app fuses.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomBytes } = require("node:crypto");
const { createRequire } = require("node:module");

async function main() {
  assert.ok(process.versions.electron, "Run this check using Electron's embedded Node");
  const resources = path.resolve(process.argv[2] || "out/Bucky-darwin-arm64/Bucky.app/Contents/Resources");
  const asar = path.join(resources, "app.asar");
  const shipped = createRequire(path.join(asar, "package.json"));
  for (const name of ["@prisma/client", "@prisma/adapter-libsql", "@libsql/client"]) {
    assert.ok(shipped.resolve(name).startsWith(`${asar}${path.sep}`), `Missing shipped module: ${name}`);
  }
  process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(resources, "libquery_engine-darwin-arm64.dylib.node");
  const { PrismaClient } = shipped("@prisma/client");
  const { PrismaLibSQL } = shipped("@prisma/adapter-libsql");
  const { createClient } = shipped("@libsql/client");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-packaged-crypto-"));
  const key = randomBytes(32);
  let raw;
  let prisma;
  try {
    const filename = path.join(directory, "book.sqlite");
    const config = { url: pathToFileURL(filename).href, encryptionKey: key.toString("hex"), concurrency: 1 };
    raw = createClient(config);
    await raw.execute("PRAGMA foreign_keys=OFF");
    const tx = await raw.transaction("write");
    try {
      const migrations = path.join(resources, "migrations");
      for (const name of (await fs.readdir(migrations)).filter((name) => /^\d/.test(name)).sort()) {
        const sql = await fs.readFile(path.join(migrations, name, "migration.sql"), "utf8");
        await tx.executeMultiple(sql.replace(/^\s*PRAGMA\s+(?:defer_)?foreign_keys\s*=\s*(?:ON|OFF|0|1)\s*;/gim, ""));
      }
      await tx.commit();
    } finally { tx.close(); }
    raw.close();
    prisma = new PrismaClient({ adapter: new PrismaLibSQL(config), log: [] });
    const sentinel = "packaged-encrypted-account-c850";
    await prisma.account.create({ data: { id: "saved", name: sentinel, type: "user", currency: "CAD" } });
    await prisma.$disconnect();
    prisma = new PrismaClient({ adapter: new PrismaLibSQL(config), log: [] });
    assert.equal((await prisma.account.findUniqueOrThrow({ where: { id: "saved" } })).name, sentinel);
    await prisma.$disconnect();
    assert.equal((await fs.readFile(filename)).includes(Buffer.from(sentinel)), false);
    const wrong = createClient({ ...config, encryptionKey: randomBytes(32).toString("hex") });
    try { await assert.rejects(wrong.execute("SELECT name FROM Account")); }
    finally { wrong.close(); }
    // A missing copied dependency must not be concealed by the surrounding checkout's modules.
    assert.deepEqual(Object.keys(require.cache).filter((file) => file.includes(`${path.sep}node_modules${path.sep}`)
      && !file.startsWith(`${asar}${path.sep}`) && !file.startsWith(`${asar}.unpacked${path.sep}`)), []);
    console.log("Packaged encrypted runtime: migrations, write, reopen, wrong-key rejection, no host dependency fallback passed");
  } finally {
    await prisma?.$disconnect();
    raw?.close();
    key.fill(0);
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
