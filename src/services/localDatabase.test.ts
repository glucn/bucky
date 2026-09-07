import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import sqlite3 from "sqlite3";
import { initializePersonalDatabase, resolveDatabaseFile } from "./localDatabase";

const migrations = path.resolve("prisma/migrations");
let directory: string;
let filename: string;

async function sql(statement: string, file = filename): Promise<any[]> {
  const db = new sqlite3.Database(file);
  try {
    return await new Promise<any[]>((resolve, reject) => db.all(statement, (error, rows) =>
      error ? reject(error) : resolve(rows)));
  } finally {
    await new Promise<void>((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
  }
}

describe("Personal database lifecycle", () => {
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-lifecycle-"));
    filename = path.join(directory, "personal", "book.sqlite");
  });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

  it("keeps packaged personal data independent of cwd and test/development files", () => {
    expect(resolveDatabaseFile({ isPackaged: true, userData: directory, cwd: "/arbitrary", env: {} }))
      .toBe(path.join(directory, "profiles", "default", "book.sqlite"));
    expect(resolveDatabaseFile({ isPackaged: false, cwd: directory, env: { NODE_ENV: "test" } }))
      .toBe(path.join(directory, "prisma", "test.db"));
    expect(resolveDatabaseFile({ isPackaged: false, cwd: directory, env: {} }))
      .toBe(path.join(directory, "prisma", "dev.db"));
  });

  it("does not let inherited test environment variables redirect a packaged personal app", () => {
    expect(resolveDatabaseFile({ isPackaged: true, userData: directory, cwd: "/arbitrary",
      env: { NODE_ENV: "test", VITEST: "true" } })).toContain("profiles/default/book.sqlite");
  });

  it("initializes an empty personal database and reopens it without reseeding or changing records", async () => {
    await initializePersonalDatabase(filename, migrations);
    await sql(`INSERT INTO Account (id,name,type,subtype,currency,updatedAt)
      VALUES ('personal-account','My account','user','asset','CAD',CURRENT_TIMESTAMP)`);
    await initializePersonalDatabase(filename, migrations);
    expect(await sql("SELECT name,currency FROM Account WHERE id='personal-account'"))
      .toEqual([{ name: "My account", currency: "CAD" }]);
    expect((await sql("PRAGMA integrity_check"))[0].integrity_check).toBe("ok");
    expect(await sql("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("backs up before an upgrade and preserves existing records", async () => {
    const partial = path.join(directory, "old-migrations");
    const names = (await fs.readdir(migrations)).filter((name) => /^\d/.test(name)).sort();
    for (const name of names.slice(0, -1)) {
      await fs.cp(path.join(migrations, name), path.join(partial, name), { recursive: true });
    }
    await initializePersonalDatabase(filename, partial);
    await sql(`INSERT INTO Account (id,name,type,subtype,currency,updatedAt)
      VALUES ('keep','Keep through upgrade','user','asset','CAD',CURRENT_TIMESTAMP)`);
    const result = await initializePersonalDatabase(filename, migrations);
    expect(result.backupPath).toBeTruthy();
    expect(await sql("SELECT name FROM Account WHERE id='keep'"))
      .toEqual([{ name: "Keep through upgrade" }]);
    expect(await sql("SELECT name FROM Account WHERE id='keep'", result.backupPath!))
      .toEqual([{ name: "Keep through upgrade" }]);
  });

  it("rolls back an unsuccessful migration and leaves a recoverable pre-upgrade snapshot", async () => {
    await initializePersonalDatabase(filename, migrations);
    const broken = path.join(directory, "broken-migrations");
    await fs.cp(migrations, broken, { recursive: true });
    const extra = path.join(broken, "20990101000000_broken");
    await fs.mkdir(extra);
    await fs.writeFile(path.join(extra, "migration.sql"),
      "CREATE TABLE MustRollBack(id TEXT); INSERT INTO MissingTable VALUES (1);");
    await expect(initializePersonalDatabase(filename, broken)).rejects.toThrow();
    expect(await sql("SELECT name FROM sqlite_master WHERE name='MustRollBack'")) .toEqual([]);
    expect(await sql("SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%broken'"))
      .toEqual([]);
    const backups = await fs.readdir(path.join(path.dirname(filename), "backups"));
    expect(backups.some((name) => name.endsWith(".sqlite"))).toBe(true);
  });

  it("refuses untracked existing schemas without altering them", async () => {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await sql("CREATE TABLE ExistingPersonalRecords (id TEXT)");
    const before = await fs.readFile(filename);
    await expect(initializePersonalDatabase(filename, migrations)).rejects.toThrow(/untracked/i);
    expect(await fs.readFile(filename)).toEqual(before);
  });

  it("refuses edited or missing applied migrations", async () => {
    await initializePersonalDatabase(filename, migrations);
    await sql("UPDATE _prisma_migrations SET checksum='changed' WHERE migration_name LIKE '%init'");
    await expect(initializePersonalDatabase(filename, migrations)).rejects.toThrow(/checksum/i);
  });
});
