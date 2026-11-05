import type { CredentialChangeRequest } from "../shared/security";
import type { KeychainProtector } from "../services/profileKeys";
import { unlockWithKeychain, unlockWithPassphrase, unlockWithRecovery } from "../services/profileKeys";
import { readProtectedProfile } from "../services/protectedProfiles";
import { CredentialUpdateBusy, preserveCredentialUpdateLock, updateProfileCredentials } from "../services/profileCredentials";

/** Invoked only by the exclusive, locked security owner. Never opens financial storage. */
export async function changeProfileProtection(options: { userData: string; profileId: string; request: CredentialChangeRequest;
  keychain: KeychainProtector; osAuthenticationAvailable(): boolean; authenticateOS(): Promise<void>;
  confirmCredentialRepair(profileId: string): Promise<boolean>; signal: AbortSignal }): Promise<{ updated: boolean }> {
  const { userData, profileId, request, keychain, signal } = options;
  let key: Buffer | undefined;
  const authenticateOS = async () => {
    if (!options.osAuthenticationAvailable() || !keychain.isAvailable()) throw new Error("OS authentication unavailable");
    await options.authenticateOS(); signal.throwIfAborted();
  };
  try {
    signal.throwIfAborted(); const profile = await readProtectedProfile(userData, profileId); signal.throwIfAborted();
    if (request.authentication.mode === "keychain") {
      await authenticateOS(); key = await unlockWithKeychain(profile.envelope, keychain, profileId);
    } else if (request.authentication.mode === "passphrase") {
      key = await unlockWithPassphrase(profile.envelope, request.authentication.passphrase, profileId);
    } else key = unlockWithRecovery(profile.envelope, request.authentication.recoverySecret, profileId);
    signal.throwIfAborted();
    if (request.change.mode === "keychain" && request.authentication.mode !== "keychain") await authenticateOS();
    const change = request.change.mode === "keychain" ? { keychain } : { passphrase: request.change.passphrase };
    const update = () => updateProfileCredentials({ userData, profileId, dataKey: key!, expectedEnvelope: profile.envelope, change, signal });
    try { await update(); }
    catch (error) {
      if (!(error instanceof CredentialUpdateBusy)) throw error;
      signal.throwIfAborted();
      const confirmed = await options.confirmCredentialRepair(profileId); signal.throwIfAborted();
      if (!confirmed) return { updated: false };
      await preserveCredentialUpdateLock({ userData, profileId, dataKey: key, expectedEnvelope: profile.envelope, signal });
      await update();
    }
    return { updated: true };
  } finally { key?.fill(0); }
}
