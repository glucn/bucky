import type { KeychainProtector, ProfileKeyEnvelope } from "./profileKeys";
import fs from "fs/promises";
import path from "path";
import { randomUUID, timingSafeEqual } from "crypto";
import { profileDatabasePath } from "./personalProfiles";
import { readPrivateFile, readProtectedProfile, syncPath, validateDirectories } from "./protectedProfiles";
import { bindKeychain, parseKeyEnvelope, replacePassphrase, serializeKeyEnvelope,
  unlockWithKeychain, unlockWithPassphrase, verifyProfileKey } from "./profileKeys";

type Options = { userData: string; profileId: string; dataKey: Buffer; expectedEnvelope: ProfileKeyEnvelope;
  change: { passphrase: string } | { keychain: KeychainProtector }; signal?: AbortSignal };
export class CredentialUpdateBusy extends Error {
  constructor() { super("A credential update or its cleanup is already in progress"); }
}

/** Trusted caller authenticates first. Rewraps the same data key; never rotates or revokes old copies. */
export async function updateProfileCredentials(options: Options): Promise<void> {
  const { userData, profileId, dataKey, expectedEnvelope, change, signal } = options;
  const databaseFile = profileDatabasePath(userData, profileId), directory = path.dirname(databaseFile);
  if (!change || Object.keys(change).length !== 1 || !("passphrase" in change || "keychain" in change)) throw new Error("Invalid credential change");
  verifyProfileKey(expectedEnvelope, dataKey, profileId);
  const expected = serializeKeyEnvelope(expectedEnvelope);
  signal?.throwIfAborted(); await validateDirectories(userData, profileId); signal?.throwIfAborted();
  const lock = path.join(path.dirname(directory), `.credentials-${profileId}.lock`);
  let locked = false, temporary: string | undefined, published = false;
  try {
    try { await fs.mkdir(lock, { mode: 0o700 }); locked = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new CredentialUpdateBusy(); throw error; }
    const profile = await readProtectedProfile(userData, profileId);
    if (serializeKeyEnvelope(profile.envelope) !== expected) throw new Error("Profile credentials changed; authenticate again");
    signal?.throwIfAborted();
    const updated = "passphrase" in change ? await replacePassphrase(profile.envelope, dataKey, change.passphrase, profileId)
      : await bindKeychain(profile.envelope, dataKey, change.keychain, profileId);
    signal?.throwIfAborted();
    const serialized = serializeKeyEnvelope(updated);
    temporary = path.join(directory, `.credentials-${randomUUID()}.json`);
    const output = await fs.open(temporary, "wx", 0o600);
    try { await output.writeFile(serialized); await output.sync(); } finally { await output.close(); }
    const persisted = parseKeyEnvelope((await readPrivateFile(temporary, 65536)).toString("utf8"));
    if (serializeKeyEnvelope(persisted) !== serialized) throw new Error("Staged credential metadata changed");
    verifyProfileKey(persisted, dataKey, profileId);
    const recovered = "passphrase" in change ? await unlockWithPassphrase(persisted, change.passphrase, profileId)
      : await unlockWithKeychain(persisted, change.keychain, profileId);
    try { if (!timingSafeEqual(recovered, dataKey)) throw new Error("Replacement credential verification failed"); }
    finally { recovered.fill(0); }
    await validateDirectories(userData, profileId);
    const current = parseKeyEnvelope((await readPrivateFile(profile.envelopeFile, 65536)).toString("utf8"));
    if (serializeKeyEnvelope(current) !== expected) throw new Error("Profile credentials changed; authenticate again");
    signal?.throwIfAborted();
    await fs.rename(temporary, profile.envelopeFile); temporary = undefined; published = true;
    // Once published, late cancellation never restores an old credential over the new one.
    await syncPath(directory);
  } catch (error) {
    if (error instanceof CredentialUpdateBusy) throw error;
    throw new Error(published ? "Credential update was published but durability confirmation failed; preserve the profile and check your new credentials"
      : "Credential update failed before publication; existing credentials were retained");
  } finally {
    try {
      if (temporary) await fs.unlink(temporary).catch((error) => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
      if (locked) { await fs.rmdir(lock); await syncPath(path.dirname(directory)); }
    } catch {
      throw new Error(published ? "Credential update was published but cleanup could not finish; preserve the profile and check your new credentials"
        : "Credential update cleanup could not finish; preserve the profile and use recovery before retrying");
    }
  }
}

/** Only after main holds single-instance/exclusive security ownership, drains active work,
 * authenticates the CURRENT envelope, and obtains native consent. Retains the entire lock.
 */
export async function preserveCredentialUpdateLock(options: Omit<Options, "change">): Promise<string> {
  const { userData, profileId, dataKey, expectedEnvelope, signal } = options;
  verifyProfileKey(expectedEnvelope, dataKey, profileId); signal?.throwIfAborted();
  const expected = serializeKeyEnvelope(expectedEnvelope), profile = await readProtectedProfile(userData, profileId);
  if (serializeKeyEnvelope(profile.envelope) !== expected) throw new Error("Credentials changed; authenticate again before preserving interrupted work");
  const profiles = path.dirname(path.dirname(profile.databaseFile)), lockId = `.credentials-${profileId}.lock`;
  const lock = path.join(profiles, lockId), root = await fs.realpath(profiles), stat = await fs.lstat(lock);
  if (!stat.isDirectory() || await fs.realpath(lock) !== path.join(root, lockId)) throw new Error("Credential lock must be a directory inside application storage");
  const preservedId = `.preserved-credentials-${profileId}-lock-${randomUUID()}`, destination = path.join(profiles, preservedId);
  try { await fs.lstat(destination); throw new Error("Preserved credential target already exists"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const current = await readProtectedProfile(userData, profileId), currentStat = await fs.lstat(lock);
  if (serializeKeyEnvelope(current.envelope) !== expected || !currentStat.isDirectory() || currentStat.ino !== stat.ino || currentStat.dev !== stat.dev) throw new Error("Interrupted credentials changed; refresh before retrying");
  signal?.throwIfAborted();
  await fs.rename(lock, destination);
  try { await syncPath(profiles); }
  catch { throw new Error("Credential lock was preserved but durability confirmation failed; refresh interrupted artifacts"); }
  return preservedId;
}
