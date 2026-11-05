import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createClient } from "@libsql/client";
import { pathToFileURL } from "url";
import { ProtectedProfileSetup, readProtectedProfile, inspectProtectedProfile } from "./protectedProfiles";
import { unlockWithRecovery, rebindProfileKeys, serializeKeyEnvelope } from "./profileKeys";
import { listInterruptedProfiles, withInterruptedProfileSnapshot, preserveInterruptedSetup } from "./interruptedProfiles";
import { validateEncryptedRecoveryDatabase } from "./protectedBackup";
import { createEncryptedPrisma } from "./encryptedDatabase";
import { readActiveProfile } from "./personalProfiles";
import * as localDatabase from "./localDatabase";

const migrations = path.resolve("prisma/migrations"), passphrase = "Synthetic interrupted profile passphrase";
const artifactId = ".creating-default-interrupted";
let directory: string, stage: string, recoverySecret: string, key: Buffer;
const snapshot = <T>(action: Parameters<typeof withInterruptedProfileSnapshot<T>>[1], signal?: AbortSignal) =>
  withInterruptedProfileSnapshot({ userData: directory, artifactId, migrations,
    credential: { mode: "recovery", secret: recoverySecret }, signal }, action);
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-interrupted-"));
  const setup = new ProtectedProfileSetup(directory, migrations);
  const pending = await setup.begin({ baseCurrency: "CAD", passphrase });
  recoverySecret = pending.recoverySecret; await setup.confirm(pending.setupId, recoverySecret);
  const original = await readProtectedProfile(directory);
  key = unlockWithRecovery(original.envelope, recoverySecret, "default");
  stage = path.join(directory, "profiles", artifactId);
  await fs.cp(path.dirname(original.databaseFile), stage, { recursive: true });
});
afterEach(async () => { vi.restoreAllMocks(); key.fill(0); await fs.rm(directory, { recursive: true, force: true }); });

it("inventories only recognized artifacts using bounded metadata, without opening financial data or exposing secrets", async () => {
  await fs.mkdir(path.join(directory, "profiles", ".setup-default.lock"));
  await fs.mkdir(path.join(directory, "profiles", ".legacy-conversion-unfinished"));
  await fs.mkdir(path.join(directory, "profiles", "unrelated-folder"));
  const artifacts = await listInterruptedProfiles(directory);
  expect(artifacts).toEqual([
    { id: artifactId, kind: "setup", canAttemptRecovery: true, profileId: "default" },
    { id: ".legacy-conversion-unfinished", kind: "temporary", canAttemptRecovery: false },
    { id: ".setup-default.lock", kind: "lock", canAttemptRecovery: false },
  ]);
  expect(JSON.stringify(artifacts)).not.toMatch(/envelope|dataKey|passphrase|recoverySecret/);
  expect(JSON.stringify(artifacts)).not.toContain(recoverySecret);
});

it("authenticates and snapshots committed encrypted WAL data, leaves source bytes intact, and wipes the callback key", async () => {
  const source = path.join(stage, "book.sqlite"), sourceKeys = await fs.readFile(path.join(stage, "profile.keys.json"));
  const live = createClient({ url: pathToFileURL(source).href, encryptionKey: key.toString("hex") });
  let returnedKey: Buffer | undefined, temporary = "";
  try {
    await live.execute("PRAGMA journal_mode=WAL");
    await live.execute("INSERT INTO Account(id,name,type,subtype,currency,updatedAt) VALUES('interrupted-cash','Private interrupted WAL cash','user','asset','CAD',CURRENT_TIMESTAMP)");
    const before = await fs.readFile(source), walBefore = await fs.readFile(source + "-wal");
    await snapshot(async ({ databaseFile, dataKey, summary }) => {
      temporary = databaseFile; returnedKey = dataKey;
      expect(dataKey).toEqual(key);
      expect(summary.tableCounts.Account).toBeGreaterThan(1);
      expect(await validateEncryptedRecoveryDatabase(databaseFile, dataKey, migrations)).toEqual(summary);
      const db = createEncryptedPrisma(databaseFile, dataKey);
      try { expect((await db.account.findUniqueOrThrow({ where: { id: "interrupted-cash" } })).name).toBe("Private interrupted WAL cash"); }
      finally { await db.$disconnect(); }
      for (const name of await fs.readdir(path.dirname(databaseFile))) {
        const bytes = await fs.readFile(path.join(path.dirname(databaseFile), name));
        expect(bytes.includes(Buffer.from("Private interrupted WAL cash"))).toBe(false);
      }
    });
    expect(await fs.readFile(source)).toEqual(before); expect(await fs.readFile(source + "-wal")).toEqual(walBefore);
    expect(await fs.readFile(path.join(stage, "profile.keys.json"))).toEqual(sourceKeys);
  } finally { live.close(); }
  expect(returnedKey!.equals(Buffer.alloc(32))).toBe(true);
  await expect(fs.stat(temporary)).rejects.toThrow();
  expect(readActiveProfile(directory)).toBe("default");
});

