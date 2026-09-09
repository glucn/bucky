import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { ProtectedProfileSetup, inspectProtectedProfile, readProtectedProfile } from "./protectedProfiles";
import { KeychainProtector, unlockWithPassphrase, unlockWithRecovery } from "./profileKeys";
import { createEncryptedPrisma } from "./encryptedDatabase";
import * as encryptedDatabase from "./encryptedDatabase";
import { initializePersonalDatabase } from "./localDatabase";

const migrations = path.resolve("prisma/migrations");
const passphrase = "Personal setup test passphrase";
// A synthetic keychain; no real OS credentials are accessed by this suite.
const keychain: KeychainProtector = {
  isAvailable: () => true,
  encryptString: async (value) => Buffer.from(`test-only:${value}`),
  decryptString: async (value) => value.toString().slice("test-only:".length),
};
let directory: string;
let userData: string;
let setup: ProtectedProfileSetup;

describe("protected profile provisioning", () => {
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-protected-setup-"));
    userData = path.join(directory, "user-data");
    setup = new ProtectedProfileSetup(userData, migrations);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await setup.cancel();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("does not write a book or envelope before the recovery code is correctly re-entered", async () => {
    expect(await inspectProtectedProfile(userData)).toEqual({ kind: "missing", profileId: "default" });
    const pending = await setup.begin({ baseCurrency: "CAD", keychain });
    expect(pending.recoverySecret).toMatch(/^bucky-recovery-v1-/);
    await expect(fs.stat(userData)).rejects.toThrow();
    await expect(setup.confirm(pending.setupId, "incorrect recovery")).rejects.toThrow(/recovery/i);
    await expect(fs.stat(userData)).rejects.toThrow();
    await setup.confirm(pending.setupId, pending.recoverySecret);
    expect(await inspectProtectedProfile(userData)).toEqual({ kind: "protected", profileId: "default", methods: { keychain: true, passphrase: false } });
    await expect(setup.confirm(pending.setupId, pending.recoverySecret)).rejects.toThrow(/setup/i);
    await expect(setup.begin({ baseCurrency: "EUR", keychain })).rejects.toThrow(/existing/i);
  });

  it("publishes matching keys and an encrypted book seeded only after explicit currency selection", async () => {
    const pending = await setup.begin({ baseCurrency: "CAD", passphrase });
    await setup.confirm(pending.setupId, pending.recoverySecret);
    const profile = await readProtectedProfile(userData);
    const key = unlockWithRecovery(profile.envelope, pending.recoverySecret, "default");
    const ordinary = await unlockWithPassphrase(profile.envelope, passphrase, "default");
    expect(ordinary).toEqual(key);
    const prisma = createEncryptedPrisma(profile.databaseFile, key);
    try {
      expect(JSON.parse((await prisma.appSetting.findUniqueOrThrow({ where: { key: "baseCurrency" } })).jsonValue)).toBe("CAD");
      const accounts = await prisma.account.findMany();
      expect(accounts.length).toBeGreaterThan(0);
      expect(accounts.every((account) => account.currency === "CAD")).toBe(true);
      expect(await prisma.journalEntry.count()).toBe(0);
    } finally { await prisma.$disconnect(); key.fill(0); ordinary.fill(0); }
    const content = await fs.readFile(profile.envelopeFile, "utf8");
    expect(content).not.toContain(passphrase);
    expect(content).not.toContain(pending.recoverySecret);
    expect((await fs.readFile(profile.databaseFile)).subarray(0, 16).toString()).not.toBe("SQLite format 3\0");
    expect((await fs.stat(profile.envelopeFile)).mode & 0o777).toBe(0o600);
    expect((await fs.stat(profile.databaseFile)).mode & 0o777).toBe(0o600);
    expect((await fs.stat(path.dirname(profile.databaseFile))).mode & 0o777).toBe(0o700);
    expect(await fs.readdir(path.join(userData, "profiles"))).toEqual(["default"]);
  });

  it.each(["", "ZZZ", "cad"])("rejects unsupported or implicit currency %j without writing anything", async (baseCurrency) => {
    await expect(setup.begin({ baseCurrency, keychain })).rejects.toThrow(/currency/i);
    await expect(fs.stat(userData)).rejects.toThrow();
  });

  it("requires a deliberately selected credential mode and does not fall back from denied keychain access", async () => {
    await expect(setup.begin({ baseCurrency: "CAD" })).rejects.toThrow();
    await expect(setup.begin({ baseCurrency: "CAD", passphrase, keychain: { ...keychain,
      encryptString: async () => { throw new Error("denied"); },
    } })).rejects.toThrow(/keychain/i);
    await expect(fs.stat(userData)).rejects.toThrow();
  });

  it("invalidates cancelled and expired setup requests", async () => {
    const pending = await setup.begin({ baseCurrency: "CAD", keychain });
    await setup.cancel();
    await expect(setup.confirm(pending.setupId, pending.recoverySecret)).rejects.toThrow(/setup/i);
    const next = await setup.begin({ baseCurrency: "CAD", keychain });
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60_000);
    await expect(setup.confirm(next.setupId, next.recoverySecret)).rejects.toThrow(/expired/i);
    await expect(fs.stat(userData)).rejects.toThrow();
  });

  it("clears pending key material when its setup lifetime expires without further user input", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = await setup.begin({ baseCurrency: "CAD", keychain });
    const ownedKey: Buffer = Reflect.get(setup, "pending").dataKey;
    vi.advanceTimersByTime(15 * 60_000);
    expect(ownedKey.equals(Buffer.alloc(32))).toBe(true);
    await expect(setup.confirm(pending.setupId, pending.recoverySecret)).rejects.toThrow(/setup/i);
    await expect(fs.stat(userData)).rejects.toThrow();
  });

  it("waits for cancelled initialization to settle and never publishes its staged profile", async () => {
    const pending = await setup.begin({ baseCurrency: "CAD", keychain });
    let reached!: () => void;
    let proceed!: () => void;
    const ready = new Promise<void>((resolve) => { reached = resolve; });
    const resume = new Promise<void>((resolve) => { proceed = resolve; });
    const initialize = encryptedDatabase.initializeEncryptedDatabase;
    vi.spyOn(encryptedDatabase, "initializeEncryptedDatabase").mockImplementationOnce(async (...args) => {
      reached(); await resume; return initialize(...args);
    });
    const confirmed = setup.confirm(pending.setupId, pending.recoverySecret);
    const rejected = expect(confirmed).rejects.toThrow(/setup failed/i);
    await ready;
    let cancelled = false;
    const cancellation = setup.cancel().then(() => { cancelled = true; });
    await Promise.resolve();
    expect(cancelled).toBe(false);
    proceed();
    await rejected;
    await cancellation;
    expect(await fs.readdir(path.join(userData, "profiles"))).toEqual([]);
  });

  it("never replaces a legacy book, an existing protected book, or even an empty destination directory", async () => {
    const destination = path.join(userData, "profiles", "default");
    await fs.mkdir(destination, { recursive: true });
    await expect(setup.begin({ baseCurrency: "CAD", keychain })).rejects.toThrow(/existing|incomplete/i);
    await initializePersonalDatabase(path.join(destination, "book.sqlite"), migrations);
    const before = await fs.readFile(path.join(destination, "book.sqlite"));
    expect((await inspectProtectedProfile(userData)).kind).toBe("legacy");
    await expect(setup.begin({ baseCurrency: "CAD", keychain })).rejects.toThrow(/existing|legacy/i);
    expect(await fs.readFile(path.join(destination, "book.sqlite"))).toEqual(before);
  });

  it("removes only its unpublished staging files when publication fails", async () => {
    const pending = await setup.begin({ baseCurrency: "CAD", keychain });
    vi.spyOn(fs, "rename").mockRejectedValueOnce(Object.assign(new Error("disk full"), { code: "ENOSPC" }));
    await expect(setup.confirm(pending.setupId, pending.recoverySecret)).rejects.toThrow();
    expect(await fs.readdir(path.join(userData, "profiles"))).toEqual([]);
    expect((await inspectProtectedProfile(userData)).kind).toBe("missing");
    await expect(setup.confirm(pending.setupId, pending.recoverySecret)).rejects.toThrow(/setup/i);
  });

  it("creates no database when the durable envelope cannot be written", async () => {
    const pending = await setup.begin({ baseCurrency: "CAD", keychain });
    const open = fs.open;
    vi.spyOn(fs, "open").mockImplementation(async (...args) => {
      if (String(args[0]).endsWith("profile.keys.json")) throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
      return open(...args);
    });
    const initialize = vi.spyOn(encryptedDatabase, "initializeEncryptedDatabase");
    await expect(setup.confirm(pending.setupId, pending.recoverySecret)).rejects.toThrow(/setup failed/i);
    expect(initialize).not.toHaveBeenCalled();
    expect(await fs.readdir(path.join(userData, "profiles"))).toEqual([]);
  });

  it("does not publish a profile if applying its bundled migrations fails", async () => {
    const broken = path.join(directory, "broken-migrations");
    await fs.cp(migrations, broken, { recursive: true });
    const extra = path.join(broken, "20990101000000_broken");
    await fs.mkdir(extra);
    await fs.writeFile(path.join(extra, "migration.sql"), "CREATE TABLE PartialSetup(id TEXT); INSERT INTO MissingTable VALUES (1);");
    const failed = new ProtectedProfileSetup(userData, broken);
    try {
      const pending = await failed.begin({ baseCurrency: "CAD", keychain });
      await expect(failed.confirm(pending.setupId, pending.recoverySecret)).rejects.toThrow(/setup failed/i);
      expect(await fs.readdir(path.join(userData, "profiles"))).toEqual([]);
    } finally { await failed.cancel(); }
  });

  it("preserves a published profile if final durability confirmation fails", async () => {
    const pending = await setup.begin({ baseCurrency: "CAD", keychain });
    const open = fs.open;
    vi.spyOn(fs, "open").mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (String(args[0]) === path.join(userData, "profiles")) {
        vi.spyOn(handle, "sync").mockRejectedValueOnce(new Error("fsync failed"));
      }
      return handle;
    });
    await expect(setup.confirm(pending.setupId, pending.recoverySecret)).rejects.toThrow(/created but durability/i);
    const profile = await readProtectedProfile(userData);
    const key = unlockWithRecovery(profile.envelope, pending.recoverySecret, "default");
    key.fill(0);
    await expect(setup.begin({ baseCurrency: "CAD", keychain })).rejects.toThrow(/existing/i);
    expect(await fs.readdir(path.join(userData, "profiles"))).toEqual(["default"]);
  });

  it("refuses stale setup locks without deleting interruption evidence", async () => {
    await fs.mkdir(path.join(userData, "profiles", ".setup-default.lock"), { recursive: true });
    expect((await inspectProtectedProfile(userData)).kind).toBe("interrupted");
    await expect(setup.begin({ baseCurrency: "CAD", keychain })).rejects.toThrow(/interrupted/i);
    expect(await fs.readdir(path.join(userData, "profiles"))).toEqual([".setup-default.lock"]);
  });

  it("allows only one publisher when two setup controllers target the same profile", async () => {
    const second = new ProtectedProfileSetup(userData, migrations);
    const a = await setup.begin({ baseCurrency: "CAD", keychain });
    const b = await second.begin({ baseCurrency: "EUR", keychain });
    try {
      const results = await Promise.allSettled([setup.confirm(a.setupId, a.recoverySecret), second.confirm(b.setupId, b.recoverySecret)]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const profile = await readProtectedProfile(userData);
      const winner = results[0].status === "fulfilled" ? a : b;
      const key = unlockWithRecovery(profile.envelope, winner.recoverySecret, "default");
      key.fill(0);
      expect(await fs.readdir(path.join(userData, "profiles"))).toEqual(["default"]);
    } finally { await second.cancel(); }
  });

  it("refuses symlinked profile storage and oversized or mismatched key envelopes", async () => {
    const outside = path.join(directory, "outside");
    await fs.mkdir(outside);
    await fs.mkdir(userData);
    await fs.symlink(outside, path.join(userData, "profiles"));
    await expect(setup.begin({ baseCurrency: "CAD", keychain })).rejects.toThrow(/storage|directory/i);
    expect(await fs.readdir(outside)).toEqual([]);
    await fs.unlink(path.join(userData, "profiles"));
    const pending = await setup.begin({ baseCurrency: "CAD", keychain });
    await setup.confirm(pending.setupId, pending.recoverySecret);
    const profile = await readProtectedProfile(userData);
    await fs.writeFile(profile.envelopeFile, "x".repeat(65537));
    await expect(readProtectedProfile(userData)).rejects.toThrow(/envelope/i);
    await fs.writeFile(profile.envelopeFile, JSON.stringify({ ...profile.envelope, profileId: "restored-other" }));
    await expect(readProtectedProfile(userData)).rejects.toThrow(/profile/i);
  });
});
