import type { InterruptedArtifact, RecoverySummary } from "../shared/recovery";
import type { ProfileKeyEnvelope } from "./profileKeys";
import fs from "fs/promises";
import { constants } from "fs";
import type { Stats } from "fs";
import type { FileHandle } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { createClient } from "@libsql/client";
import { randomUUID } from "crypto";
import { parseKeyEnvelope, serializeKeyEnvelope, unlockWithPassphrase, unlockWithRecovery } from "./profileKeys";
import { profileDatabasePath, readActiveProfile } from "./personalProfiles";
import { readPrivateFile, validateDirectories, syncPath } from "./protectedProfiles";
import { snapshotDatabase } from "./localDatabase";
import { validateEncryptedRecoveryDatabase } from "./protectedBackup";
import { SUPPORTED_CURRENCY_OPTIONS } from "../shared/currencies";

type Options = { userData: string; artifactId: string; migrations: string;
  credential: { mode: "recovery" | "passphrase"; secret: string }; signal?: AbortSignal };
type Snapshot = { databaseFile: string; dataKey: Buffer; envelope: ProfileKeyEnvelope; summary: RecoverySummary };
const invalid = () => new Error("Interrupted profile could not be recovered. Preserve its files and use a verified backup or original source.");
const identifier = (id: string): InterruptedArtifact["kind"] | undefined => {
  if (/^\.(preserved-)?creating-default-[a-zA-Z0-9-]+$/.test(id)) return "setup";
  if (/^\.restoring-restored-[a-zA-Z0-9-]+$/.test(id)) return "restore";
  if (/^(\.setup-default|\.restore-restored-[a-zA-Z0-9-]+)\.lock$/.test(id)) return "lock";
  if (/^\.preserved-setup-lock-[a-zA-Z0-9-]+$/.test(id)) return "lock";
  if (/^\.(legacy-conversion|bucky-backup|bucky-restore|interrupted-recovery)-[a-zA-Z0-9-]+$/.test(id)) return "temporary";
};
const absent = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

async function candidate(userData: string, artifactId: string) {
  const kind = identifier(artifactId);
  if (kind !== "setup" && kind !== "restore") throw invalid();
  const profiles = path.dirname(path.dirname(profileDatabasePath(userData, "default")));
  await validateDirectories(userData, "restored-interrupted-check");
  const directory = path.join(profiles, artifactId), root = await fs.realpath(profiles);
  if (!(await fs.lstat(directory)).isDirectory() || await fs.realpath(directory) !== path.join(root, artifactId)) throw invalid();
  const envelope = parseKeyEnvelope((await readPrivateFile(path.join(directory, "profile.keys.json"), 65536)).toString("utf8"));
  if ((!envelope.keychain && !envelope.passphrase) || (kind === "setup" ? envelope.profileId !== "default"
    : !artifactId.startsWith(`.restoring-${envelope.profileId}-`))) throw invalid();
  const header = await readPrivateFile(path.join(directory, "book.sqlite"), 16, true);
  if (header.length !== 16 || header.toString() === "SQLite format 3\0") throw invalid();
  return { directory, envelope, kind, profiles };
}

export async function listInterruptedProfiles(userData: string): Promise<InterruptedArtifact[]> {
  const profiles = path.dirname(path.dirname(profileDatabasePath(userData, "default")));
  await validateDirectories(userData, "restored-interrupted-check");
  let names: string[];
  try { names = await fs.readdir(profiles); } catch (error) { if (absent(error)) return []; throw error; }
  const artifacts: InterruptedArtifact[] = [];
  for (const id of names.sort()) {
    const kind = identifier(id); if (!kind) continue;
    try {
      const found = await candidate(userData, id);
      artifacts.push({ id, kind, canAttemptRecovery: true, profileId: found.envelope.profileId,
        ...(id.startsWith(".preserved-") ? { preserved: true as const } : {}) });
    } catch { artifacts.push({ id, kind, canAttemptRecovery: false, ...(id.startsWith(".preserved-") ? { preserved: true as const } : {}) }); }
  }
  return artifacts;
}

