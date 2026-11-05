import { ProtectedProfileSetup, inspectProtectedProfile, readProtectedProfile } from "../services/protectedProfiles";
import { readActiveProfile } from "../services/personalProfiles";
import { KeychainProtector, unlockWithKeychain, unlockWithPassphrase } from "../services/profileKeys";
import type { SecurityState, SecurityStatus, SetupRequest } from "../shared/security";
import type { SetupPreservationResult } from "../shared/recovery";
import { listInterruptedProfiles, preserveInterruptedSetup } from "../services/interruptedProfiles";

type Dependencies = {
  keychain: KeychainProtector;
  osAuthenticationAvailable(): boolean;
  authenticateOS(): Promise<void>;
  cancelRecovery(): Promise<void>;
  confirmPreserveSetup(artifactIds: string[]): Promise<boolean>;
  database: { openEncryptedDatabase(file: string, migrations: string, key: Buffer): Promise<void>; disconnect(): Promise<void> };
  enrichment: { suspendForLock(): Promise<void>; resumeAfterUnlock(): void };
  onRevoked(): void | Promise<void>;
  onStateChanged(state: SecurityState): void;
  now(): number;
};

function inputRecord(input: unknown, required: string[], optional: string[] = []): asserts input is Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) || required.some((key) => !Object.hasOwn(input, key)) ||
    Object.keys(input).some((key) => !required.includes(key) && !optional.includes(key))) throw new Error("Invalid security input");
}
function passphraseInput(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length > 1024 || Buffer.byteLength(value) > 1024 || [...value].length < 12) {
    throw new Error("Passphrase must contain at least 12 characters and at most 1024 UTF-8 bytes");
  }
}

/** Owns authentication and every personal data IPC request. Never returns keys or raw errors. */
export class PersonalSecurity {
  private status: SecurityStatus = "initializing";
  private revision = 0;
  private epoch = 0;
  private methods = { keychain: false, passphrase: false };
  private reason: string | undefined;
  private profileId = "default";
  private selectionLoaded = false;
  private readonly setup: ProtectedProfileSetup;
  private operation: Promise<unknown> | undefined;
  private locking: Promise<void> | undefined;
  private requests = new Set<Promise<unknown>>();
  private failures = 0;
  private nextAttemptAt = 0;
  private maintenanceAbort: AbortController | undefined;

  constructor(private readonly userData: string, private readonly migrations: string, private readonly deps: Dependencies) {
    this.setup = new ProtectedProfileSetup(userData, migrations);
  }

  getState(): SecurityState {
    return { status: this.status, revision: this.revision, personal: true,
      osAuthenticationAvailable: this.deps.osAuthenticationAvailable() && this.deps.keychain.isAvailable(),
      methods: { ...this.methods }, ...(this.reason ? { reason: this.reason } : {}) };
  }
  getActiveProfile(): string { return this.profileId; }
  private transition(status: SecurityStatus, reason?: string) {
    this.status = status; this.reason = reason; this.revision++;
    this.deps.onStateChanged(this.getState());
  }
  private checkEpoch(epoch: number) { if (epoch !== this.epoch) throw new Error("Application is locked"); }
  private requireStatus(status: SecurityStatus) {
    if (this.status !== status || this.operation || this.locking) throw new Error("Security operation is not available in the current locked state");
  }

  async initialize() { await this.deps.enrichment.suspendForLock(); await this.inspect(); }
  private async inspect() {
    try {
      if (!this.selectionLoaded) {
        this.profileId = readActiveProfile(this.userData);
        this.selectionLoaded = true;
      }
      const profile = await inspectProtectedProfile(this.userData, this.profileId);
      if (profile.kind === "protected") {
        this.methods = profile.methods;
        this.transition("locked");
      } else if (profile.kind === "missing" && this.profileId === "default") {
        this.methods = { keychain: false, passphrase: false };
        this.transition("setup-required");
      } else this.transition("recovery-required", profile.kind === "legacy"
        ? "This profile is plaintext. Verified legacy conversion is required before opening it; the original has not been changed."
        : "This profile is incomplete or setup was interrupted. Preserve its files and use recovery; do not create a replacement.");
    } catch { this.transition("recovery-required", "Profile metadata could not be read safely. Preserve the existing files for recovery."); }
  }