it("recovers a restore-stage identity with its configured passphrase without the original keychain", async () => {
  const profile = await readProtectedProfile(directory);
  const profileId = "restored-interrupted-example";
  const rebound = await rebindProfileKeys(profile.envelope, key, "default", profileId, { passphrase });
  const restoredId = `.restoring-${profileId}-unfinished`;
  const restoredStage = path.join(directory, "profiles", restoredId);
  await fs.cp(stage, restoredStage, { recursive: true });
  await fs.writeFile(path.join(restoredStage, "profile.keys.json"), serializeKeyEnvelope(rebound.envelope));
  expect(await listInterruptedProfiles(directory)).toContainEqual({ id: restoredId, kind: "restore", canAttemptRecovery: true, profileId });
  await withInterruptedProfileSnapshot({ userData: directory, artifactId: restoredId, migrations,
    credential: { mode: "passphrase", secret: passphrase } }, async (verified) => expect(verified.envelope.profileId).toBe(profileId));
});

it.each(["wrong-credential", "missing-envelope", "linked-envelope", "linked-book", "linked-directory", "wrong-identity", "corrupt-book", "traversal"])("refuses %s without releasing data or removing the source", async (kind) => {
  let selected = artifactId;
  if (kind === "wrong-credential") recoverySecret = "incorrect";
  if (kind === "missing-envelope") await fs.unlink(path.join(stage, "profile.keys.json"));
  if (kind === "linked-envelope" || kind === "linked-book") {
    const name = kind === "linked-envelope" ? "profile.keys.json" : "book.sqlite";
    await fs.unlink(path.join(stage, name)); await fs.symlink(path.join(directory, "profiles", "default", name), path.join(stage, name));
  }
  if (kind === "linked-directory") { await fs.rm(stage, { recursive: true }); await fs.symlink(path.join(directory, "profiles", "default"), stage); }
  if (kind === "wrong-identity") {
    selected = ".restoring-restored-other-unfinished"; await fs.rename(stage, path.join(directory, "profiles", selected));
  }
  if (kind === "corrupt-book") await fs.writeFile(path.join(stage, "book.sqlite"), Buffer.alloc(8192, 19));
  if (kind === "traversal") selected = "../default";
  const action = vi.fn();
  await expect(withInterruptedProfileSnapshot({ userData: directory, artifactId: selected, migrations,
    credential: { mode: "recovery", secret: recoverySecret } }, action)).rejects.toThrow();
  expect(action).not.toHaveBeenCalled();
  expect(await fs.readdir(path.join(directory, "profiles"))).toContain("default");
  expect((await fs.readdir(path.join(directory, "profiles"))).some((name) => name.startsWith(".interrupted-recovery-"))).toBe(false);
});

it("cleans owned snapshot files and keys on cancellation and callback failure, preserving interrupted files", async () => {
  const before = await fs.readFile(path.join(stage, "book.sqlite"));
  const abort = new AbortController(), original = localDatabase.snapshotDatabase;
  vi.spyOn(localDatabase, "snapshotDatabase").mockImplementation(async (...args) => { await original(...args); abort.abort(); });
  const action = vi.fn(); await expect(snapshot(action, abort.signal)).rejects.toThrow(); expect(action).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  let callbackKey: Buffer | undefined;
  await expect(snapshot(async ({ dataKey }) => { callbackKey = dataKey; throw new Error("consumer failed"); })).rejects.toThrow();
  expect(callbackKey!.equals(Buffer.alloc(32))).toBe(true);
  expect(await fs.readFile(path.join(stage, "book.sqlite"))).toEqual(before);
  expect((await fs.readdir(path.join(directory, "profiles"))).filter((name) => name.startsWith(".interrupted-recovery-"))).toEqual([]);
});

