import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ProtectedProfileSetup, readProtectedProfile } from "./protectedProfiles";
import { ProtectedProfileRestore, selectProtectedProfile } from "./protectedRestore";
import { createProtectedBackup } from "./protectedBackup";
import * as backupService from "./protectedBackup";
import { unlockWithRecovery, unlockWithPassphrase, unlockWithKeychain } from "./profileKeys";
import { createEncryptedPrisma } from "./encryptedDatabase";
import { readActiveProfile } from "./personalProfiles";
import { AccountType, AccountSubtype } from "../shared/accountTypes";

const migrations = path.resolve("prisma/migrations");
const passphrase = "Replacement restored-profile passphrase";
const keychain = { isAvailable: () => true, encryptString: async (value: string) => Buffer.from(value), decryptString: async (value: Buffer) => value.toString() };
let directory: string, userData: string, backup: string, oldRecovery: string;
let restore: ProtectedProfileRestore;
let original: Awaited<ReturnType<typeof readProtectedProfile>>;
let originalKey: Buffer;
const begin = () => restore.begin({ source: backup, credential: { mode: "recovery", secret: oldRecovery }, passphrase });
const profileNames = async () => (await fs.readdir(path.join(userData, "profiles"))).sort();

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-restored-profile-"));
  userData = path.join(directory, "personal"); backup = path.join(directory, "saved.buckybackup");
  restore = new ProtectedProfileRestore(userData, migrations);
  const setup = new ProtectedProfileSetup(userData, migrations);
  const pending = await setup.begin({ baseCurrency: "EUR", keychain });
  oldRecovery = pending.recoverySecret; await setup.confirm(pending.setupId, oldRecovery);
  original = await readProtectedProfile(userData); originalKey = unlockWithRecovery(original.envelope, oldRecovery, "default");
  const db = createEncryptedPrisma(original.databaseFile, originalKey);
  try {
    await db.account.createMany({ data: [
      { id: "restore-cash", name: "Private recovery cash", type: AccountType.User, subtype: AccountSubtype.Asset, currency: "EUR" },
      { id: "restore-equity", name: "Private recovery equity", type: AccountType.System, subtype: AccountSubtype.Asset, currency: "EUR" },
    ] });
    await db.journalEntry.create({ data: { id: "restore-entry", date: "2026-09-01", description: "Private recovery posting", lines: { create: [
      { accountId: "restore-cash", amount: 123.45, currency: "EUR" },
      { accountId: "restore-equity", amount: -123.45, currency: "EUR" },
    ] } } });
  } finally { await db.$disconnect(); }
  await createProtectedBackup({ source: original.databaseFile, destination: backup, migrations, dataKey: originalKey, envelope: original.envelope });
});
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); await restore.cancel(); originalKey?.fill(0); await fs.rm(directory, { recursive: true, force: true }); });