  async beginSetup(input: SetupRequest) {
    this.requireStatus("setup-required");
    inputRecord(input, ["baseCurrency", "mode"], ["passphrase", "passphraseConfirmation"]);
    if (typeof input.baseCurrency !== "string" || !["keychain", "passphrase"].includes(input.mode)) throw new Error("Invalid security input");
    if (input.mode === "passphrase" || input.passphrase !== undefined) {
      passphraseInput(input.passphrase);
      if (input.passphrase !== input.passphraseConfirmation) throw new Error("Passphrases must match exactly");
    } else if (input.passphraseConfirmation !== undefined) throw new Error("Invalid security input");
    if (input.mode === "keychain" && !this.getState().osAuthenticationAvailable) throw new Error("OS authentication is unavailable; explicitly choose passphrase setup");
    const epoch = this.epoch;
    this.transition("setting-up");
    const operation = (async () => {
      await this.deps.cancelRecovery(); this.checkEpoch(epoch);
      if (input.mode === "keychain") await this.deps.authenticateOS();
      this.checkEpoch(epoch);
      const pending = await this.setup.begin({ baseCurrency: input.baseCurrency,
        ...(input.mode === "keychain" ? { keychain: this.deps.keychain } : {}),
        ...(input.passphrase !== undefined ? { passphrase: input.passphrase } : {}) });
      this.checkEpoch(epoch);
      this.transition("confirm-recovery");
      return pending;
    })();
    this.operation = operation;
    try { return await operation; }
    catch {
      if (epoch === this.epoch) { await this.setup.cancel(); await this.inspect(); }
      throw new Error("Unable to start protected setup. Check the selected currency and authentication method.");
    } finally { this.operation = undefined; }
  }

  async confirmSetup(input: { setupId: string; recoverySecret: string }) {
    this.requireStatus("confirm-recovery");
    inputRecord(input, ["setupId", "recoverySecret"]);
    if (typeof input.setupId !== "string" || input.setupId.length > 100 || typeof input.recoverySecret !== "string" || input.recoverySecret.length > 150) throw new Error("Invalid security input");
    const epoch = this.epoch;
    const operation = this.setup.confirm(input.setupId, input.recoverySecret);
    this.operation = operation;
    try { await operation; this.checkEpoch(epoch); await this.inspect(); }
    catch {
      // A wrong code can be retried. A consumed/failed setup can be cancelled to inspect
      // whether publication completed; never assume rejection means no files were written.
      throw new Error("Unable to confirm recovery. Re-enter the saved code, or cancel to check the profile's state.");
    } finally { this.operation = undefined; }
  }

  async unlock(input: { mode: "keychain" | "passphrase"; passphrase?: string }) {
    this.requireStatus("locked");
    inputRecord(input, ["mode"], ["passphrase"]);
    if (!["keychain", "passphrase"].includes(input.mode)) throw new Error("Invalid security input");
    if (input.mode === "passphrase") passphraseInput(input.passphrase);
    else if (input.passphrase !== undefined) throw new Error("Invalid security input");
    if (this.deps.now() < this.nextAttemptAt) throw new Error("Wait briefly before another unlock attempt");
    const epoch = this.epoch;
    this.transition("unlocking");
    const operation = (async () => {
      let key: Buffer | undefined;
      try {
        await this.deps.cancelRecovery(); this.checkEpoch(epoch);
        const profile = await readProtectedProfile(this.userData, this.profileId);
        this.checkEpoch(epoch);
        if (input.mode === "keychain") {
          if (!this.getState().osAuthenticationAvailable) throw new Error("OS authentication unavailable");
          await this.deps.authenticateOS();
          this.checkEpoch(epoch);
          key = await unlockWithKeychain(profile.envelope, this.deps.keychain, this.profileId);
        } else key = await unlockWithPassphrase(profile.envelope, input.passphrase!, this.profileId);
        this.checkEpoch(epoch);
        await this.deps.database.openEncryptedDatabase(profile.databaseFile, this.migrations, key);
        this.checkEpoch(epoch);
        this.deps.enrichment.resumeAfterUnlock();
        this.failures = 0; this.nextAttemptAt = 0;
        this.transition("unlocked");
      } finally { key?.fill(0); }
    })();
    this.operation = operation;
    try { await operation; }
    catch {
      await this.deps.database.disconnect();
      if (epoch === this.epoch) {
        this.nextAttemptAt = this.deps.now() + Math.min(++this.failures, 30) * 1000;
        this.transition("locked");
      }
      throw new Error("Unable to unlock. Authentication failed or the profile needs recovery.");
    } finally { this.operation = undefined; }
  }

