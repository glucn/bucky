import fs from "fs/promises";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import sqlite3 from "sqlite3";
import { Prisma } from "@prisma/client";
import { closeSqlite, initializePersonalDatabase, openSqlite, querySql } from "./localDatabase";
import type { RecoverySummary } from "../shared/recovery";

const identifier = (name: string) => `"${name.replace(/"/g, '""')}"`;
const schemaSql = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY type,name";
export interface RecoveryReader { query<T>(sql: string, params?: number[]): Promise<T[]> }

/** Caller holds a consistent read transaction. Only the empty reference schema is plaintext. */
export async function validateRecoveryDatabase(db: RecoveryReader, migrations: string, signal?: AbortSignal): Promise<RecoverySummary> {
  signal?.throwIfAborted();
  const referenceDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-schema-"));
  let reference: sqlite3.Database | undefined;
  try {
    const referencePath = path.join(referenceDirectory, "schema.sqlite");
    await initializePersonalDatabase(referencePath, migrations);
    reference = await openSqlite(referencePath, sqlite3.OPEN_READONLY);
    const integrity = await db.query<{ integrity_check: string }>("PRAGMA integrity_check");
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error("Backup integrity check failed");
    const historyQuery = "SELECT migration_name,checksum FROM _prisma_migrations WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL ORDER BY migration_name";
    const expectedHistory = await querySql<{ migration_name: string }>(reference, historyQuery);
    const history = await db.query(historyQuery);
    const unfinished = await db.query("SELECT id FROM _prisma_migrations WHERE rolled_back_at IS NULL AND finished_at IS NULL");
    if (unfinished.length || JSON.stringify(history) !== JSON.stringify(expectedHistory)) {
      throw new Error("Backup migration history is incompatible; restore with the matching app version first");
    }
    const schema = await db.query(schemaSql);
    if (JSON.stringify(schema) !== JSON.stringify(await querySql(reference, schemaSql))) throw new Error("Backup schema does not match this application");
    if ((await db.query("PRAGMA foreign_key_check")).length) throw new Error("Backup contains broken record references");
    // relationMode=prisma means several relationships have no physical SQLite FK.
    for (const model of Prisma.dmmf.datamodel.models) {
      signal?.throwIfAborted();
      for (const relation of model.fields.filter((field) => field.kind === "object" && field.relationFromFields?.length)) {
        const parent = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === relation.type)!;
        const from = relation.relationFromFields!.map((name) => identifier(model.fields.find((field) => field.name === name)!.dbName ?? name));
        const to = relation.relationToFields!.map((name) => identifier(parent.fields.find((field) => field.name === name)!.dbName ?? name));
        const missing = await db.query(`SELECT 1 FROM ${identifier(model.dbName ?? model.name)} c
          LEFT JOIN ${identifier(parent.dbName ?? parent.name)} p ON ${from.map((column, i) => `c.${column}=p.${to[i]}`).join(" AND ")}
          WHERE ${from.map((column) => `c.${column} IS NOT NULL`).join(" AND ")} AND p.${to[0]} IS NULL LIMIT 1`);
        if (missing.length) throw new Error(`Backup contains broken record references: ${model.name}.${relation.name}`);
      }
    }
    const tables = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const tableCounts: Record<string, number> = {};
    const digest = createHash("sha256").update(JSON.stringify(schema));
    for (const table of tables) {
      signal?.throwIfAborted();
      const columns = await db.query<{ name: string }>(`PRAGMA table_info(${identifier(table.name)})`);
      // Preserve text/blob bytes (including NULs) and large integers before JS conversion.
      const values = columns.map((column) => {
        const field = identifier(column.name);
        return `typeof(${field}) || ':' || CASE WHEN typeof(${field}) IN ('text','blob') THEN hex(CAST(${field} AS BLOB)) ELSE quote(${field}) END`;
      });
      const sql = `SELECT ${values.map((value, i) => `${value} AS c${i}`).join(",")} FROM ${identifier(table.name)} ORDER BY ${values.join(",")}`;
      digest.update(JSON.stringify({ table: table.name, columns }));
      tableCounts[table.name] = 0;
      for (let offset = 0; ; offset += 1000) {
        signal?.throwIfAborted();
        const rows = await db.query(sql + " LIMIT 1000 OFFSET ?", [offset]);
        for (const row of rows) { digest.update(JSON.stringify(row) + "\n"); tableCounts[table.name]++; }
        if (rows.length < 1000) break;
      }
    }
    const balances = await db.query<RecoverySummary["balances"][number]>(
      "SELECT accountId,currency,SUM(amount) AS amount FROM JournalLine GROUP BY accountId,currency ORDER BY accountId,currency");
    return { schemaVersion: expectedHistory[expectedHistory.length - 1].migration_name,
      recordDigest: digest.digest("hex"), tableCounts, balances };
  } finally {
    if (reference) await closeSqlite(reference);
    await fs.rm(referenceDirectory, { recursive: true, force: true });
  }
}