it("requires a newly saved recovery code, then publishes a distinct encrypted profile with identical records", async () => {
  const later = createEncryptedPrisma(original.databaseFile, originalKey);
  try {
    await later.journalLine.updateMany({ where: { accountId: "restore-cash" }, data: { amount: 987.65 } });
    await later.journalLine.updateMany({ where: { accountId: "restore-equity" }, data: { amount: -987.65 } });
  } finally { await later.$disconnect(); }
  const bookBefore = await fs.readFile(original.databaseFile), backupBefore = await fs.readFile(backup);
  const pending = await begin();
  expect(pending.profileId).toMatch(/^restored-/); expect(pending.recoverySecret).not.toBe(oldRecovery);
  await expect(readProtectedProfile(userData, pending.profileId)).rejects.toThrow();
  await expect(restore.confirm(pending.restoreId, oldRecovery)).rejects.toThrow(/recovery/i);
  expect(readActiveProfile(userData)).toBe("default");
  const result = await restore.confirm(pending.restoreId, pending.recoverySecret);
  expect(result.profileId).toBe(pending.profileId); expect(result.summary).toEqual(pending.summary);
  expect(result.summary.tableCounts.JournalEntry).toBe(1); expect(result.summary.tableCounts.JournalLine).toBe(2);
  expect(result.summary.balances).toContainEqual({ accountId: "restore-cash", currency: "EUR", amount: 123.45 });
  const profile = await readProtectedProfile(userData, result.profileId);
  const key = await unlockWithPassphrase(profile.envelope, passphrase, result.profileId);
  expect(key).toEqual(originalKey);
  expect(unlockWithRecovery(profile.envelope, pending.recoverySecret, result.profileId)).toEqual(key);
  expect(profile.envelope.keychain).toBeUndefined();
  const prisma = createEncryptedPrisma(profile.databaseFile, key);
  try { expect(JSON.parse((await prisma.appSetting.findUniqueOrThrow({ where: { key: "baseCurrency" } })).jsonValue)).toBe("EUR"); }
  finally { await prisma.$disconnect(); key.fill(0); }
  for (const filename of [profile.databaseFile, profile.envelopeFile]) expect((await fs.stat(filename)).mode & 0o777).toBe(0o600);
  expect((await fs.stat(path.dirname(profile.databaseFile))).mode & 0o777).toBe(0o700);
  expect(await fs.readFile(original.databaseFile)).toEqual(bookBefore); expect(await fs.readFile(backup)).toEqual(backupBefore);
  expect(readActiveProfile(userData)).toBe("default");
  await expect(restore.confirm(pending.restoreId, pending.recoverySecret)).rejects.toThrow();
});

it("can bind an independently recovered book to a new machine's keychain", async () => {
  const newMachine = { ...keychain, encryptString: async (value: string) => Buffer.from(`new:${value}`), decryptString: async (value: Buffer) => value.toString().slice(4) };
  const pending = await restore.begin({ source: backup, credential: { mode: "recovery", secret: oldRecovery }, keychain: newMachine });
  await restore.confirm(pending.restoreId, pending.recoverySecret);
  const profile = await readProtectedProfile(userData, pending.profileId);
  expect(await unlockWithKeychain(profile.envelope, newMachine, pending.profileId)).toEqual(originalKey);
  await expect(unlockWithKeychain(profile.envelope, keychain, pending.profileId)).rejects.toThrow();
});

it("rejects wrong credentials and denied replacement protection without publishing or changing selection", async () => {
  const encryptString = vi.fn(async () => { throw new Error("Denied"); });
  await expect(restore.begin({ source: backup, credential: { mode: "recovery", secret: "wrong" }, keychain: { ...keychain, encryptString } })).rejects.toThrow();
  expect(encryptString).not.toHaveBeenCalled();
  await expect(restore.begin({ source: backup, credential: { mode: "recovery", secret: oldRecovery }, keychain: { ...keychain, encryptString }, passphrase })).rejects.toThrow();
  expect(await profileNames()).toEqual(["default"]); expect(readActiveProfile(userData)).toBe("default");
});

it("clears pending keys and staging on explicit cancellation and expiry", async () => {
  const pending = await begin();
  const key: Buffer = Reflect.get(restore, "pending").dataKey;
  await restore.cancel(); expect(key.equals(Buffer.alloc(32))).toBe(true);
  await expect(restore.confirm(pending.restoreId, pending.recoverySecret)).rejects.toThrow();
  expect(await profileNames()).toEqual(["default"]);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const next = await begin();
  const expiringKey: Buffer = Reflect.get(restore, "pending").dataKey;
  await vi.advanceTimersByTimeAsync(15 * 60_000);
  await restore.cancel(); expect(expiringKey.equals(Buffer.alloc(32))).toBe(true);
  await expect(restore.confirm(next.restoreId, next.recoverySecret)).rejects.toThrow();
  expect(await profileNames()).toEqual(["default"]);
});