  async preserveSetup(input: { artifactIds: string[] }): Promise<SetupPreservationResult> {
    this.requireStatus("recovery-required");
    inputRecord(input, ["artifactIds"]);
    if (!Array.isArray(input.artifactIds) || !input.artifactIds.length || input.artifactIds.length > 100 ||
      input.artifactIds.some((id) => typeof id !== "string" || id.length > 255) || new Set(input.artifactIds).size !== input.artifactIds.length) throw new Error("Invalid interrupted setup selection");
    const ids = [...input.artifactIds].sort(), epoch = this.epoch, abort = new AbortController();
    this.maintenanceAbort = abort; this.transition("recovering");
    const operation = (async (): Promise<SetupPreservationResult> => {
      await this.deps.cancelRecovery(); await this.setup.cancel(); this.checkEpoch(epoch);
      if (this.profileId !== "default" || (await inspectProtectedProfile(this.userData, "default")).kind !== "interrupted") throw new Error("Only unpublished setup can be preserved for retry");
      const actual = (await listInterruptedProfiles(this.userData)).filter((item) => item.id === ".setup-default.lock" || item.id.startsWith(".creating-default-")).map((item) => item.id).sort();
      if (JSON.stringify(actual) !== JSON.stringify(ids)) throw new Error("Interrupted setup changed; refresh before retrying");
      this.checkEpoch(epoch);
      const confirmed = await this.deps.confirmPreserveSetup([...ids]); this.checkEpoch(epoch);
      if (!confirmed) return { preserved: false };
      const artifacts = await preserveInterruptedSetup({ userData: this.userData, expectedIds: ids, signal: abort.signal });
      this.checkEpoch(epoch);
      return { preserved: true, artifacts };
    })();
    this.operation = operation;
    try { return await operation; }
    catch { throw new Error("Unable to preserve unfinished setup. Files are retained; refresh interrupted artifacts before retrying."); }
    finally {
      this.operation = undefined; this.maintenanceAbort = undefined;
      if (epoch === this.epoch) await this.inspect();
    }
  }

  async runData<T>(action: () => Promise<T>): Promise<T> {
    if (this.status !== "unlocked") throw new Error("Application is locked");
    const epoch = this.epoch;
    const request = Promise.resolve().then(() => { this.checkEpoch(epoch); return action(); }).then(
      (result) => { this.checkEpoch(epoch); return result; },
      (error) => { this.checkEpoch(epoch); throw error; });
    this.requests.add(request);
    try { return await request; } finally { this.requests.delete(request); }
  }

  async lock(): Promise<void> {
    if (this.locking) return this.locking;
    this.epoch++;
    this.maintenanceAbort?.abort();
    this.transition("locking");
    const revoked = this.deps.onRevoked();
    const operation = this.operation;
    const locking = (async () => {
      const settled = await Promise.allSettled([
        revoked, this.deps.database.disconnect(), this.deps.enrichment.suspendForLock(), this.setup.cancel(), this.deps.cancelRecovery(),
        operation?.catch(() => {}), ...Array.from(this.requests, (request) => request.catch(() => {})),
      ]);
      // An open that was already in progress must also be torn down after it settles.
      await this.deps.database.disconnect();
      if (settled.some((result) => result.status === "rejected")) throw new Error("Storage could not finish locking");
      await this.inspect();
    })();
    this.locking = locking;
    try { await locking; }
    catch { this.transition("recovery-required", "The application could not finish locking safely. Quit and reopen before using recovery."); }
    finally { this.locking = undefined; }
  }
}
