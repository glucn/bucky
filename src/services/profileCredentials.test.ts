import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ProtectedProfileSetup, readProtectedProfile } from "./protectedProfiles";
import { updateProfileCredentials, preserveCredentialUpdateLock } from "./profileCredentials";
import { unlockWithRecovery, unlockWithPassphrase, unlockWithKeychain, replacePassphrase, serializeKeyEnvelope } from "./profileKeys";
import { createEncryptedPrisma } from "./encryptedDatabase";
import { listInterruptedProfiles } from "./interruptedProfiles";

const migrations = path.resolve("prisma/migrations"), oldPassphrase = "Original synthetic passphrase", newPassphrase = "Replacement synthetic passphrase";
const keychain = { isAvailable: () => true, encryptString: async (v: string) => Buffer.from(v), decryptString: async (v: Buffer) => v.toString() };
let directory: string, key: Buffer, recoverySecret: string;
let original: Awaited<ReturnType<typeof readProtectedProfile>>;
const update = (change: { passphrase: string } | { keychain: typeof keychain }, signal?: AbortSignal) =>
  updateProfileCredentials({ userData: directory, profileId: "default", dataKey: key, expectedEnvelope: original.envelope, change, signal });
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-credentials-"));
  const setup = new ProtectedProfileSetup(directory, migrations);
  const pending = await setup.begin({ baseCurrency: "CAD", keychain, passphrase: oldPassphrase });
  recoverySecret = pending.recoverySecret; await setup.confirm(pending.setupId, recoverySecret);
  original = await readProtectedProfile(directory); key = unlockWithRecovery(original.envelope, recoverySecret, "default");
});
afterEach(async () => { vi.restoreAllMocks(); key.fill(0); await fs.rm(directory, { recursive: true, force: true }); });

it("atomically persists a verified replacement passphrase while preserving the book, keychain, recovery code, and old copies", async () => {
  const before = await fs.readFile(original.databaseFile), oldEnvelope = serializeKeyEnvelope(original.envelope), keyBefore = Buffer.from(key);
  await update({ passphrase: newPassphrase });
  const saved = await readProtectedProfile(directory);
  await expect(unlockWithPassphrase(saved.envelope, oldPassphrase, "default")).rejects.toThrow();
  const fresh = await unlockWithPassphrase(saved.envelope, newPassphrase, "default");
  try {
    expect(fresh).toEqual(key);
    const db = createEncryptedPrisma(saved.databaseFile, fresh);
    try { expect(JSON.parse((await db.appSetting.findUniqueOrThrow({ where: { key: "baseCurrency" } })).jsonValue)).toBe("CAD"); }
    finally { await db.$disconnect(); }
  } finally { fresh.fill(0); }
  const recovered = unlockWithRecovery(saved.envelope, recoverySecret, "default");
  const osKey = await unlockWithKeychain(saved.envelope, keychain, "default");
  const retained = await unlockWithPassphrase(original.envelope, oldPassphrase, "default");
  try { expect(recovered).toEqual(key); expect(osKey).toEqual(key); expect(retained).toEqual(key); }
  finally { recovered.fill(0); osKey.fill(0); retained.fill(0); }
  expect(saved.envelope.recovery).toEqual(original.envelope.recovery); expect(saved.envelope.keychain).toEqual(original.envelope.keychain);
  expect(saved.envelope.keyId).toBe(original.envelope.keyId);
  expect(await fs.readFile(original.databaseFile)).toEqual(before); expect(serializeKeyEnvelope(original.envelope)).toBe(oldEnvelope);
  expect(key).toEqual(keyBefore); keyBefore.fill(0);
  expect((await fs.stat(saved.envelopeFile)).mode & 0o777).toBe(0o600);
  expect((await fs.readdir(path.dirname(saved.envelopeFile))).some((name) => name.startsWith(".credentials-"))).toBe(false);
});

it("can refresh the OS wrap without changing configured passphrase or independent recovery", async () => {
  const replacement = { ...keychain, encryptString: async (v: string) => Buffer.from(`new:${v}`), decryptString: async (v: Buffer) => v.toString().slice(4) };
  await update({ keychain: replacement }); const saved = await readProtectedProfile(directory);
  const recovered = await unlockWithKeychain(saved.envelope, replacement, "default");
  try { expect(recovered).toEqual(key); } finally { recovered.fill(0); }
  await expect(unlockWithKeychain(saved.envelope, keychain, "default")).rejects.toThrow();
  expect(saved.envelope.passphrase).toEqual(original.envelope.passphrase); expect(saved.envelope.recovery).toEqual(original.envelope.recovery);
});