it("waits for in-flight preparation on cancellation and refuses a competing operation", async () => {
  const verify = backupService.withVerifiedProtectedBackup;
  let proceed!: () => void, reached!: () => void;
  const ready = new Promise<void>((resolve) => { reached = resolve; }), resume = new Promise<void>((resolve) => { proceed = resolve; });
  vi.spyOn(backupService, "withVerifiedProtectedBackup").mockImplementationOnce(async (...args) => { reached(); await resume; return verify(...args); });
  const started = begin(), rejected = expect(started).rejects.toThrow(); await ready;
  let finished = false; const canceled = restore.cancel().then(() => { finished = true; });
  await Promise.resolve(); expect(finished).toBe(false); await expect(begin()).rejects.toThrow();
  proceed(); await rejected; await canceled; expect(await profileNames()).toEqual(["default"]);
});

it.each(["changed-book", "changed-envelope", "existing-target", "rename-failure"])("refuses %s at confirmation, preserving the original book", async (kind) => {
  const pending = await begin();
  const stage = path.join(userData, "profiles", (await profileNames()).find((name) => name.startsWith(".restoring-"))!);
  const before = await fs.readFile(original.databaseFile);
  if (kind === "changed-book") {
    const db = createEncryptedPrisma(path.join(stage, "book.sqlite"), originalKey);
    try { await db.account.updateMany({ data: { name: "Changed after preview" } }); } finally { await db.$disconnect(); }
  }
  if (kind === "changed-envelope") await fs.writeFile(path.join(stage, "profile.keys.json"), JSON.stringify(original.envelope));
  if (kind === "existing-target") await fs.mkdir(path.join(userData, "profiles", pending.profileId));
  if (kind === "rename-failure") vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("Disk full"));
  await expect(restore.confirm(pending.restoreId, pending.recoverySecret)).rejects.toThrow();
  expect(await fs.readFile(original.databaseFile)).toEqual(before); expect(readActiveProfile(userData)).toBe("default");
  expect((await profileNames()).filter((name) => name.startsWith("."))).toEqual([]);
  if (kind === "existing-target") expect(await fs.readdir(path.join(userData, "profiles", pending.profileId))).toEqual([]);
  else await expect(fs.stat(path.join(userData, "profiles", pending.profileId))).rejects.toThrow();
});

it("preserves a published book if final directory sync fails, without selecting it", async () => {
  const pending = await begin(); const open = fs.open;
  vi.spyOn(fs, "open").mockImplementation(async (...args) => {
    const handle = await open(...args);
    if (args[0] === path.join(userData, "profiles")) vi.spyOn(handle, "sync").mockRejectedValueOnce(new Error("fsync failed"));
    return handle;
  });
  await expect(restore.confirm(pending.restoreId, pending.recoverySecret)).rejects.toThrow(/published.*durability/i);
  expect((await readProtectedProfile(userData, pending.profileId)).profileId).toBe(pending.profileId);
  expect(readActiveProfile(userData)).toBe("default");
});

it("refuses symlinked storage without deleting unrelated interrupted restores", async () => {
  const otherRoot = path.join(directory, "other"), outside = path.join(directory, "outside");
  await fs.mkdir(otherRoot); await fs.mkdir(outside); await fs.symlink(outside, path.join(otherRoot, "profiles"));
  const other = new ProtectedProfileRestore(otherRoot, migrations);
  await expect(other.begin({ source: backup, credential: { mode: "recovery", secret: oldRecovery }, passphrase })).rejects.toThrow();
  expect(await fs.readdir(outside)).toEqual([]);
  const unrelated = path.join(userData, "profiles", ".restoring-interrupted-evidence"); await fs.mkdir(unrelated);
  await begin(); await restore.cancel(); expect(await profileNames()).toEqual([".restoring-interrupted-evidence", "default"]);
});