/** Main must hold the app's single-instance ownership, drain setup/recovery, and obtain native
 * confirmation of this exact list before entry. This only renames unpublished setup artifacts;
 * any existing default directory or non-default selection refuses the operation.
 */
export async function preserveInterruptedSetup(options: { userData: string; expectedIds: string[]; signal?: AbortSignal }):
Promise<Array<{ originalId: string; preservedId: string }>> {
  const { userData, expectedIds, signal } = options;
  const activeSetup = (name: string) => name === ".setup-default.lock" || /^\.creating-default-[a-zA-Z0-9-]+$/.test(name);
  if (!Array.isArray(expectedIds) || !expectedIds.length || expectedIds.length > 100 ||
    expectedIds.some((id) => typeof id !== "string" || !activeSetup(id)) || new Set(expectedIds).size !== expectedIds.length) throw invalid();
  signal?.throwIfAborted();
  await validateDirectories(userData, "restored-interrupted-check");
  const profiles = path.dirname(path.dirname(profileDatabasePath(userData, "default"))), root = await fs.realpath(profiles);
  const noBook = async () => {
    if (readActiveProfile(userData) !== "default") throw invalid();
    try { await fs.lstat(path.join(profiles, "default")); }
    catch (error) { if (absent(error)) return; throw error; }
    throw new Error("An existing book cannot be replaced by setup retry");
  };
  await noBook();
  const names = (await fs.readdir(profiles)).filter(activeSetup).sort();
  if (JSON.stringify(names) !== JSON.stringify([...expectedIds].sort())) throw new Error("Interrupted setup changed; refresh before preserving it");
  const moves = await Promise.all(names.map(async (originalId) => {
    const source = path.join(profiles, originalId), stat = await fs.lstat(source);
    if (!stat.isDirectory() || await fs.realpath(source) !== path.join(root, originalId)) throw invalid();
    const preservedId = originalId === ".setup-default.lock" ? `.preserved-setup-lock-${randomUUID()}` : `.preserved-creating-default-${randomUUID()}`;
    return { originalId, preservedId, source, destination: path.join(profiles, preservedId), stat };
  }));
  try {
    for (const move of moves) {
      signal?.throwIfAborted(); await noBook();
      const current = await fs.lstat(move.source);
      if (!unchanged(current, move.stat) || !current.isDirectory()) throw invalid();
      try { await fs.lstat(move.destination); throw invalid(); } catch (error) { if (!absent(error)) throw error; }
      signal?.throwIfAborted();
      await fs.rename(move.source, move.destination);
    }
    await syncPath(profiles); await syncPath(userData);
    return moves.map(({ originalId, preservedId }) => ({ originalId, preservedId }));
  } catch {
    // Never roll back over a newly created artifact. Successful moves and untouched sources
    // remain in inventory, including when cancellation or final sync arrives after a rename.
    throw new Error("Preservation was not fully confirmed. All files are retained; refresh interrupted artifacts before retrying.");
  }
}

