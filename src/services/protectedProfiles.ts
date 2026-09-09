import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import { randomUUID, timingSafeEqual } from "crypto";
import { profileDatabasePath } from "./personalProfiles";
import { createProfileKeys, KeychainProtector, parseKeyEnvelope, ProfileKeyEnvelope,
  serializeKeyEnvelope, unlockWithRecovery } from "./profileKeys";
import { createEncryptedPrisma, initializeEncryptedDatabase } from "./encryptedDatabase";
import { databaseService } from "./database";
import { SUPPORTED_CURRENCY_OPTIONS } from "../shared/currencies";

const ENVELOPE_FILE = "profile.keys.json";
const SETUP_LIFETIME_MS = 15 * 60_000;
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";
async function exists(filename: string): Promise<boolean> {
  try { await fs.lstat(filename); return true; } catch (error) { if (missing(error)) return false; throw error; }
}
function locations(userData: string, profileId: string) {
  const databaseFile = profileDatabasePath(userData, profileId);
  return { databaseFile, envelopeFile: path.join(path.dirname(databaseFile), ENVELOPE_FILE),
    directory: path.dirname(databaseFile), profiles: path.dirname(path.dirname(databaseFile)) };
}

/** The caller chooses userData, but profiles and their children may not redirect outside it. */
async function validateDirectories(userData: string, profileId: string): Promise<void> {
  const paths = locations(userData, profileId);
  if (!await exists(userData)) return;
  const root = await fs.realpath(userData);
  for (const directory of [paths.profiles, paths.directory]) {
    if (!await exists(directory)) break;
    const relative = path.relative(userData, directory);
    if (!(await fs.lstat(directory)).isDirectory() || await fs.realpath(directory) !== path.join(root, relative)) {
      throw new Error("Protected profile storage must be a directory inside application storage");
    }
  }
}

/** Bounded reads and no symlink following, including for damaged/untrusted envelope files. */
async function readPrivateFile(filename: string, maximum: number, prefixOnly = false): Promise<Buffer> {
  const file = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (!prefixOnly && stat.size > maximum)) throw new Error("Invalid protected profile envelope or file");
    const bytes = Buffer.alloc(maximum + (prefixOnly ? 0 : 1));
    let read = 0;
    while (read < bytes.length) {
      const result = await file.read(bytes, read, bytes.length - read, read);
      if (!result.bytesRead) break;
      read += result.bytesRead;
    }
    if (!prefixOnly && read > maximum) throw new Error("Invalid protected profile envelope or file");
    return bytes.subarray(0, read);
  } finally { await file.close(); }
}

export async function readProtectedProfile(userData: string, profileId = "default") {
  const paths = locations(userData, profileId);
  await validateDirectories(userData, profileId);
  const envelope = parseKeyEnvelope((await readPrivateFile(paths.envelopeFile, 65536)).toString("utf8"));
  if (envelope.profileId !== profileId || (!envelope.keychain && !envelope.passphrase)) {
    throw new Error("Protected profile key metadata does not match this profile");
  }
  const header = await readPrivateFile(paths.databaseFile, 16, true);
  if (header.length !== 16 || header.toString() === "SQLite format 3\0") throw new Error("Protected profile database is missing or not encrypted");
  return { profileId, databaseFile: paths.databaseFile, envelopeFile: paths.envelopeFile, envelope };
}

export type ProtectedProfileState = { kind: "missing" | "legacy" | "incomplete" | "interrupted"; profileId: string }
  | { kind: "protected"; profileId: string; methods: { keychain: boolean; passphrase: boolean } };

/** Reads only bounded metadata/header bytes. Does not unlock or connect to the book. */
export async function inspectProtectedProfile(userData: string, profileId = "default"): Promise<ProtectedProfileState> {
  const paths = locations(userData, profileId);
  await validateDirectories(userData, profileId);
  if (!await exists(paths.directory)) {
    const names = await fs.readdir(paths.profiles).catch((error) => { if (missing(error)) return []; throw error; });
    return { profileId, kind: names.some((name) => name === `.setup-${profileId}.lock` || name.startsWith(`.creating-${profileId}-`))
      ? "interrupted" : "missing" };
  }
  if (!await exists(paths.envelopeFile)) {
    if (await exists(paths.databaseFile) && (await readPrivateFile(paths.databaseFile, 16, true)).toString() === "SQLite format 3\0") {
      return { kind: "legacy", profileId };
    }
    return { kind: "incomplete", profileId };
  }
  const { envelope } = await readProtectedProfile(userData, profileId);
  return { kind: "protected", profileId, methods: { keychain: Boolean(envelope.keychain), passphrase: Boolean(envelope.passphrase) } };
}

async function syncPath(filename: string) {
  const file = await fs.open(filename, "r");
  try { await file.sync(); } finally { await file.close(); }
}

type SetupOptions = { baseCurrency: string; keychain?: KeychainProtector; passphrase?: string };
type PendingSetup = { setupId: string; expires: number; baseCurrency: string; envelope: ProfileKeyEnvelope; dataKey: Buffer };

/** Trusted main-process controller. Only the one-time recovery presentation belongs in a
 * dedicated protected setup view; raw keys/envelopes must never enter renderer state or IPC.
 */
export class ProtectedProfileSetup {
  private pending: PendingSetup | undefined;
  private operation: Promise<unknown> | undefined;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private epoch = 0;

  constructor(private readonly userData: string, private readonly migrations: string) {
    locations(userData, "default");
  }

