import type { RecoverySummary } from "../shared/recovery";
import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import sqlite3 from "sqlite3";
import { pathToFileURL } from "url";
import { createClient, type InValue, type Client, type Transaction } from "@libsql/client";
import { closeSqlite, executeSql, openSqlite, querySql } from "./localDatabase";
import { initializeEncryptedDatabase } from "./encryptedDatabase";
import { validateRecoveryDatabase } from "./recoveryValidation";
import { validateEncryptedRecoveryDatabase } from "./protectedBackup";
import { syncPath } from "./protectedProfiles";

type Options = { source: string; stagingParent: string; migrations: string; dataKey: Buffer; signal?: AbortSignal };
type Converted = { databaseFile: string; summary: RecoverySummary };

/** Trusted-process primitive. Never publishes, selects, or writes to the plaintext source. */
export async function withVerifiedLegacyConversion<T>(options: Options, action: (converted: Converted) => Promise<T>): Promise<T> {
  const { source, stagingParent, migrations, dataKey, signal } = options;
  if (!path.isAbsolute(source) || !path.isAbsolute(stagingParent) || !Buffer.isBuffer(dataKey) || dataKey.length !== 32) throw new Error("Invalid legacy conversion context");
  signal?.throwIfAborted();
  // Reject links, devices, and encrypted/corrupt files before opening SQLite. The trusted caller
  // owns the parent path; this primitive never accepts a renderer-provided URL or destination.
  const file = await fs.open(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await file.stat()).isFile()) throw new Error("Legacy source must be a regular file");
    const header = Buffer.alloc(16); await file.read(header, 0, 16, 0);
    if (!header.equals(Buffer.from("SQLite format 3\0"))) throw new Error("Legacy source is not a plaintext SQLite book");
  } finally { await file.close(); }
  const sourceDb = await openSqlite(source, sqlite3.OPEN_READONLY);
  let staging: string | undefined, target: Client | undefined, tx: Transaction | undefined;
  try {
    await executeSql(sourceDb, "PRAGMA query_only=ON; BEGIN;");
    const summary = await validateRecoveryDatabase({ query: (sql, params) => querySql(sourceDb, sql, params) }, migrations, signal);
    signal?.throwIfAborted();
    staging = await fs.mkdtemp(path.join(stagingParent, ".legacy-conversion-"));
    const databaseFile = path.join(staging, "book.sqlite");
    await initializeEncryptedDatabase(databaseFile, migrations, dataKey);
    target = createClient({ url: pathToFileURL(databaseFile).href, encryptionKey: dataKey.toString("hex"), concurrency: 1 });
    await target.execute("PRAGMA foreign_keys=OFF"); tx = await target.transaction("write");
    // Include sqlite_sequence when present: deleted records must not reset future IDs.
    const tables = await querySql<{ name: string }>(sourceDb,
      "SELECT name FROM sqlite_master WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name");
    for (const table of tables) await tx.execute(`DELETE FROM ${identifier(table.name)}`);
    for (const table of tables) {
      signal?.throwIfAborted();
      const columns = await querySql<{ name: string }>(sourceDb, `PRAGMA table_info(${identifier(table.name)})`);
      // Preserve hidden rowids too. All accepted bundled tables are ordinary rowid tables.
      const fields = ["rowid", ...columns.map((column) => column.name)];
      const encoded = fields.flatMap((name, i) => {
        const field = identifier(name);
        return [`typeof(${field}) AS t${i}`,
          `CASE WHEN typeof(${field}) IN ('text','blob') THEN hex(CAST(${field} AS BLOB)) ELSE CAST(${field} AS TEXT) END AS v${i}`,
          `CASE WHEN typeof(${field})='real' THEN ${field} ELSE NULL END AS r${i}`];
      });
      for (let offset = 0; ; offset += 256) {
        signal?.throwIfAborted();
        const rows = await querySql<Record<string, string | number | null>>(sourceDb,
          `SELECT ${encoded.join(",")} FROM ${identifier(table.name)} ORDER BY rowid LIMIT 256 OFFSET ?`, [offset]);
        for (const row of rows) {
          signal?.throwIfAborted();
          const args: InValue[] = [], placeholders: string[] = [];
          fields.forEach((_field, i) => {
            const type = row[`t${i}`], value = row[`v${i}`];
            placeholders.push(type === "text" ? "CAST(? AS TEXT)" : "?");
            // Never pass SQLite integers/text through lossy JS numeric/UTF-8 conversions.
            if (type === "integer") args.push(BigInt(String(value)));
            else if (type === "real") args.push(row[`r${i}`] as number);
            else if (type === "text" || type === "blob") args.push(Buffer.from(String(value), "hex"));
            else if (type === "null") args.push(null);
            else throw new Error("Unsupported SQLite storage type");
          });
          await tx.execute({ sql: `INSERT INTO ${identifier(table.name)} (${fields.map(identifier).join(",")}) VALUES (${placeholders.join(",")})`, args });
        }
        if (rows.length < 256) break;
      }
    }
    const converted = await validateRecoveryDatabase({ query: async <R>(sql: string, params?: number[]) =>
      (await tx!.execute({ sql, args: params ?? [] })).rows as unknown as R[] }, migrations, signal);
    if (JSON.stringify(converted) !== JSON.stringify(summary)) throw new Error("Converted records do not match the legacy snapshot");
    signal?.throwIfAborted(); await tx.commit(); tx.close(); tx = undefined;
    await target.execute("PRAGMA wal_checkpoint(TRUNCATE)"); target.close(); target = undefined;
    const reopened = await validateEncryptedRecoveryDatabase(databaseFile, dataKey, migrations, signal);
    if (JSON.stringify(reopened) !== JSON.stringify(summary)) throw new Error("Reopened conversion does not match the legacy snapshot");
    await syncPath(databaseFile); signal?.throwIfAborted();
    return await action({ databaseFile, summary: reopened });
  } finally {
    try { if (tx) { try { await tx.rollback(); } finally { tx.close(); } } }
    finally {
      target?.close();
      try { await closeSqlite(sourceDb); }
      finally { if (staging) await fs.rm(staging, { recursive: true, force: true }); }
    }
  }
}

const identifier = (name: string) => `"${name.replace(/"/g, '""')}"`;
