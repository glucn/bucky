import fs from "fs/promises";
import path from "path";
import { createHash, randomUUID } from "crypto";
import sqlite3 from "sqlite3";

export function resolveDatabaseFile(options: {
  isPackaged: boolean;
  userData?: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): string {
  if (options.isPackaged) {
    if (!options.userData || !path.isAbsolute(options.userData)) {
      throw new Error("Personal storage requires an absolute application data directory");
    }
    return path.join(options.userData, "profiles", "default", "book.sqlite");
  }
  const test = options.env.NODE_ENV === "test" || options.env.VITEST === "true";
  return path.join(options.cwd, "prisma", test ? "test.db" : "dev.db");
}

export const openSqlite = (filename: string, mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE) =>
  new Promise<sqlite3.Database>((resolve, reject) => {
    const db = new sqlite3.Database(filename, mode, (error) => {
      if (error) reject(error);
      else { db.configure("busyTimeout", 5000); resolve(db); }
    });
  });

export const closeSqlite = (db: sqlite3.Database) => new Promise<void>((resolve, reject) =>
  db.close((error) => error ? reject(error) : resolve()));

export const executeSql = (db: sqlite3.Database, sql: string) => new Promise<void>((resolve, reject) =>
  db.exec(sql, (error) => error ? reject(error) : resolve()));

export const querySql = <T>(db: sqlite3.Database, sql: string, params: unknown[] = []) =>
  new Promise<T[]>((resolve, reject) => db.all<T>(sql, params, (error, rows) =>
    error ? reject(error) : resolve(rows)));

const runSql = (db: sqlite3.Database, sql: string, params: unknown[]) =>
  new Promise<void>((resolve, reject) => db.run(sql, params, (error) =>
    error ? reject(error) : resolve()));

/** SQLite makes a consistent snapshot, including committed WAL data. Never overwrite a file. */
export async function snapshotSqlite(db: sqlite3.Database, destination: string) {
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  // Exclusive creation also rejects an existing empty file or a symlink.
  const reservation = await fs.open(destination, "wx", 0o600);
  await reservation.close();
  try {
    await runSql(db, "VACUUM main INTO ?", [destination]);
    const file = await fs.open(destination, "r+");
    try { await file.sync(); } finally { await file.close(); }
  } catch (error) {
    await fs.unlink(destination);
    throw error;
  }
}

type Migration = { name: string; sql: string; checksum: string };
type AppliedMigration = { migration_name: string; checksum: string; finished_at: string | null };

async function loadMigrations(directory: string): Promise<Migration[]> {
  const names = (await fs.readdir(directory)).filter((name) => /^\d/.test(name)).sort();
  if (!names.length) throw new Error("No bundled database migrations found");
  return Promise.all(names.map(async (name) => {
    const sql = await fs.readFile(path.join(directory, name, "migration.sql"), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
}

/** Run before opening Prisma. Unknown schemas and migration drift require explicit recovery. */
export async function initializePersonalDatabase(filename: string, migrationsDirectory: string):
Promise<{ applied: string[]; backupPath: string | null }> {
  const migrations = await loadMigrations(migrationsDirectory);
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = await openSqlite(filename);
  let backupPath: string | null = null;
  try {
    const tables = await querySql<{ name: string }>(db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const tracked = tables.some((table) => table.name === "_prisma_migrations");
    if (tables.length && !tracked) throw new Error("Existing database has an untracked schema; automatic migration refused");
    const applied = tracked ? await querySql<AppliedMigration>(db,
      "SELECT migration_name, checksum, finished_at FROM _prisma_migrations WHERE rolled_back_at IS NULL ORDER BY migration_name") : [];
    for (let index = 0; index < applied.length; index++) {
      const record = applied[index];
      if (!record.finished_at) throw new Error(`Unfinished migration: ${record.migration_name}`);
      if (migrations[index]?.name !== record.migration_name) {
        throw new Error("Database migration history differs from this app; use the matching or newer application");
      }
      if (migrations[index].checksum !== record.checksum) {
        throw new Error(`Migration checksum mismatch: ${record.migration_name}`);
      }
    }
    const pending = migrations.slice(applied.length);
    if (!pending.length) return { applied: [], backupPath: null };
    if (tables.length) {
      backupPath = path.join(path.dirname(filename), "backups", `before-upgrade-${Date.now()}-${randomUUID()}.sqlite`);
      await snapshotSqlite(db, backupPath);
    }

    // Bundled historical migrations contain foreign-key PRAGMAs. Manage them outside
    // the transaction so table rebuilds and migration history commit as one unit.
    await executeSql(db, "PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;");
    try {
      await executeSql(db, `CREATE TABLE IF NOT EXISTS _prisma_migrations (
        id TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, finished_at DATETIME,
        migration_name TEXT NOT NULL, logs TEXT, rolled_back_at DATETIME,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, applied_steps_count INTEGER NOT NULL DEFAULT 0
      )`);
      for (const migration of pending) {
        const sql = migration.sql.replace(/^\s*PRAGMA\s+(?:defer_)?foreign_keys\s*=\s*(?:ON|OFF|0|1)\s*;/gim, "");
        await executeSql(db, sql);
        await runSql(db, `INSERT INTO _prisma_migrations
          (id,checksum,finished_at,migration_name,applied_steps_count) VALUES (?,?,CURRENT_TIMESTAMP,?,1)`,
        [randomUUID(), migration.checksum, migration.name]);
      }
      const integrity = await querySql<{ integrity_check: string }>(db, "PRAGMA integrity_check");
      if (integrity.some((row) => row.integrity_check !== "ok")) throw new Error("Database integrity check failed after migration");
      if ((await querySql(db, "PRAGMA foreign_key_check")).length) throw new Error("Database relation check failed after migration");
      await executeSql(db, "COMMIT;");
    } catch (error) {
      await executeSql(db, "ROLLBACK;");
      throw new Error(`Database upgrade failed and was rolled back${backupPath ? `; backup: ${backupPath}` : ""}`, { cause: error });
    }
    await fs.chmod(filename, 0o600);
    return { applied: pending.map((migration) => migration.name), backupPath };
  } finally {
    await closeSqlite(db);
  }
}
