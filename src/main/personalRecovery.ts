import type { RecoveryResult, RecoveryState, RecoverySummary, LegacyConversionRequest, InterruptedRecoveryRequest } from "../shared/recovery";
import type { ProfileAuthentication as Authentication, ProtectedRestoreRequest as RestoreRequest,
  PendingProtectedRestore as PendingRestore } from "../shared/recovery";
import type { SecurityStatus } from "../shared/security";
import type { KeychainProtector } from "../services/profileKeys";
import { unlockWithKeychain, unlockWithPassphrase } from "../services/profileKeys";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { inspectProtectedProfile, readProtectedProfile, validateDirectories } from "../services/protectedProfiles";
import { profileDatabasePath, readActiveProfile } from "../services/personalProfiles";
import { createProtectedBackup } from "../services/protectedBackup";
import { ProtectedProfileRestore, selectProtectedProfile } from "../services/protectedRestore";
import { listInterruptedProfiles } from "../services/interruptedProfiles";

type Dependencies = { getStatus(): SecurityStatus; getActiveProfile(): string; keychain: KeychainProtector;
  osAuthenticationAvailable(): boolean; authenticateOS(): Promise<void>; now(): number;
  chooseBackupDirectory(): Promise<string | undefined>; chooseBackupFile(): Promise<string | undefined>;
  chooseLegacyFile(): Promise<string | undefined>;
  confirmSelection(profileId: string): Promise<boolean> };

export class PersonalRecovery {
  private readonly restore: ProtectedProfileRestore;
  private operation: Promise<unknown> | undefined;
  private canceling: Promise<void> | undefined;
  private abort: AbortController | undefined;
  private pendingRestore: string | undefined;
  private nextAttemptAt = 0;
  private failures = 0;
  private cleanupRequired = false;

  constructor(private readonly userData: string, private readonly migrations: string, private readonly deps: Dependencies) {
    this.restore = new ProtectedProfileRestore(userData, migrations);
  }

  private available() {
    if (!["locked", "unlocked", "setup-required", "recovery-required"].includes(this.deps.getStatus())) {
      throw new RecoveryError("Recovery is unavailable during a security operation or lock");
    }
  }
  private check(signal: AbortSignal) { signal.throwIfAborted(); this.available(); }
  private async run<T>(action: (signal: AbortSignal) => Promise<T>, allowPending = false): Promise<T> {
    this.available();
    if (this.operation || this.canceling || this.cleanupRequired || (!allowPending && this.pendingRestore)) throw new RecoveryError("Another recovery operation or cleanup is pending; confirm or cancel it first");
    const abort = new AbortController(); this.abort = abort;
    const operation = Promise.resolve().then(() => { this.check(abort.signal); return action(abort.signal); });
    this.operation = operation;
    try { const result = await operation; this.check(abort.signal); return result; }
    catch (error) {
      if (abort.signal.aborted) throw new RecoveryError("Recovery canceled by lock or cancellation; check published files before retrying");
      throw error instanceof RecoveryError ? error : new RecoveryError("Recovery failed. Preserve existing files and check profiles before retrying.");
    } finally { this.operation = undefined; this.abort = undefined; }
  }

