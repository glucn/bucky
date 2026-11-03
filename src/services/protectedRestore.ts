import fs from "fs/promises";
import { constants } from "fs";
import path from "path";
import { randomUUID, timingSafeEqual } from "crypto";
import { profileDatabasePath } from "./personalProfiles";
import { readPrivateFile, readProtectedProfile, syncPath, validateDirectories } from "./protectedProfiles";
import { createProfileKeys, rebindProfileKeys, parseKeyEnvelope, serializeKeyEnvelope, unlockWithRecovery, verifyProfileKey,
  type KeychainProtector, type ProfileKeyEnvelope } from "./profileKeys";
import { validateEncryptedRecoveryDatabase, withVerifiedProtectedBackup } from "./protectedBackup";
import type { RecoverySummary } from "../shared/recovery";
import { withVerifiedLegacyConversion } from "./legacyConversion";

const LIFETIME = 15 * 60_000;
type Options = { source: string; credential: { mode: "recovery" | "passphrase"; secret: string };
  keychain?: KeychainProtector; passphrase?: string };
type LegacyOptions = { source: string; acknowledgePlaintext: true; keychain?: KeychainProtector; passphrase?: string };
type Pending = { restoreId: string; profileId: string; expires: number; dataKey: Buffer;
  envelope: ProfileKeyEnvelope; summary: RecoverySummary };