/** Trusted-process callback. The source is retained; no profile is published or selected. */
export async function withInterruptedProfileSnapshot<T>(options: Options, action: (snapshot: Snapshot) => Promise<T>): Promise<T> {
  const { userData, artifactId, credential, migrations, signal } = options;
  signal?.throwIfAborted();
  const source = await candidate(userData, artifactId);
  let dataKey: Buffer | undefined, staging: string | undefined;
  try {
    if (credential.mode === "recovery") dataKey = unlockWithRecovery(source.envelope, credential.secret, source.envelope.profileId);
    else if (credential.mode === "passphrase") dataKey = await unlockWithPassphrase(source.envelope, credential.secret, source.envelope.profileId);
    else throw invalid();
    signal?.throwIfAborted();
    staging = await fs.mkdtemp(path.join(source.profiles, ".interrupted-recovery-"));
    const copied = path.join(staging, "input.sqlite");
    await copyInterruptedFiles(source.directory, copied, signal);
    // Metadata must still describe the same original after copying. No native database
    // connection is ever opened on the interrupted source or its sidecars.
    const checked = await candidate(userData, artifactId);
    if (serializeKeyEnvelope(checked.envelope) !== serializeKeyEnvelope(source.envelope)) throw invalid();
    signal?.throwIfAborted();
    const originalSummary = await validateEncryptedRecoveryDatabase(copied, dataKey, migrations, signal);
    const client = createClient({ url: pathToFileURL(copied).href, encryptionKey: dataKey.toString("hex"), concurrency: 1 });
    const databaseFile = path.join(staging, "snapshot.sqlite");
    try {
      if (source.kind === "setup") {
        const setting = (await client.execute("SELECT jsonValue FROM AppSetting WHERE key='baseCurrency'")).rows[0]?.jsonValue;
        const currency = typeof setting === "string" ? JSON.parse(setting) : undefined;
        const count = (await client.execute("SELECT COUNT(*) AS count FROM Account")).rows[0].count;
        if (!SUPPORTED_CURRENCY_OPTIONS.some((option) => option.code === currency) || !Number(count)) throw invalid();
      }
      await snapshotDatabase(databaseFile, (sql, args) => client.execute({ sql, args }));
    } finally { client.close(); }
    const summary = await validateEncryptedRecoveryDatabase(databaseFile, dataKey, migrations, signal);
    if (JSON.stringify(summary) !== JSON.stringify(originalSummary)) throw invalid();
    signal?.throwIfAborted();
    return await action({ databaseFile, dataKey, envelope: source.envelope, summary });
  } finally {
    dataKey?.fill(0);
    if (staging) await fs.rm(staging, { recursive: true, force: true });
  }
}

function unchanged(a: Stats, b: Stats) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

async function copyInterruptedFiles(directory: string, destination: string, signal?: AbortSignal) {
  const files: Array<{ source: string; suffix: string; file?: FileHandle; stat?: Stats }> = [];
  try {
    for (const suffix of ["", "-wal", "-journal"]) {
      const source = path.join(directory, "book.sqlite" + suffix);
      const item: (typeof files)[number] = { source, suffix }; files.push(item);
      try {
        item.file = await fs.open(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        item.stat = await item.file.stat();
        if (!item.stat.isFile() || item.stat.size > 8 * 1024 ** 3 || (!suffix && item.stat.size < 16)) throw invalid();
      } catch (error) { if (!suffix || !absent(error)) throw error; }
    }
    // All original file handles are held before copying. Omit shared-memory indexes;
    // SQLite reconstructs them only within the private copy, preserving source bytes.
    for (const item of files) {
      signal?.throwIfAborted(); if (!item.file) continue;
      const output = await fs.open(destination + item.suffix, "wx", 0o600);
      try {
        const chunk = Buffer.alloc(1024 * 1024);
        for (let position = 0; position < item.stat!.size;) {
          signal?.throwIfAborted();
          const { bytesRead } = await item.file.read(chunk, 0, Math.min(chunk.length, item.stat!.size - position), position);
          if (!bytesRead) throw invalid();
          for (let written = 0; written < bytesRead;) {
            const { bytesWritten } = await output.write(chunk, written, bytesRead - written, position + written);
            if (!bytesWritten) throw invalid(); written += bytesWritten;
          }
          position += bytesRead;
        }
        await output.sync();
      } finally { await output.close(); }
    }
    for (const item of files) {
      signal?.throwIfAborted();
      let current: Stats | undefined;
      try { current = await fs.lstat(item.source); } catch (error) { if (!absent(error)) throw error; }
      if (item.stat ? !current || !unchanged(item.stat, current) || !unchanged(item.stat, await item.file!.stat()) : current) throw invalid();
    }
  } finally { await Promise.all(files.map((item) => item.file?.close())); }
}
