import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import { createClient } from "@libsql/client";
import { pathToFileURL } from "url";
import { withVerifiedLegacyConversion } from "./legacyConversion";
import { closeSqlite, executeSql, initializePersonalDatabase, openSqlite, querySql } from "./localDatabase";
import * as localDatabase from "./localDatabase";
import { validateEncryptedRecoveryDatabase } from "./protectedBackup";
import { createEncryptedPrisma } from "./encryptedDatabase";

const migrations = path.resolve("prisma/migrations");
let directory: string, source: string, stagingParent: string, key: Buffer;
const convert = <T>(action: Parameters<typeof withVerifiedLegacyConversion<T>>[1], signal?: AbortSignal) =>
  withVerifiedLegacyConversion({ source, stagingParent, migrations, dataKey: key, signal }, action);
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-legacy-conversion-"));
  source = path.join(directory, "legacy.sqlite"); stagingParent = path.join(directory, "staging");
  key = randomBytes(32); await fs.mkdir(stagingParent);
  await initializePersonalDatabase(source, migrations);
  const db = await openSqlite(source);
  try {
    await executeSql(db, `INSERT INTO Account(id,name,type,subtype,currency,updatedAt)
      VALUES ('cash','Private legacy cash','user','asset','CAD',CURRENT_TIMESTAMP),
        ('equity','Opening equity','equity','equity','CAD',CURRENT_TIMESTAMP);
      INSERT INTO JournalEntry(id,date,description,updatedAt) VALUES ('entry','2026-09-01','Private legacy entry',CURRENT_TIMESTAMP);
      INSERT INTO JournalLine(id,entryId,accountId,amount,currency)
        VALUES ('debit','entry','cash',123.45,'CAD'),('credit','entry','equity',-123.45,'CAD');`);
  } finally { await closeSqlite(db); }
});
afterEach(async () => { vi.restoreAllMocks(); key.fill(0); await fs.rm(directory, { recursive: true, force: true }); });

it("converts a consistent WAL snapshot directly to encrypted staging, preserves the original, and reopens through Prisma", async () => {
  const live = await openSqlite(source);
  let staged = "";
  try {
    await executeSql(live, "PRAGMA journal_mode=WAL; UPDATE Account SET name='Private WAL account' WHERE id='cash'");
    const before = await fs.readFile(source), wal = await fs.readFile(source + "-wal");
    const result = await convert(async ({ databaseFile, summary }) => {
      staged = databaseFile;
      expect(summary.balances).toContainEqual({ accountId: "cash", currency: "CAD", amount: 123.45 });
      expect(summary.tableCounts.JournalLine).toBe(2);
      expect(await validateEncryptedRecoveryDatabase(databaseFile, key, migrations)).toEqual(summary);
      expect((await fs.stat(databaseFile)).mode & 0o777).toBe(0o600);
      const plain = await openSqlite(databaseFile);
      try { await expect(querySql(plain, "SELECT name FROM Account")).rejects.toThrow(); }
      finally { await closeSqlite(plain); }
      const prisma = createEncryptedPrisma(databaseFile, key);
      try { expect((await prisma.account.findUniqueOrThrow({ where: { id: "cash" } })).name).toBe("Private WAL account"); }
      finally { await prisma.$disconnect(); }
      // A writer may keep using the old book; the conversion remains the validated snapshot.
      await executeSql(live, "UPDATE JournalLine SET amount=987.65 WHERE id='debit'");
      expect(summary.balances[0].amount).toBe(123.45);
      for (const filename of await fs.readdir(path.dirname(databaseFile))) {
        const bytes = await fs.readFile(path.join(path.dirname(databaseFile), filename));
        expect(bytes.includes(Buffer.from("Private"))).toBe(false);
      }
      return summary;
    });
    expect(result.tableCounts.Account).toBe(2);
    // The conversion itself did not rewrite/checkpoint the original main file or WAL prefix.
    expect(await fs.readFile(source)).toEqual(before);
    expect((await fs.readFile(source + "-wal")).subarray(0, wal.length)).toEqual(wal);
    expect(await querySql(live, "SELECT amount FROM JournalLine WHERE id='debit'")).toEqual([{ amount: 987.65 }]);
  } finally { await closeSqlite(live); }
  await expect(fs.stat(staged)).rejects.toThrow();
  expect(await fs.readdir(stagingParent)).toEqual([]);
});

it("preserves exact SQLite storage values including 64-bit integers, binary text, NULs, blobs, and round-trip doubles", async () => {
  const db = await openSqlite(source);
  try {
    await executeSql(db, `UPDATE Account SET name=CAST(X'610062ff' AS TEXT) WHERE id='cash';
      UPDATE _prisma_migrations SET started_at=9223372036854775806;
      UPDATE JournalLine SET amount=1.2345678901234567 WHERE id='debit';
      INSERT INTO AppSetting(key,jsonValue,updatedAt) VALUES ('blob',X'0001FF',CURRENT_TIMESTAMP);`);
  } finally { await closeSqlite(db); }
  await convert(async ({ databaseFile, summary }) => {
    const encrypted = createClient({ url: pathToFileURL(databaseFile).href, encryptionKey: key.toString("hex"), intMode: "bigint" });
    try {
      expect((await encrypted.execute("SELECT hex(name) value FROM Account WHERE id='cash'")).rows[0].value).toBe("610062FF");
      expect((await encrypted.execute("SELECT started_at FROM _prisma_migrations LIMIT 1")).rows[0].started_at).toBe(9223372036854775806n);
      expect((await encrypted.execute("SELECT amount FROM JournalLine WHERE id='debit'")).rows[0].amount).toBe(1.2345678901234567);
      expect((await encrypted.execute("SELECT typeof(jsonValue) type,hex(jsonValue) bytes FROM AppSetting WHERE key='blob'")).rows[0]).toMatchObject({ type: "blob", bytes: "0001FF" });
    } finally { encrypted.close(); }
    expect(await validateEncryptedRecoveryDatabase(databaseFile, key, migrations)).toEqual(summary);
  });
});

