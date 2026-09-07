import fs from "fs/promises";
import os from "os";
import path from "path";
import { createHash, randomUUID } from "crypto";
import sqlite3 from "sqlite3";
import { Prisma } from "@prisma/client";
import { closeSqlite, executeSql, initializePersonalDatabase, openSqlite, querySql, snapshotSqlite } from "./localDatabase";
import { existingProfilePath, profileDatabasePath } from "./personalProfiles";
import type { RecoveryResult, RecoverySummary } from "../shared/recovery";

const identifier = (name: string) => `"${name.replace(/"/g, '""')}"`;
const schemaSql = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY type,name";

/** Compare with a fresh bundled schema, not just a claimed migration version. */
async function validateAndSummarize(filename: string, migrations: string): Promise<RecoverySummary> {
  const referenceDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-schema-"));
  let db: sqlite3.Database | undefined;
  let reference: sqlite3.Database | undefined;
  try {
    const referencePath = path.join(referenceDirectory, "schema.sqlite");
    await initializePersonalDatabase(referencePath, migrations);
    reference = await openSqlite(referencePath, sqlite3.OPEN_READONLY);
    db = await openSqlite(filename, sqlite3.OPEN_READONLY);
    await executeSql(db, "BEGIN");
    const integrity = await querySql<{ integrity_check: string }>(db, "PRAGMA integrity_check");
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error("Backup integrity check failed");
    const historyQuery = "SELECT migration_name,checksum FROM _prisma_migrations WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL ORDER BY migration_name";
    const expectedHistory = await querySql<{ migration_name: string }>(reference, historyQuery);
    const history = await querySql(db, historyQuery);
    const unfinished = await querySql(db, "SELECT id FROM _prisma_migrations WHERE rolled_back_at IS NULL AND finished_at IS NULL");
    if (unfinished.length || JSON.stringify(history) !== JSON.stringify(expectedHistory)) {
      throw new Error("Backup migration history is incompatible; restore with the matching app version first");
    }
    const schema = await querySql(db, schemaSql);
    if (JSON.stringify(schema) !== JSON.stringify(await querySql(reference, schemaSql))) {
      throw new Error("Backup schema does not match this application");
    }
    if ((await querySql(db, "PRAGMA foreign_key_check")).length) throw new Error("Backup contains broken record references");
    // relationMode=prisma means several relationships have no SQLite FK constraint.
    for (const model of Prisma.dmmf.datamodel.models) {
      for (const relation of model.fields.filter((field) => field.kind === "object" && field.relationFromFields?.length)) {
        const parent = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === relation.type)!;
        const from = relation.relationFromFields!.map((name) => identifier(model.fields.find((field) => field.name === name)!.dbName ?? name));
        const to = relation.relationToFields!.map((name) => identifier(parent.fields.find((field) => field.name === name)!.dbName ?? name));
        const missing = await querySql(db, `SELECT 1 FROM ${identifier(model.dbName ?? model.name)} c
          LEFT JOIN ${identifier(parent.dbName ?? parent.name)} p ON ${from.map((column, i) => `c.${column}=p.${to[i]}`).join(" AND ")}
          WHERE ${from.map((column) => `c.${column} IS NOT NULL`).join(" AND ")} AND p.${to[0]} IS NULL LIMIT 1`);
        if (missing.length) throw new Error(`Backup contains broken record references: ${model.name}.${relation.name}`);
      }
    }

    const tables = await querySql<{ name: string }>(db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const tableCounts: Record<string, number> = {};
    const digest = createHash("sha256").update(JSON.stringify(schema));
    for (const table of tables) {
      const columns = await querySql<{ name: string }>(db, `PRAGMA table_info(${identifier(table.name)})`);
      // Encode text/blob bytes (including embedded NULs) and quote numbers in SQLite,
      // avoiding both truncated text and lossy JS conversion of large integers.
      const values = columns.map((column) => {
        const field = identifier(column.name);
        return `typeof(${field}) || ':' || CASE WHEN typeof(${field}) IN ('text','blob')
          THEN hex(CAST(${field} AS BLOB)) ELSE quote(${field}) END`;
      });
      const sql = `SELECT ${values.map((value, i) => `${value} AS c${i}`).join(",")} FROM ${identifier(table.name)} ORDER BY ${values.join(",")}`;
      digest.update(JSON.stringify({ table: table.name, columns }));
      tableCounts[table.name] = 0;
      // Bound JS memory while hashing; keep the read transaction for a consistent view.
      for (let offset = 0; ; offset += 1000) {
        const rows = await querySql(db, `${sql} LIMIT 1000 OFFSET ?`, [offset]);
        for (const row of rows) {
          digest.update(JSON.stringify(row) + "\n");
          tableCounts[table.name]++;
        }
        if (rows.length < 1000) break;
      }
    }
    const balances = await querySql<RecoverySummary["balances"][number]>(db,
      "SELECT accountId,currency,SUM(amount) AS amount FROM JournalLine GROUP BY accountId,currency ORDER BY accountId,currency");
    return { schemaVersion: expectedHistory[expectedHistory.length - 1].migration_name,
      recordDigest: digest.digest("hex"), tableCounts, balances };
  } finally {
    if (db) await closeSqlite(db);
    if (reference) await closeSqlite(reference);
    await fs.rm(referenceDirectory, { recursive: true, force: true });
  }
}

