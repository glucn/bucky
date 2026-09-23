import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import sqlite3 from "sqlite3";
import { closeSqlite, executeSql, openSqlite, querySql, snapshotSqlite } from "./localDatabase";
import { validateRecoveryDatabase } from "./recoveryValidation";
import { existingProfilePath, profileDatabasePath } from "./personalProfiles";
import type { RecoveryResult, RecoverySummary } from "../shared/recovery";

/** The legacy path and encrypted recovery share exactly the same validation rules. */
async function validateAndSummarize(filename: string, migrations: string): Promise<RecoverySummary> {
  const db = await openSqlite(filename, sqlite3.OPEN_READONLY);
  try {
    await executeSql(db, "BEGIN");
    return await validateRecoveryDatabase({ query: (sql, params) => querySql(db, sql, params) }, migrations);
  } finally { await closeSqlite(db); }
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