it("selects only a verified, authenticated profile for next launch and can return to the original", async () => {
  const pending = await begin(); await restore.confirm(pending.restoreId, pending.recoverySecret);
  await expect(selectProtectedProfile(userData, pending.profileId, Buffer.alloc(32), migrations)).rejects.toThrow();
  expect(readActiveProfile(userData)).toBe("default");
  await selectProtectedProfile(userData, pending.profileId, originalKey, migrations);
  expect(readActiveProfile(userData)).toBe(pending.profileId);
  await selectProtectedProfile(userData, "default", originalKey, migrations);
  expect(readActiveProfile(userData)).toBe("default");
  const marker = await fs.readFile(path.join(userData, "active-profile.json"));
  vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("Write failed"));
  await expect(selectProtectedProfile(userData, pending.profileId, originalKey, migrations)).rejects.toThrow();
  expect(await fs.readFile(path.join(userData, "active-profile.json"))).toEqual(marker);
});

it("honors cancellation during the last asynchronous check before profile publication", async () => {
  const pending = await begin();
  const destination = path.join(userData, "profiles", pending.profileId);
  const open = fs.open, lstat = fs.lstat;
  let synced = false, cancellation: Promise<void> | undefined;
  vi.spyOn(fs, "open").mockImplementation(async (...args) => {
    const handle = await open(...args);
    if (String(args[0]).includes("/.restoring-") && !String(args[0]).endsWith(".json") && !String(args[0]).endsWith(".sqlite")) synced = true;
    return handle;
  });
  vi.spyOn(fs, "lstat").mockImplementation((...args) => {
    if (synced && args[0] === destination && !cancellation) cancellation = restore.cancel();
    return lstat(...args);
  });
  await expect(restore.confirm(pending.restoreId, pending.recoverySecret)).rejects.toThrow();
  expect(cancellation).toBeDefined(); await cancellation;
  expect(await profileNames()).toEqual(["default"]);
});

it("preserves a profile when cancellation arrives after the publication rename", async () => {
  const pending = await begin(); const rename = fs.rename;
  let cancellation: Promise<void> | undefined;
  vi.spyOn(fs, "rename").mockImplementationOnce(async (...args) => { await rename(...args); cancellation = restore.cancel(); });
  await restore.confirm(pending.restoreId, pending.recoverySecret); await cancellation;
  expect((await readProtectedProfile(userData, pending.profileId)).profileId).toBe(pending.profileId);
  expect(readActiveProfile(userData)).toBe("default");
});

it("retains ownership of a failed lock cleanup and refuses new work until cleanup is retried", async () => {
  const pending = await begin();
  vi.spyOn(fs, "rmdir").mockRejectedValueOnce(new Error("Cleanup failed"));
  await expect(restore.confirm(pending.restoreId, pending.recoverySecret)).rejects.toThrow();
  await expect(begin()).rejects.toThrow(/cleanup|progress/i);
  await restore.cancel();
  expect((await profileNames()).some((name) => name.startsWith(".restore-"))).toBe(false);
  expect((await readProtectedProfile(userData, pending.profileId)).profileId).toBe(pending.profileId);
});

it("honors cancellation during the final selection check and preserves the old selection", async () => {
  const pending = await begin(); await restore.confirm(pending.restoreId, pending.recoverySecret);
  const controller = new AbortController(); const open = fs.open, lstat = fs.lstat;
  let staged = false;
  vi.spyOn(fs, "open").mockImplementation(async (...args) => {
    const handle = await open(...args);
    if (String(args[0]).includes(".active-profile-") && args[1] === "wx") staged = true;
    return handle;
  });
  vi.spyOn(fs, "lstat").mockImplementation((...args) => {
    if (staged && args[0] === path.join(userData, "profiles", pending.profileId)) controller.abort();
    return lstat(...args);
  });
  await expect(selectProtectedProfile(userData, pending.profileId, originalKey, migrations, controller.signal)).rejects.toThrow();
  expect(readActiveProfile(userData)).toBe("default");
  expect((await fs.readdir(userData)).some((name) => name.startsWith(".active-profile-"))).toBe(false);
});