it("rejects a source changed during copying and removes only the new snapshot", async () => {
  const book = path.join(stage, "book.sqlite"), before = await fs.readFile(book), open = fs.open;
  let changed = false;
  vi.spyOn(fs, "open").mockImplementation(async (...args: any[]) => {
    const file = await (open as any)(...args);
    if (String(args[0]) === book) {
      const read = file.read.bind(file);
      file.read = async (...readArgs: any[]) => {
        const result = await read(...readArgs);
        if (readArgs[2] > 16 && !changed) {
          changed = true; const stat = await file.stat();
          await fs.utimes(book, stat.atime, new Date(stat.mtimeMs + 10000));
        }
        return result;
      };
    }
    return file;
  });
  const action = vi.fn(); await expect(snapshot(action)).rejects.toThrow();
  expect(changed).toBe(true); expect(action).not.toHaveBeenCalled();
  expect(await fs.readFile(book)).toEqual(before);
  expect((await fs.readdir(path.join(directory, "profiles"))).filter((name) => name.startsWith(".interrupted-recovery-"))).toEqual([]);
});

it("refuses an unfinished setup before its chosen currency/default accounts were committed", async () => {
  const client = createClient({ url: pathToFileURL(path.join(stage, "book.sqlite")).href, encryptionKey: key.toString("hex") });
  try { await client.execute("DELETE FROM AppSetting WHERE key='baseCurrency'"); } finally { client.close(); }
  const before = await fs.readFile(path.join(stage, "book.sqlite")), action = vi.fn();
  await expect(snapshot(action)).rejects.toThrow(); expect(action).not.toHaveBeenCalled();
  expect(await fs.readFile(path.join(stage, "book.sqlite"))).toEqual(before);
});

it("cleans a disk-full reservation and can retry without changing interrupted files", async () => {
  const before = await fs.readFile(path.join(stage, "book.sqlite")), open = fs.open;
  const fault = vi.spyOn(fs, "open").mockImplementation(async (filename, ...args) => {
    if (String(filename).includes(".interrupted-recovery-") && String(filename).endsWith("input.sqlite")) {
      throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
    }
    return (open as any)(filename, ...args);
  });
  const action = vi.fn(); await expect(snapshot(action)).rejects.toThrow(); expect(action).not.toHaveBeenCalled();
  expect(await fs.readFile(path.join(stage, "book.sqlite"))).toEqual(before);
  fault.mockRestore(); await snapshot(async ({ summary }) => expect(summary.tableCounts.Account).toBeGreaterThan(0));
});

it("keeps uncommitted rollback-journal changes out of a recovered snapshot", async () => {
  const source = path.join(stage, "book.sqlite");
  const live = createClient({ url: pathToFileURL(source).href, encryptionKey: key.toString("hex") });
  try {
    await live.execute("PRAGMA journal_mode=DELETE");
    await live.execute("INSERT INTO Account(id,name,type,subtype,currency,updatedAt) VALUES('rollback-cash','Committed cash','user','asset','CAD',CURRENT_TIMESTAMP)");
    const tx = await live.transaction("write");
    try {
      await tx.execute("UPDATE Account SET name='Uncommitted private edit' WHERE id='rollback-cash'");
      await expect(fs.stat(source + "-journal")).resolves.toBeDefined();
      const before = await fs.readFile(source), journal = await fs.readFile(source + "-journal");
      await snapshot(async ({ databaseFile, dataKey }) => {
        const recovered = createEncryptedPrisma(databaseFile, dataKey);
        try { expect((await recovered.account.findUniqueOrThrow({ where: { id: "rollback-cash" } })).name).toBe("Committed cash"); }
        finally { await recovered.$disconnect(); }
      });
      expect(await fs.readFile(source)).toEqual(before); expect(await fs.readFile(source + "-journal")).toEqual(journal);
    } finally { await tx.rollback(); tx.close(); }
  } finally { live.close(); }
});