export async function createBackup(source: string, destination: string, migrations: string): Promise<RecoveryResult> {
  if (!path.isAbsolute(destination)) throw new Error("Backup destination must be absolute");
  const db = await openSqlite(source, sqlite3.OPEN_READONLY);
  let created = false;
  try {
    await snapshotSqlite(db, destination);
    created = true;
    return { path: destination, summary: await validateAndSummarize(destination, migrations) };
  } catch (error) {
    if (created) await fs.unlink(destination);
    throw error;
  } finally { await closeSqlite(db); }
}

/** Never changes the source or the selected/live book. Only publishes a verified new profile. */
export async function restoreBackup(source: string, userData: string, migrations: string): Promise<RecoveryResult & { profileId: string }> {
  const profileId = `restored-${Date.now()}-${randomUUID()}`;
  const destination = profileDatabasePath(userData, profileId);
  const profiles = path.dirname(path.dirname(destination));
  await fs.mkdir(profiles, { recursive: true, mode: 0o700 });
  const staging = await fs.mkdtemp(path.join(profiles, ".restoring-"));
  try {
    const stagedFile = path.join(staging, "book.sqlite");
    // Compare all records against the source. A concurrent source edit fails closed;
    // ordinary exported backup files are immutable during recovery.
    const original = await validateAndSummarize(source, migrations);
    const saved = await createBackup(source, stagedFile, migrations);
    if (JSON.stringify(saved.summary) !== JSON.stringify(original)) throw new Error("Restored record verification failed; the source may have changed");
    await fs.rename(staging, path.dirname(destination));
    return { path: destination, profileId, summary: saved.summary };
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function listProfiles(userData: string): Promise<Array<{ id: string }>> {
  const directory = path.join(userData, "profiles");
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => {
    if (!entry.isDirectory() || !/^(default|restored-[a-zA-Z0-9-]+)$/.test(entry.name)) return false;
    try { existingProfilePath(userData, entry.name); return true; } catch { return false; }
  }).map((entry) => ({ id: entry.name })).sort((a, b) => a.id.localeCompare(b.id));
}

/** Persist only the next-launch selection; the running Prisma connection is never switched. */
export async function selectProfile(userData: string, id: string, migrations: string): Promise<void> {
  const filename = existingProfilePath(userData, id);
  await validateAndSummarize(filename, migrations);
  const temporary = path.join(userData, `.active-profile-${randomUUID()}.json`);
  try {
    const file = await fs.open(temporary, "wx", 0o600);
    try { await file.writeFile(JSON.stringify({ id })); await file.sync(); } finally { await file.close(); }
    await fs.rename(temporary, path.join(userData, "active-profile.json"));
  } finally { await fs.rm(temporary, { force: true }); }
}