  async begin(options: SetupOptions): Promise<{ setupId: string; recoverySecret: string }> {
    if (this.operation || this.pending) throw new Error("A protected setup is already in progress");
    if (!SUPPORTED_CURRENCY_OPTIONS.some((option) => option.code === options.baseCurrency)) throw new Error("Select a supported base currency");
    const epoch = ++this.epoch;
    const operation = (async () => {
      const state = await inspectProtectedProfile(this.userData);
      if (state.kind !== "missing") throw new Error(`Cannot create a profile: existing or ${state.kind} profile requires recovery`);
      const keys = await createProfileKeys("default", options);
      if (epoch !== this.epoch) { keys.dataKey.fill(0); throw new Error("Protected setup was cancelled"); }
      const setupId = randomUUID();
      this.pending = { setupId, expires: Date.now() + SETUP_LIFETIME_MS, baseCurrency: options.baseCurrency,
        envelope: keys.envelope, dataKey: keys.dataKey };
      this.expiryTimer = setTimeout(() => this.clearPending(), SETUP_LIFETIME_MS);
      this.expiryTimer.unref?.();
      return { setupId, recoverySecret: keys.recoverySecret };
    })();
    this.operation = operation;
    try { return await operation; } finally { this.operation = undefined; }
  }

  async confirm(setupId: string, recoverySecret: string): Promise<{ profileId: "default" }> {
    if (this.operation) throw new Error("A protected setup operation is already in progress");
    const pending = this.pending;
    if (!pending || pending.setupId !== setupId) throw new Error("Protected setup is no longer available");
    if (Date.now() >= pending.expires) {
      this.clearPending();
      throw new Error("Protected setup expired; generate new recovery material");
    }
    let recovered: Buffer | undefined;
    try {
      recovered = unlockWithRecovery(pending.envelope, recoverySecret, "default");
      if (!timingSafeEqual(recovered, pending.dataKey)) throw new Error("Key mismatch");
    } catch { throw new Error("Re-enter the saved recovery code to confirm protection"); }
    finally { recovered?.fill(0); }
    this.pending = undefined; // Confirm is single-use, including when provisioning fails.
    clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
    const epoch = this.epoch;
    const operation = this.publish(pending, recoverySecret, () => {
      if (epoch !== this.epoch) throw new Error("Protected setup was cancelled");
    });
    this.operation = operation;
    try { await operation; return { profileId: "default" }; }
    finally { pending.dataKey.fill(0); this.operation = undefined; }
  }

  async cancel(): Promise<void> {
    this.epoch++;
    this.clearPending();
    await this.operation?.catch(() => {});
    this.clearPending();
  }

  private clearPending() {
    clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
    this.pending?.dataKey.fill(0);
    this.pending = undefined;
  }

  private async publish(pending: PendingSetup, recoverySecret: string, checkCancelled: () => void) {
    const paths = locations(this.userData, "default");
    const lock = path.join(paths.profiles, ".setup-default.lock");
    let locked = false;
    let staging: string | undefined;
    let published = false;
    try {
      checkCancelled();
      await fs.mkdir(paths.profiles, { recursive: true, mode: 0o700 });
      await validateDirectories(this.userData, "default");
      // All setup publishers cooperate on this exclusive lock. A stale lock is recovery
      // evidence, not permission to retry over a potentially recoverable staged profile.
      await fs.mkdir(lock, { mode: 0o700 });
      locked = true;
      if (await exists(paths.directory)) throw new Error("Existing profile cannot be replaced");
      const names = await fs.readdir(paths.profiles);
      if (names.some((name) => name.startsWith(".creating-default-"))) throw new Error("Interrupted setup requires recovery");
      staging = await fs.mkdtemp(path.join(paths.profiles, ".creating-default-"));
      const keyFile = await fs.open(path.join(staging, ENVELOPE_FILE), "wx", 0o600);
      try { await keyFile.writeFile(serializeKeyEnvelope(pending.envelope)); await keyFile.sync(); }
      finally { await keyFile.close(); }
      checkCancelled();
      const book = path.join(staging, "book.sqlite");
      await initializeEncryptedDatabase(book, this.migrations, pending.dataKey);
      const prisma = createEncryptedPrisma(book, pending.dataKey);
      try {
        await prisma.$transaction(async (tx) => {
          await tx.appSetting.create({ data: { key: "baseCurrency", jsonValue: JSON.stringify(pending.baseCurrency) } });
          await databaseService.ensureDefaultAccounts(tx);
        });
      } finally { await prisma.$disconnect(); }
      // Verify the durable envelope can independently recover and reopen the saved book.
      const persisted = parseKeyEnvelope((await readPrivateFile(path.join(staging, ENVELOPE_FILE), 65536)).toString("utf8"));
      const key = unlockWithRecovery(persisted, recoverySecret, "default");
      const reopened = createEncryptedPrisma(book, key);
      try {
        const setting = await reopened.appSetting.findUniqueOrThrow({ where: { key: "baseCurrency" } });
        if (JSON.parse(setting.jsonValue) !== pending.baseCurrency || !await reopened.account.count()) {
          throw new Error("Protected profile initialization verification failed");
        }
      } finally { await reopened.$disconnect(); key.fill(0); }
      await syncPath(book);
      await syncPath(staging);
      checkCancelled();
      if (await exists(paths.directory)) throw new Error("Existing profile cannot be replaced");
      await fs.rename(staging, paths.directory);
      staging = undefined;
      published = true;
      await syncPath(paths.profiles);
      await syncPath(this.userData);
    } catch (error) {
      throw new Error(published
        ? "Profile was created but durability confirmation failed; unlock or recover the existing profile instead of creating another"
        : "Protected profile setup failed; existing profiles were not replaced", { cause: error });
    } finally {
      if (staging) await fs.rm(staging, { recursive: true, force: true });
      if (locked) await fs.rmdir(lock);
    }
  }
}