async function exists(filename: string) {
  try { await fs.lstat(filename); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

/** Trusted-process restore transaction. OS authentication and user consent belong to the main
 * owner before entry; no raw key or envelope is returned to its setup/recovery presentation.
 */
export class ProtectedProfileRestore {
  private pending: Pending | undefined;
  private operation: Promise<unknown> | undefined;
  private canceling: Promise<void> | undefined;
  private ownedStaging: string | undefined;
  private ownedLock: string | undefined;
  private abort: AbortController | undefined;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly userData: string, private readonly migrations: string) {
    profileDatabasePath(userData, "default"); // Validate the trusted root before accepting work.
  }

  async begin(options: Options): Promise<{ restoreId: string; profileId: string; recoverySecret: string; summary: RecoverySummary }> {
    return this.start(options);
  }

  /** Conversion never replaces the legacy book or hides its retained plaintext copies. */
  async beginLegacy(options: LegacyOptions): Promise<{ restoreId: string; profileId: string; recoverySecret: string; summary: RecoverySummary }> {
    if (options.acknowledgePlaintext !== true) throw new Error("Acknowledge that the original plaintext book and its copies remain unencrypted");
    return this.start(options);
  }

  private async start(options: Options | LegacyOptions) {
    if (this.operation || this.pending || this.canceling || this.ownedStaging || this.ownedLock) throw new Error("A protected restore or cleanup is already in progress");
    const abort = new AbortController(); this.abort = abort;
    const operation = this.prepare(options, abort.signal); this.operation = operation;
    try { return await operation; }
    finally { this.operation = undefined; }
  }

  private async prepare(options: Options | LegacyOptions, signal: AbortSignal) {
    const profileId = `restored-${Date.now()}-${randomUUID()}`;
    const profiles = path.dirname(path.dirname(profileDatabasePath(this.userData, profileId)));
    let key: Buffer | undefined;
    try {
      await validateDirectories(this.userData, profileId);
      await fs.mkdir(profiles, { recursive: true, mode: 0o700 });
      await validateDirectories(this.userData, profileId);
      const stage = async (databaseFile: string, envelope: ProfileKeyEnvelope, recoverySecret: string, summary: RecoverySummary) => {
        signal.throwIfAborted();
        this.ownedStaging = await fs.mkdtemp(path.join(profiles, `.restoring-${profileId}-`));
        await fs.copyFile(databaseFile, path.join(this.ownedStaging, "book.sqlite"), constants.COPYFILE_EXCL);
        const file = await fs.open(path.join(this.ownedStaging, "profile.keys.json"), "wx", 0o600);
        try { await file.writeFile(serializeKeyEnvelope(envelope)); await file.sync(); } finally { await file.close(); }
        signal.throwIfAborted();
        return { envelope, recoverySecret, summary };
      };
      let result: { envelope: ProfileKeyEnvelope; recoverySecret: string; summary: RecoverySummary };
      if ("acknowledgePlaintext" in options) {
        const created = await createProfileKeys(profileId, options); key = created.dataKey;
        signal.throwIfAborted();
        result = await withVerifiedLegacyConversion({ source: options.source, stagingParent: profiles,
          migrations: this.migrations, dataKey: key, signal }, (verified) =>
          stage(verified.databaseFile, created.envelope, created.recoverySecret, verified.summary));
      } else {
        result = await withVerifiedProtectedBackup({ source: options.source, stagingParent: profiles,
          migrations: this.migrations, credential: options.credential, signal }, async (verified) => {
          signal.throwIfAborted(); key = Buffer.from(verified.dataKey);
          const rebound = await rebindProfileKeys(verified.envelope, key, verified.envelope.profileId, profileId, options);
          return stage(verified.databaseFile, rebound.envelope, rebound.recoverySecret, verified.summary);
        });
      }
      signal.throwIfAborted();
      const restoreId = randomUUID();
      this.pending = { restoreId, profileId, expires: Date.now() + LIFETIME, dataKey: key!, envelope: result.envelope, summary: result.summary };
      key = undefined; // Ownership transfers to pending; all other exit paths wipe the local copy.
      this.expiryTimer = setTimeout(() => { void this.cancel().catch(() => {}); }, LIFETIME);
      this.expiryTimer.unref?.();
      return { restoreId, profileId, recoverySecret: result.recoverySecret, summary: structuredClone(result.summary) };
    } catch {
      key?.fill(0); await this.clearOwnedFiles();
      throw new Error("Unable to prepare protected restore; existing profiles and selection were not changed");
    }
  }

  async confirm(restoreId: string, recoverySecret: string): Promise<{ profileId: string; summary: RecoverySummary }> {
    if (this.operation || this.canceling) throw new Error("A protected restore operation is already in progress");
    const pending = this.pending;
    if (!pending || pending.restoreId !== restoreId) throw new Error("Protected restore is no longer available");
    if (Date.now() >= pending.expires) { await this.cancel(); throw new Error("Protected restore expired; start recovery again"); }
    let recovered: Buffer | undefined;
    try {
      recovered = unlockWithRecovery(pending.envelope, recoverySecret, pending.profileId);
      if (!timingSafeEqual(recovered, pending.dataKey)) throw new Error("Key mismatch");
    } catch { throw new Error("Re-enter the newly saved recovery code to confirm the restored profile"); }
    finally { recovered?.fill(0); }
    this.pending = undefined; clearTimeout(this.expiryTimer); this.expiryTimer = undefined;
    const operation = this.publish(pending, recoverySecret, this.abort!.signal); this.operation = operation;
    try { return await operation; }
    finally { pending.dataKey.fill(0); this.operation = undefined; this.abort = undefined; }
  }

  async cancel(): Promise<void> {
    if (this.canceling) return this.canceling;
    this.abort?.abort(); clearTimeout(this.expiryTimer); this.expiryTimer = undefined;
    this.pending?.dataKey.fill(0); this.pending = undefined;
    const operation = this.operation;
    const canceling = (async () => {
      await operation?.catch(() => {});
      this.pending?.dataKey.fill(0); this.pending = undefined;
      await this.clearOwnedFiles(); this.abort = undefined;
    })();
    this.canceling = canceling;
    try { await canceling; } finally { this.canceling = undefined; }
  }

  private async clearOwnedFiles() {
    // Retain ownership on cleanup failure so a later cancel can retry, while begin stays blocked.
    if (this.ownedStaging) { await fs.rm(this.ownedStaging, { recursive: true, force: true }); this.ownedStaging = undefined; }
    if (this.ownedLock) { await fs.rmdir(this.ownedLock); this.ownedLock = undefined; }
  }

  private async publish(pending: Pending, recoverySecret: string, signal: AbortSignal) {
    const destination = path.dirname(profileDatabasePath(this.userData, pending.profileId));
    const profiles = path.dirname(destination), lock = path.join(profiles, `.restore-${pending.profileId}.lock`);
    let published = false;
    try {
      signal.throwIfAborted(); await validateDirectories(this.userData, pending.profileId);
      await fs.mkdir(lock, { mode: 0o700 }); this.ownedLock = lock;
      if (await exists(destination)) throw new Error("Existing profile cannot be replaced");
      const staging = this.ownedStaging!;
      const envelope = parseKeyEnvelope((await readPrivateFile(path.join(staging, "profile.keys.json"), 65536)).toString("utf8"));
      if (serializeKeyEnvelope(envelope) !== serializeKeyEnvelope(pending.envelope)) throw new Error("Staged envelope changed");
      const key = unlockWithRecovery(envelope, recoverySecret, pending.profileId);
      let summary: RecoverySummary;
      try { summary = await validateEncryptedRecoveryDatabase(path.join(staging, "book.sqlite"), key, this.migrations, signal); }
      finally { key.fill(0); }
      if (JSON.stringify(summary) !== JSON.stringify(pending.summary)) throw new Error("Staged records changed");
      await syncPath(path.join(staging, "book.sqlite")); await syncPath(staging);
      signal.throwIfAborted(); await validateDirectories(this.userData, pending.profileId);
      if (await exists(destination)) throw new Error("Existing profile cannot be replaced");
      signal.throwIfAborted();
      await fs.rename(staging, destination); this.ownedStaging = undefined; published = true;
      await syncPath(profiles); await syncPath(this.userData);
      return { profileId: pending.profileId, summary };
    } catch {
      throw new Error(published ? "Restored profile was published but durability confirmation failed; preserve the existing profile"
        : "Protected restore failed; existing profiles and selection were not changed");
    } finally {
      await this.clearOwnedFiles();
    }
  }
}

/** Explicit next-launch selection only; main must obtain authentication and native confirmation.
 * No running connection is switched and the current profile is never deleted.
 */
export async function selectProtectedProfile(userData: string, profileId: string, dataKey: Buffer,
  migrations: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const profile = await readProtectedProfile(userData, profileId);
  verifyProfileKey(profile.envelope, dataKey, profileId);
  await validateEncryptedRecoveryDatabase(profile.databaseFile, dataKey, migrations, signal);
  const temporary = path.join(userData, `.active-profile-${randomUUID()}.json`);
  let created = false, published = false;
  try {
    const file = await fs.open(temporary, "wx", 0o600); created = true;
    try { await file.writeFile(JSON.stringify({ id: profileId })); await file.sync(); } finally { await file.close(); }
    signal?.throwIfAborted(); await validateDirectories(userData, profileId);
    signal?.throwIfAborted();
    await fs.rename(temporary, path.join(userData, "active-profile.json")); published = true;
    await syncPath(userData);
  } catch {
    throw new Error(published ? "Profile selection was published but durability confirmation failed; check selection after restart"
      : "Unable to select protected profile; existing selection was not changed");
  } finally { if (created && !published) await fs.unlink(temporary); }
}