it("preserves interrupted setup and its stale lock by rename, allows setup retry, and keeps the archived snapshot recoverable", async () => {
  const profiles = path.join(directory, "profiles");
  await fs.rm(path.join(profiles, "default"), { recursive: true }); // Simulate never-published setup.
  await fs.mkdir(path.join(profiles, ".setup-default.lock"));
  const before = await fs.readFile(path.join(stage, "book.sqlite"));
  const result = await preserveInterruptedSetup({ userData: directory, expectedIds: [artifactId, ".setup-default.lock"] });
  expect(result).toHaveLength(2);
  const archivedId = result.find((item) => item.originalId === artifactId)!.preservedId;
  expect(await fs.readFile(path.join(profiles, archivedId, "book.sqlite"))).toEqual(before);
  expect(await inspectProtectedProfile(directory)).toEqual({ kind: "missing", profileId: "default" });
  expect(await listInterruptedProfiles(directory)).toContainEqual({ id: archivedId, kind: "setup", canAttemptRecovery: true, profileId: "default", preserved: true });
  await withInterruptedProfileSnapshot({ userData: directory, artifactId: archivedId, migrations,
    credential: { mode: "recovery", secret: recoverySecret } }, async ({ summary }) => expect(summary.tableCounts.Account).toBeGreaterThan(0));
  const retry = new ProtectedProfileSetup(directory, migrations);
  const pending = await retry.begin({ baseCurrency: "EUR", passphrase });
  expect(pending.recoverySecret).not.toBe(recoverySecret); await retry.cancel();
});

it("refuses preservation when a book already exists or the reviewed artifact list has changed", async () => {
  const before = await fs.readFile(path.join(stage, "book.sqlite"));
  await expect(preserveInterruptedSetup({ userData: directory, expectedIds: [artifactId] })).rejects.toThrow();
  await fs.rm(path.join(directory, "profiles", "default"), { recursive: true });
  await fs.mkdir(path.join(directory, "profiles", ".setup-default.lock"));
  await expect(preserveInterruptedSetup({ userData: directory, expectedIds: [artifactId] })).rejects.toThrow();
  await expect(preserveInterruptedSetup({ userData: directory, expectedIds: ["../default"] })).rejects.toThrow();
  expect(await fs.readFile(path.join(stage, "book.sqlite"))).toEqual(before);
});

it("retains every artifact after partial preservation failure and can preserve the remaining stale lock on retry", async () => {
  const profiles = path.join(directory, "profiles");
  await fs.rm(path.join(profiles, "default"), { recursive: true });
  await fs.mkdir(path.join(profiles, ".setup-default.lock"));
  const before = await fs.readFile(path.join(stage, "book.sqlite")), rename = fs.rename;
  let calls = 0;
  const fault = vi.spyOn(fs, "rename").mockImplementation(async (...args) => {
    if (++calls === 2) throw new Error("Injected move failure");
    return rename(...args);
  });
  await expect(preserveInterruptedSetup({ userData: directory, expectedIds: [artifactId, ".setup-default.lock"] })).rejects.toThrow();
  const artifacts = await listInterruptedProfiles(directory), archived = artifacts.find((item) => item.preserved && item.kind === "setup")!;
  expect(await fs.readFile(path.join(profiles, archived.id, "book.sqlite"))).toEqual(before);
  expect(artifacts).toContainEqual({ id: ".setup-default.lock", kind: "lock", canAttemptRecovery: false });
  fault.mockRestore();
  await preserveInterruptedSetup({ userData: directory, expectedIds: [".setup-default.lock"] });
  expect((await inspectProtectedProfile(directory)).kind).toBe("missing");
  expect(await fs.readFile(path.join(profiles, archived.id, "book.sqlite"))).toEqual(before);
});

it("honors cancellation before preservation without moving any artifacts", async () => {
  await fs.rm(path.join(directory, "profiles", "default"), { recursive: true });
  const abort = new AbortController(); abort.abort();
  await expect(preserveInterruptedSetup({ userData: directory, expectedIds: [artifactId], signal: abort.signal })).rejects.toThrow();
  expect(await fs.stat(stage)).toBeDefined();
});