it.each(["corrupt", "history", "reference", "symlink"])("refuses %s input before releasing a converted book", async (kind) => {
  if (kind === "corrupt") await fs.writeFile(source, "damaged legacy book");
  else if (kind === "symlink") { const original = source; source = path.join(directory, "linked.sqlite"); await fs.symlink(original, source); }
  else {
    const db = await openSqlite(source);
    try { await executeSql(db, kind === "history" ? "UPDATE _prisma_migrations SET checksum='changed'" : "UPDATE JournalLine SET accountId='missing' WHERE id='debit'"); }
    finally { await closeSqlite(db); }
  }
  const before = await fs.readFile(source), action = vi.fn();
  await expect(convert(action)).rejects.toThrow();
  expect(action).not.toHaveBeenCalled(); expect(await fs.readFile(source)).toEqual(before);
  expect(await fs.readdir(stagingParent)).toEqual([]);
});

it("cleans encrypted partial output on interrupted copying without modifying the original", async () => {
  const before = await fs.readFile(source), query = localDatabase.querySql;
  let interrupted = false;
  vi.spyOn(localDatabase, "querySql").mockImplementation(async (db, sql, params) => {
    if (sql.includes('FROM "JournalLine"') && sql.includes("ORDER BY rowid")) {
      interrupted = true;
      expect((await fs.readdir(stagingParent)).length).toBe(1);
      throw new Error("Injected read failure");
    }
    return query(db, sql, params);
  });
  const action = vi.fn();
  await expect(convert(action)).rejects.toThrow(); expect(action).not.toHaveBeenCalled();
  expect(interrupted).toBe(true);
  expect(await fs.readFile(source)).toEqual(before); expect(await fs.readdir(stagingParent)).toEqual([]);
});

it("holds one source snapshot while another WAL writer commits changes during copying", async () => {
  const writer = await openSqlite(source);
  await executeSql(writer, "PRAGMA journal_mode=WAL");
  const query = localDatabase.querySql;
  let wrote = false;
  vi.spyOn(localDatabase, "querySql").mockImplementation(async (db, sql, params) => {
    if (!wrote && sql.includes("ORDER BY rowid")) {
      wrote = true;
      await executeSql(writer, "UPDATE JournalLine SET amount=456.78 WHERE id='debit'");
    }
    return query(db, sql, params);
  });
  try {
    await convert(async ({ summary }) => {
      expect(wrote).toBe(true);
      expect(summary.balances).toContainEqual({ accountId: "cash", currency: "CAD", amount: 123.45 });
      expect(await querySql(writer, "SELECT amount FROM JournalLine WHERE id='debit'")).toEqual([{ amount: 456.78 }]);
    });
  } finally { await closeSqlite(writer); }
});

it("removes reserved encrypted output on disk-full failure and can retry without touching the source", async () => {
  const before = await fs.readFile(source), open = fs.open;
  const fault = vi.spyOn(fs, "open").mockImplementation(async (filename, ...args) => {
    if (String(filename).includes(".legacy-conversion-") && String(filename).endsWith("book.sqlite")) {
      throw Object.assign(new Error("No space left"), { code: "ENOSPC" });
    }
    return (open as any)(filename, ...args);
  });
  const action = vi.fn(); await expect(convert(action)).rejects.toThrow();
  expect(action).not.toHaveBeenCalled(); expect(await fs.readdir(stagingParent)).toEqual([]);
  expect(await fs.readFile(source)).toEqual(before);
  fault.mockRestore();
  await convert(async ({ summary }) => expect(summary.tableCounts.Account).toBe(2));
});

it("observes cancellation during copying and cleans all owned staging before a retry", async () => {
  const query = localDatabase.querySql, abort = new AbortController();
  const fault = vi.spyOn(localDatabase, "querySql").mockImplementation(async (db, sql, params) => {
    if (sql.includes("ORDER BY rowid")) abort.abort();
    return query(db, sql, params);
  });
  const action = vi.fn(); await expect(convert(action, abort.signal)).rejects.toThrow();
  expect(action).not.toHaveBeenCalled(); expect(await fs.readdir(stagingParent)).toEqual([]);
  fault.mockRestore();
  await convert(async ({ summary }) => expect(summary.tableCounts.Account).toBe(2));
});

it("cleans staging on cancellation and callback failure, preserving the caller's key and the source", async () => {
  const before = await fs.readFile(source), keyBefore = Buffer.from(key), abort = new AbortController();
  abort.abort(); await expect(convert(vi.fn(), abort.signal)).rejects.toThrow();
  await expect(convert(async () => { throw new Error("consumer failed"); })).rejects.toThrow();
  expect(await fs.readdir(stagingParent)).toEqual([]);
  expect(await fs.readFile(source)).toEqual(before); expect(key).toEqual(keyBefore); keyBefore.fill(0);
});
