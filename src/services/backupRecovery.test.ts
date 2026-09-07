import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createBackup, restoreBackup, selectProfile, listProfiles } from "./backupRecovery";
import { closeSqlite, executeSql, initializePersonalDatabase, openSqlite, querySql, resolveDatabaseFile } from "./localDatabase";
import * as localDatabase from "./localDatabase";

const migrations = path.resolve("prisma/migrations");
let directory: string;
let book: string;
let backup: string;

async function modify(file: string, sql: string) {
  const db = await openSqlite(file);
  try { await executeSql(db, sql); } finally { await closeSqlite(db); }
}

describe("Backup and recovery", () => {
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-recovery-"));
    book = path.join(directory, "profiles/default/book.sqlite");
    backup = path.join(directory, "export/book.sqlite");
    await initializePersonalDatabase(book, migrations);
    await modify(book, `INSERT INTO Account(id,name,type,subtype,currency,updatedAt)
      VALUES ('cash','Cash','user','asset','CAD',CURRENT_TIMESTAMP),
             ('equity','Opening equity','equity','equity','CAD',CURRENT_TIMESTAMP);
      INSERT INTO JournalEntry(id,date,description,updatedAt) VALUES ('entry',CURRENT_TIMESTAMP,'Opening',CURRENT_TIMESTAMP);
      INSERT INTO JournalLine(id,entryId,accountId,amount,currency)
      VALUES ('debit','entry','cash',123.45,'CAD'),('credit','entry','equity',-123.45,'CAD');`);
  });
  afterEach(async () => { vi.restoreAllMocks(); await fs.rm(directory, { recursive: true, force: true }); });

  it("backs up committed WAL records, restores every record and balance into a new profile, and preserves the live book", async () => {
    const live = await openSqlite(book);
    try {
      await executeSql(live, "PRAGMA journal_mode=WAL; UPDATE Account SET name='WAL cash' WHERE id='cash'");
      const saved = await createBackup(book, backup, migrations);
      expect(saved.summary.tableCounts.Account).toBe(2);
      expect(saved.summary.balances).toContainEqual({ accountId: "cash", currency: "CAD", amount: 123.45 });
      await executeSql(live, "UPDATE Account SET name='Changed after backup' WHERE id='cash'");
      const restored = await restoreBackup(backup, directory, migrations);
      expect(restored.summary).toEqual(saved.summary);
      expect(restored.profileId).toMatch(/^restored-/);
      expect(restored.path).not.toBe(book);
      expect(await querySql(live, "SELECT name FROM Account WHERE id='cash'"))
        .toEqual([{ name: "Changed after backup" }]);
      const copy = await openSqlite(restored.path);
      try { expect(await querySql(copy, "SELECT name FROM Account WHERE id='cash'"))
        .toEqual([{ name: "WAL cash" }]); } finally { await closeSqlite(copy); }
      expect((await fs.stat(backup)).mode & 0o777).toBe(0o600);
      expect((await fs.stat(restored.path)).mode & 0o777).toBe(0o600);
    } finally { await closeSqlite(live); }
  });

  it("never overwrites an existing backup, even an empty file", async () => {
    await fs.mkdir(path.dirname(backup));
    await fs.writeFile(backup, "");
    await expect(createBackup(book, backup, migrations)).rejects.toThrow();
    expect(await fs.readFile(backup, "utf8")).toBe("");
  });

  it("refuses backup over the live book without changing it", async () => {
    const before = await fs.readFile(book);
    await expect(createBackup(book, book, migrations)).rejects.toThrow();
    expect(await fs.readFile(book)).toEqual(before);
  });

  it.each(["corrupt", "untracked", "history", "schema", "foreign-key"])("rejects %s backups and leaves no restorable partial profile", async (kind) => {
    await createBackup(book, backup, migrations);
    if (kind === "corrupt") await fs.writeFile(backup, "not a SQLite database");
    if (kind === "untracked") await modify(backup, "DROP TABLE _prisma_migrations");
    if (kind === "history") await modify(backup, "UPDATE _prisma_migrations SET checksum='bad'");
    if (kind === "schema") await modify(backup, "DROP TABLE AppSetting");
    if (kind === "foreign-key") await modify(backup, "DELETE FROM Account WHERE id='cash'");
    const before = await fs.readFile(book);
    const sourceBefore = await fs.readFile(backup);
    await expect(restoreBackup(backup, directory, migrations)).rejects.toThrow();
    expect(await listProfiles(directory)).toEqual([{ id: "default" }]);
    expect(await fs.readFile(book)).toEqual(before);
    expect(await fs.readFile(backup)).toEqual(sourceBefore);
  });

  it("rejects an older backup with a clear compatibility error and never migrates the source", async () => {
    await createBackup(book, backup, migrations);
    await modify(backup, "DELETE FROM _prisma_migrations WHERE migration_name=(SELECT MAX(migration_name) FROM _prisma_migrations)");
    const before = await fs.readFile(backup);
    await expect(restoreBackup(backup, directory, migrations)).rejects.toThrow(/matching app version/i);
    expect(await fs.readFile(backup)).toEqual(before);
  });

  it("selects only validated profiles for the next launch and can return to the original", async () => {
    await createBackup(book, backup, migrations);
    const restored = await restoreBackup(backup, directory, migrations);
    const options = { isPackaged: true, userData: directory, cwd: "/elsewhere", env: { VITEST: "true" } };
    expect(resolveDatabaseFile(options)).toBe(book);
    await selectProfile(directory, restored.profileId, migrations);
    expect(resolveDatabaseFile(options)).toBe(restored.path);
    await selectProfile(directory, "default", migrations);
    expect(resolveDatabaseFile(options)).toBe(book);
    await expect(selectProfile(directory, "../../outside", migrations)).rejects.toThrow();
    await expect(selectProfile(directory, "restored-missing", migrations)).rejects.toThrow();
    expect(resolveDatabaseFile(options)).toBe(book);
  });

  it("fails closed for a missing selected profile instead of silently creating an empty book", async () => {
    await fs.writeFile(path.join(directory, "active-profile.json"), JSON.stringify({ id: "restored-missing" }));
    expect(() => resolveDatabaseFile({ isPackaged: true, userData: directory, cwd: directory, env: {} })).toThrow();
  });

  it("detects a changed record even when table counts and balances still match", async () => {
    await createBackup(book, backup, migrations);
    const snapshot = localDatabase.snapshotSqlite;
    vi.spyOn(localDatabase, "snapshotSqlite").mockImplementationOnce(async (db, destination) => {
      await snapshot(db, destination);
      await modify(destination, "UPDATE Account SET name='Unexpected change' WHERE id='cash'");
    });
    await expect(restoreBackup(backup, directory, migrations)).rejects.toThrow(/record verification/i);
    expect(await listProfiles(directory)).toEqual([{ id: "default" }]);
  });

  it("includes text after embedded NUL characters in the record comparison", async () => {
    await modify(book, "UPDATE Account SET name=CAST(X'61626300646566' AS TEXT) WHERE id='cash'");
    await createBackup(book, backup, migrations);
    const snapshot = localDatabase.snapshotSqlite;
    vi.spyOn(localDatabase, "snapshotSqlite").mockImplementationOnce(async (db, destination) => {
      await snapshot(db, destination);
      await modify(destination, "UPDATE Account SET name=CAST(X'61626300676869' AS TEXT) WHERE id='cash'");
    });
    await expect(restoreBackup(backup, directory, migrations)).rejects.toThrow(/record verification/i);
  });

  it("cleans up an interrupted restore without changing the backup or selected profile", async () => {
    await createBackup(book, backup, migrations);
    const before = await fs.readFile(backup);
    vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("Disk unavailable"));
    await expect(restoreBackup(backup, directory, migrations)).rejects.toThrow("Disk unavailable");
    expect(await fs.readdir(path.join(directory, "profiles"))).toEqual(["default"]);
    expect(await fs.readFile(backup)).toEqual(before);
  });

  it("rejects symlink backup destinations and profiles outside application storage", async () => {
    await fs.mkdir(path.dirname(backup));
    await fs.symlink(book, backup);
    await expect(createBackup(book, backup, migrations)).rejects.toThrow();
    const outside = path.join(directory, "external");
    await fs.mkdir(outside);
    await fs.copyFile(book, path.join(outside, "book.sqlite"));
    await fs.symlink(outside, path.join(directory, "profiles/restored-link"));
    await expect(selectProfile(directory, "restored-link", migrations)).rejects.toThrow();
    expect(await listProfiles(directory)).toEqual([{ id: "default" }]);
  });
});