  async getState(): Promise<RecoveryState> {
    return this.run(async (signal) => {
      await validateDirectories(this.userData, "default");
      let entries: import("fs").Dirent[];
      try { entries = await fs.readdir(path.join(this.userData, "profiles"), { withFileTypes: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") entries = []; else throw new RecoveryError("Unable to list protected profiles"); }
      const profiles: Array<{ id: string }> = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^(default|restored-[a-zA-Z0-9-]+)$/.test(entry.name)) continue;
        try { if ((await inspectProtectedProfile(this.userData, entry.name)).kind === "protected") profiles.push({ id: entry.name }); }
        catch { /* A damaged profile is preserved but cannot be selected here. */ }
      }
      this.check(signal);
      let nextProfile: string;
      try { nextProfile = readActiveProfile(this.userData); }
      catch { nextProfile = ""; } // Recovery must remain possible when the selection is damaged.
      const interruptedArtifacts = await listInterruptedProfiles(this.userData);
      const unfinishedSetupIds = this.deps.getStatus() === "recovery-required" && this.deps.getActiveProfile() === "default" &&
        (await inspectProtectedProfile(this.userData, "default")).kind === "interrupted"
        ? interruptedArtifacts.filter((item) => item.id === ".setup-default.lock" || item.id.startsWith(".creating-default-")).map((item) => item.id) : [];
      this.check(signal);
      return { available: true, activeProfile: this.deps.getActiveProfile(), nextProfile, interruptedArtifacts, unfinishedSetupIds,
        profiles: profiles.sort((a, b) => a.id.localeCompare(b.id)) };
    }, true);
  }

  private async authenticated<T>(profileId: string, input: Authentication, signal: AbortSignal,
    action: (profile: Awaited<ReturnType<typeof readProtectedProfile>>, key: Buffer) => Promise<T>): Promise<T> {
    if (this.deps.now() < this.nextAttemptAt) throw new RecoveryError("Wait briefly before another authentication attempt");
    let key: Buffer | undefined;
    try {
      let profile: Awaited<ReturnType<typeof readProtectedProfile>>;
      try {
        profile = await readProtectedProfile(this.userData, profileId); this.check(signal);
        if (input.mode === "keychain") {
          if (!this.deps.osAuthenticationAvailable() || !this.deps.keychain.isAvailable()) throw new RecoveryError();
          await this.deps.authenticateOS(); this.check(signal);
          key = await unlockWithKeychain(profile.envelope, this.deps.keychain, profileId);
        } else key = await unlockWithPassphrase(profile.envelope, input.passphrase!, profileId);
        this.check(signal);
      } catch {
        if (!signal.aborted) this.nextAttemptAt = this.deps.now() + Math.min(++this.failures, 30) * 1000;
        throw new RecoveryError("Unable to authenticate the selected profile");
      }
      this.failures = 0; this.nextAttemptAt = 0;
      return await action(profile, key);
    } finally { key?.fill(0); }
  }

  async createBackup(input: Authentication): Promise<RecoveryResult | undefined> {
    authentication(input);
    if (this.deps.getStatus() !== "unlocked") throw new RecoveryError("Backup requires an unlocked book");
    return this.run((signal) => this.authenticated(this.deps.getActiveProfile(), input, signal, async (profile, dataKey) => {
      const directory = await this.deps.chooseBackupDirectory(); this.check(signal);
      if (!directory) return;
      const destination = path.join(directory, `bucky-v1-${Date.now()}-${randomUUID()}.buckybackup`);
      try { return await createProtectedBackup({ source: profile.databaseFile, destination, dataKey,
        envelope: profile.envelope, migrations: this.migrations, signal }); }
      catch { throw new RecoveryError("Backup failed. A file may already have been published; check the chosen folder before retrying."); }
    }));
  }

  async beginRestore(input: RestoreRequest): Promise<PendingRestore | undefined> {
    record(input, ["credential", "protection"]);
    recoveryCredential(input.credential);
    authentication(input.protection, true);
    return this.prepareRecovery(input.protection, () => this.deps.chooseBackupFile(), (source, protection) =>
      this.restore.begin({ source, credential: input.credential, ...protection }));
  }

  async beginLegacy(input: LegacyConversionRequest): Promise<PendingRestore | undefined> {
    record(input, ["acknowledgePlaintext", "protection"]);
    if (input.acknowledgePlaintext !== true) throw new RecoveryError("Acknowledge that the original book and its copies remain plaintext");
    authentication(input.protection, true);
    return this.prepareRecovery(input.protection, () => this.deps.chooseLegacyFile(), (source, protection) =>
      this.restore.beginLegacy({ source, acknowledgePlaintext: true, ...protection }));
  }

  async beginInterrupted(input: InterruptedRecoveryRequest): Promise<PendingRestore | undefined> {
    record(input, ["artifactId", "acknowledgeSnapshot", "credential", "protection"]);
    if (typeof input.artifactId !== "string" || input.artifactId.length > 255) throw new RecoveryError("Invalid interrupted artifact");
    if (input.acknowledgeSnapshot !== true) throw new RecoveryError("Acknowledge that this interrupted snapshot needs verification against your records");
    recoveryCredential(input.credential); authentication(input.protection, true);
    return this.prepareRecovery(input.protection, async () => {
      const selected = (await listInterruptedProfiles(this.userData)).find((item) => item.id === input.artifactId && item.canAttemptRecovery);
      if (!selected) throw new RecoveryError("Choose an available interrupted snapshot; preserve other artifacts and use a backup or original source");
      return selected.id;
    }, (artifactId, protection) => this.restore.beginInterrupted({ artifactId, acknowledgeSnapshot: true, credential: input.credential, ...protection }));
  }

  private prepareRecovery(protection: RestoreRequest["protection"], chooseSource: () => Promise<string | undefined>,
    prepare: (source: string, protection: { keychain?: KeychainProtector; passphrase?: string }) => Promise<PendingRestore>) {
    return this.run(async (signal) => {
      if (this.deps.now() < this.nextAttemptAt) throw new RecoveryError("Wait briefly before another authentication attempt");
      const source = await chooseSource(); this.check(signal);
      if (!source) return;
      if (protection.mode === "keychain") {
        if (!this.deps.osAuthenticationAvailable() || !this.deps.keychain.isAvailable()) throw new RecoveryError("OS authentication unavailable; explicitly choose a passphrase");
        try { await this.deps.authenticateOS(); }
        catch { throw new RecoveryError("Unable to authenticate replacement protection"); }
        this.check(signal);
      }
      try {
        const pending = await prepare(source, {
          ...(protection.mode === "keychain" ? { keychain: this.deps.keychain } : {}),
          ...(protection.passphrase !== undefined ? { passphrase: protection.passphrase } : {}) });
        this.check(signal); this.pendingRestore = pending.restoreId;
        this.failures = 0; this.nextAttemptAt = 0;
        return pending;
      } catch {
        if (!signal.aborted) this.nextAttemptAt = this.deps.now() + Math.min(++this.failures, 30) * 1000;
        throw new RecoveryError("Unable to prepare recovery. Check the selected source, credential, and matching app version.");
      }
    });
  }

  async confirmRestore(input: { restoreId: string; recoverySecret: string }): Promise<{ profileId: string; summary: RecoverySummary }> {
    record(input, ["restoreId", "recoverySecret"]);
    if (typeof input.restoreId !== "string" || input.restoreId.length > 100 || typeof input.recoverySecret !== "string" || input.recoverySecret.length > 150) throw new RecoveryError("Invalid recovery input");
    return this.run(async (signal) => {
      if (input.restoreId !== this.pendingRestore) throw new RecoveryError("No matching pending recovery");
      try {
        const result = await this.restore.confirm(input.restoreId, input.recoverySecret);
        this.check(signal); this.pendingRestore = undefined;
        return result;
      } catch { throw new RecoveryError("Unable to confirm recovery. Re-enter the NEW saved code, or cancel and check profiles; publication may already have completed."); }
    }, true);
  }

  async selectProfile(input: { profileId: string; authentication: Authentication }): Promise<boolean> {
    record(input, ["profileId", "authentication"]);
    if (typeof input.profileId !== "string") throw new RecoveryError("Invalid personal profile");
    profileDatabasePath(this.userData, input.profileId);
    authentication(input.authentication);
    return this.run((signal) => this.authenticated(input.profileId, input.authentication, signal, async (_profile, key) => {
      const confirmed = await this.deps.confirmSelection(input.profileId); this.check(signal);
      if (!confirmed) return false;
      try { await selectProtectedProfile(this.userData, input.profileId, key, this.migrations, signal); }
      catch { throw new RecoveryError("Selection failed; check the next-launch profile before retrying. No book was deleted."); }
      return true;
    }));
  }

  async cancel(): Promise<void> {
    if (this.canceling) return this.canceling;
    this.abort?.abort();
    const operation = this.operation;
    this.cleanupRequired = true;
    const canceling = (async () => {
      // Always drain the owner, even when the first cleanup attempt fails.
      const results = await Promise.allSettled([this.restore.cancel(), operation]);
      await this.restore.cancel(); // Also drain preparation that was entering the controller.
      if (results[0].status === "rejected") throw new RecoveryError("Recovery cleanup failed; cancel again before continuing");
      this.pendingRestore = undefined; this.cleanupRequired = false;
    })();
    this.canceling = canceling;
    try { await canceling; } finally { this.canceling = undefined; }
  }
}

function record(input: unknown, required: string[], optional: string[] = []): asserts input is Record<string, any> {
  if (!input || typeof input !== "object" || Array.isArray(input) || required.some((key) => !Object.hasOwn(input, key)) ||
    Object.keys(input).some((key) => !required.includes(key) && !optional.includes(key))) throw new RecoveryError("Invalid recovery input");
}
function authentication(input: unknown, replacement = false): asserts input is RestoreRequest["protection"] {
  record(input, ["mode"], replacement ? ["passphrase", "passphraseConfirmation"] : ["passphrase"]);
  if (!["keychain", "passphrase"].includes(input.mode)) throw new RecoveryError("Invalid authentication input");
  if (input.mode === "passphrase" || (replacement && input.passphrase !== undefined)) {
    if (typeof input.passphrase !== "string" || [...input.passphrase].length < 12 || Buffer.byteLength(input.passphrase) > 1024) throw new RecoveryError("Passphrase must contain at least 12 characters and at most 1024 UTF-8 bytes");
    if (replacement && input.passphrase !== input.passphraseConfirmation) throw new RecoveryError("Passphrases must match exactly");
  } else if (input.passphrase !== undefined || input.passphraseConfirmation !== undefined) throw new RecoveryError("Invalid authentication input");
}
function recoveryCredential(input: unknown): asserts input is RestoreRequest["credential"] {
  record(input, ["mode", "secret"]);
  if (!["recovery", "passphrase"].includes(input.mode) || typeof input.secret !== "string" || !input.secret || Buffer.byteLength(input.secret) > 1024) throw new RecoveryError("Invalid recovery input");
}

/** Only deliberate, non-sensitive messages may cross IPC. */
class RecoveryError extends Error {}