it.each(["wrong-key", "stale-envelope", "linked-envelope", "existing-lock", "denied-keychain"])("refuses %s without replacing the persisted credentials", async (kind) => {
  if (kind === "wrong-key") key.fill(19);
  if (kind === "stale-envelope") {
    const replacement = await replacePassphrase(original.envelope, key, "Concurrent synthetic passphrase", "default");
    await fs.writeFile(original.envelopeFile, serializeKeyEnvelope(replacement));
  }
  if (kind === "linked-envelope") {
    const elsewhere = path.join(directory, "retained.keys"); await fs.rename(original.envelopeFile, elsewhere); await fs.symlink(elsewhere, original.envelopeFile);
  }
  if (kind === "existing-lock") await fs.mkdir(path.join(directory, "profiles", ".credentials-default.lock"));
  const before = await fs.readFile(original.envelopeFile);
  await expect(update(kind === "denied-keychain" ? { keychain: { ...keychain, encryptString: async () => { throw new Error("denied"); } } } : { passphrase: newPassphrase })).rejects.toThrow();
  expect(await fs.readFile(original.envelopeFile)).toEqual(before);
});

it("refuses competing changes while the first writer owns the credential lock", async () => {
  let finish!: () => void;
  const delayed = { ...keychain, encryptString: async (v: string) => { await new Promise<void>((resolve) => { finish = resolve; }); return Buffer.from(v); } };
  const first = update({ keychain: delayed });
  await vi.waitFor(() => expect(finish).toBeDefined());
  await expect(update({ passphrase: newPassphrase })).rejects.toThrow(/progress|lock/i);
  finish(); await first;
});

it("keeps old credentials on write failure and allows a clean retry", async () => {
  const before = await fs.readFile(original.envelopeFile), open = fs.open;
  const fault = vi.spyOn(fs, "open").mockImplementation(async (filename, ...args) => {
    if (path.basename(String(filename)).startsWith(".credentials-")) throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
    return (open as any)(filename, ...args);
  });
  await expect(update({ passphrase: newPassphrase })).rejects.toThrow(); expect(await fs.readFile(original.envelopeFile)).toEqual(before);
  fault.mockRestore(); await update({ passphrase: newPassphrase });
});

it("checks cancellation after final metadata reads and before publication", async () => {
  const before = await fs.readFile(original.envelopeFile), abort = new AbortController(), open = fs.open;
  let reads = 0;
  vi.spyOn(fs, "open").mockImplementation(async (filename, ...args) => {
    const file = await (open as any)(filename, ...args);
    if (String(filename) === original.envelopeFile && ++reads === 2) abort.abort();
    return file;
  });
  await expect(update({ passphrase: newPassphrase }, abort.signal)).rejects.toThrow();
  expect(reads).toBeGreaterThanOrEqual(2); expect(await fs.readFile(original.envelopeFile)).toEqual(before);
});

it("preserves a published replacement when final directory sync fails", async () => {
  const open = fs.open;
  vi.spyOn(fs, "open").mockImplementation(async (filename, ...args) => {
    const file = await (open as any)(filename, ...args);
    if (String(filename) === path.dirname(original.envelopeFile)) file.sync = async () => { throw new Error("sync failure"); };
    return file;
  });
  await expect(update({ passphrase: newPassphrase })).rejects.toThrow(/published/i);
  const saved = await readProtectedProfile(directory);
  const recovered = await unlockWithPassphrase(saved.envelope, newPassphrase, "default");
  try { expect(recovered).toEqual(key); } finally { recovered.fill(0); }
});

it("detects a concurrent envelope replacement during credential generation", async () => {
  let finish!: () => void;
  const delayed = { ...keychain, encryptString: async (v: string) => { await new Promise<void>((resolve) => { finish = resolve; }); return Buffer.from(v); } };
  const updating = update({ keychain: delayed });
  const rejected = expect(updating).rejects.toThrow(/retained|publication/i);
  await vi.waitFor(() => expect(finish).toBeDefined());
  const concurrent = await replacePassphrase(original.envelope, key, "Concurrent replacement passphrase", "default");
  await fs.writeFile(original.envelopeFile, serializeKeyEnvelope(concurrent));
  finish(); await rejected;
  expect(await fs.readFile(original.envelopeFile, "utf8")).toBe(serializeKeyEnvelope(concurrent));
});

it("refuses tampered recovery metadata in the staged replacement even when the chosen new credential would work", async () => {
  const before = await fs.readFile(original.envelopeFile), open = fs.open;
  vi.spyOn(fs, "open").mockImplementation(async (filename, ...args) => {
    const file = await (open as any)(filename, ...args);
    if (path.basename(String(filename)).startsWith(".credentials-") && args[0] === "wx") {
      const write = file.writeFile.bind(file);
      file.writeFile = async (value: string) => {
        const record = JSON.parse(value); record.recovery.tag = (record.recovery.tag[0] === "A" ? "B" : "A") + record.recovery.tag.slice(1);
        await write(JSON.stringify(record));
      };
    }
    return file;
  });
  await expect(update({ passphrase: newPassphrase })).rejects.toThrow();
  expect(await fs.readFile(original.envelopeFile)).toEqual(before);
});

it("preserves an already published replacement when cancellation arrives after rename", async () => {
  const rename = fs.rename, abort = new AbortController();
  vi.spyOn(fs, "rename").mockImplementation(async (...args) => { await rename(...args); abort.abort(); });
  await update({ passphrase: newPassphrase }, abort.signal);
  const saved = await readProtectedProfile(directory), recovered = await unlockWithPassphrase(saved.envelope, newPassphrase, "default");
  try { expect(recovered).toEqual(key); } finally { recovered.fill(0); }
});

it("keeps published credentials usable and inventories a lock when cleanup cannot finish", async () => {
  const rmdir = fs.rmdir;
  const fault = vi.spyOn(fs, "rmdir").mockImplementation(async (...args) => {
    if (String(args[0]).endsWith(".credentials-default.lock")) throw new Error("cleanup failed");
    return (rmdir as any)(...args);
  });
  await expect(update({ passphrase: newPassphrase })).rejects.toThrow(/published/i);
  fault.mockRestore();
  expect(await listInterruptedProfiles(directory)).toContainEqual({ id: ".credentials-default.lock", kind: "lock", canAttemptRecovery: false });
  const saved = await readProtectedProfile(directory), recovered = await unlockWithPassphrase(saved.envelope, newPassphrase, "default");
  try { expect(recovered).toEqual(key); } finally { recovered.fill(0); }
});

it("rejects a new OS wrap that cannot be independently decrypted before publishing it", async () => {
  const before = await fs.readFile(original.envelopeFile);
  await expect(update({ keychain: { ...keychain, decryptString: async () => "unreadable" } })).rejects.toThrow();
  expect(await fs.readFile(original.envelopeFile)).toEqual(before);
});

it("can add a passphrase to a keychain-only profile without replacing its other protection", async () => {
  delete original.envelope.passphrase;
  await fs.writeFile(original.envelopeFile, serializeKeyEnvelope(original.envelope));
  await update({ passphrase: newPassphrase });
  const saved = await readProtectedProfile(directory), recovered = await unlockWithPassphrase(saved.envelope, newPassphrase, "default");
  try { expect(recovered).toEqual(key); } finally { recovered.fill(0); }
  expect(saved.envelope.keychain).toEqual(original.envelope.keychain); expect(saved.envelope.recovery).toEqual(original.envelope.recovery);
});

it("retains a reviewed stale lock by rename after current-key verification, then permits a new update", async () => {
  const lock = path.join(directory, "profiles", ".credentials-default.lock");
  await fs.mkdir(lock); await fs.writeFile(path.join(lock, "retained-diagnostic"), "synthetic retained content");
  const before = await fs.readFile(original.envelopeFile);
  const preservedId = await preserveCredentialUpdateLock({ userData: directory, profileId: "default", dataKey: key, expectedEnvelope: original.envelope });
  expect(await fs.readFile(path.join(directory, "profiles", preservedId, "retained-diagnostic"), "utf8")).toBe("synthetic retained content");
  expect(await fs.readFile(original.envelopeFile)).toEqual(before);
  expect(await listInterruptedProfiles(directory)).toContainEqual({ id: preservedId, kind: "lock", canAttemptRecovery: false, preserved: true });
  await update({ passphrase: newPassphrase });
});

it("refuses stale-lock preservation for a wrong key, changed envelope, linked lock, or revoked operation", async () => {
  const lock = path.join(directory, "profiles", ".credentials-default.lock"); await fs.mkdir(lock);
  const wrong = Buffer.alloc(32, 22);
  await expect(preserveCredentialUpdateLock({ userData: directory, profileId: "default", dataKey: wrong, expectedEnvelope: original.envelope })).rejects.toThrow();
  const abort = new AbortController(); abort.abort();
  await expect(preserveCredentialUpdateLock({ userData: directory, profileId: "default", dataKey: key, expectedEnvelope: original.envelope, signal: abort.signal })).rejects.toThrow();
  const fresh = await replacePassphrase(original.envelope, key, newPassphrase, "default"); await fs.writeFile(original.envelopeFile, serializeKeyEnvelope(fresh));
  await expect(preserveCredentialUpdateLock({ userData: directory, profileId: "default", dataKey: key, expectedEnvelope: original.envelope })).rejects.toThrow();
  await fs.rmdir(lock); await fs.symlink(path.dirname(original.envelopeFile), lock);
  await expect(preserveCredentialUpdateLock({ userData: directory, profileId: "default", dataKey: key, expectedEnvelope: fresh })).rejects.toThrow();
  expect((await fs.lstat(lock)).isSymbolicLink()).toBe(true);
});
