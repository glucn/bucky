import { describe, expect, it, vi } from "vitest";
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { createProfileKeys, unlockWithRecovery, unlockWithPassphrase, unlockWithKeychain,
  replacePassphrase, bindKeychain, rebindProfileKeys, portableKeyEnvelope, parseKeyEnvelope, serializeKeyEnvelope } from "./profileKeys";

const passphrase = "several separate words for testing";
const newPassphrase = "a different set of recovery words";
// Substitute the OS-protected channel, not the key-envelope encryption being tested.
function keychain() {
  const secret = randomBytes(32);
  return { isAvailable: () => true,
    encryptString: vi.fn(async (value: string) => {
      const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", secret, nonce);
      const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    }),
    decryptString: vi.fn(async (value: Buffer) => {
      const cipher = createDecipheriv("aes-256-gcm", secret, value.subarray(0, 12));
      cipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString();
    }),
  };
}

describe("Authenticated profile key envelopes", () => {
  it("binds a recovered data key to a new profile identity with fresh recovery and chosen credentials", async () => {
    const original = await createProfileKeys("default", { keychain: keychain() });
    const before = serializeKeyEnvelope(original.envelope);
    const rebound = await rebindProfileKeys(original.envelope, original.dataKey, "default", "restored-new", { passphrase: newPassphrase });
    expect(rebound.envelope.profileId).toBe("restored-new");
    expect(rebound.envelope.keyId).not.toBe(original.envelope.keyId);
    expect(rebound.envelope.keychain).toBeUndefined();
    expect(rebound.recoverySecret).not.toBe(original.recoverySecret);
    expect(unlockWithRecovery(rebound.envelope, rebound.recoverySecret, "restored-new")).toEqual(original.dataKey);
    expect(await unlockWithPassphrase(rebound.envelope, newPassphrase, "restored-new")).toEqual(original.dataKey);
    expect(() => unlockWithRecovery(rebound.envelope, original.recoverySecret, "restored-new")).toThrow();
    expect(() => unlockWithRecovery(rebound.envelope, rebound.recoverySecret, "default")).toThrow();
    expect(serializeKeyEnvelope(original.envelope)).toBe(before);
    expect(unlockWithRecovery(original.envelope, original.recoverySecret, "default")).toEqual(original.dataKey);
    original.dataKey.fill(0);
  });

  it("refuses unrelated keys, profile identities, and unavailable replacement credentials without damaging the original", async () => {
    const os = keychain();
    const original = await createProfileKeys("default", { keychain: os });
    const originalKey = Buffer.from(original.dataKey);
    const newMachine = keychain();
    await expect(rebindProfileKeys(original.envelope, randomBytes(32), "default", "restored-new", { keychain: newMachine })).rejects.toThrow();
    await expect(rebindProfileKeys(original.envelope, original.dataKey, "restored-wrong", "restored-new", { keychain: newMachine })).rejects.toThrow();
    expect(newMachine.encryptString).not.toHaveBeenCalled();
    await expect(rebindProfileKeys(original.envelope, original.dataKey, "default", "../../escape", { keychain: newMachine })).rejects.toThrow();
    await expect(rebindProfileKeys(original.envelope, original.dataKey, "default", "restored-new", {})).rejects.toThrow();
    newMachine.isAvailable = () => false;
    await expect(rebindProfileKeys(original.envelope, original.dataKey, "default", "restored-new", { keychain: newMachine, passphrase })).rejects.toThrow();
    expect(original.dataKey).toEqual(originalKey);
    original.dataKey.fill(0); originalKey.fill(0);
  });
  it("uses distinct random data keys and recovery credentials, without serializing them", async () => {
    const os = keychain();
    const first = await createProfileKeys("default", { keychain: os });
    const second = await createProfileKeys("default", { keychain: os });
    expect(first.dataKey.length).toBe(32);
    expect(first.dataKey.equals(second.dataKey)).toBe(false);
    expect(first.recoverySecret).not.toBe(second.recoverySecret);
    const serialized = serializeKeyEnvelope(first.envelope);
    expect(serialized).not.toContain(first.dataKey.toString("hex"));
    expect(serialized).not.toContain(first.dataKey.toString("base64url"));
    expect(serialized).not.toContain(first.recoverySecret);
    expect(await unlockWithKeychain(parseKeyEnvelope(serialized), os, "default")).toEqual(first.dataKey);
  });

  it("recovers without the original OS keychain and omits machine-bound material from portable metadata", async () => {
    const created = await createProfileKeys("default", { keychain: keychain() });
    const portable = portableKeyEnvelope(created.envelope);
    expect(portable.keychain).toBeUndefined();
    expect(unlockWithRecovery(portable, created.recoverySecret, "default")).toEqual(created.dataKey);
    await expect(unlockWithKeychain(created.envelope, keychain(), "default")).rejects.toThrow(/unable to unlock/i);
  });

  it("supports explicitly selected passphrase-only mode and independent recovery", async () => {
    const created = await createProfileKeys("default", { passphrase });
    expect(created.envelope.keychain).toBeUndefined();
    expect(await unlockWithPassphrase(created.envelope, passphrase, "default")).toEqual(created.dataKey);
    expect(unlockWithRecovery(created.envelope, created.recoverySecret, "default")).toEqual(created.dataKey);
    expect(serializeKeyEnvelope(created.envelope)).not.toContain(passphrase);
    await expect(unlockWithPassphrase(created.envelope, newPassphrase, "default")).rejects.toThrow(/unable to unlock/i);
  });

  it("does not silently fall back when the keychain is unavailable or refuses access", async () => {
    await expect(createProfileKeys("default", {})).rejects.toThrow(/keychain or passphrase/i);
    const os = keychain();
    os.isAvailable = () => false;
    await expect(createProfileKeys("default", { keychain: os, passphrase })).rejects.toThrow(/keychain/i);
    expect(os.encryptString).not.toHaveBeenCalled();
    os.isAvailable = () => true;
    os.encryptString.mockRejectedValue(new Error("OS denied sensitive-detail"));
    await expect(createProfileKeys("default", { keychain: os })).rejects.toThrow(/^OS keychain operation failed$/);
  });

  it.each(["profileId", "keyId", "recovery-ciphertext", "recovery-nonce", "recovery-tag", "check"])("rejects tampered %s metadata before returning a key", async (field) => {
    const created = await createProfileKeys("default", { keychain: keychain() });
    const changed = structuredClone(created.envelope);
    if (field === "profileId") changed.profileId = "restored-other";
    else if (field === "keyId") changed.keyId = "00000000-0000-4000-8000-000000000000";
    else {
      const target = field === "check" ? changed.check : changed.recovery;
      const name = field === "recovery-nonce" ? "nonce" : field === "recovery-tag" ? "tag" : "ciphertext";
      const bytes = Buffer.from(target[name], "base64url"); bytes[0] ^= 1;
      target[name] = bytes.toString("base64url");
    }
    expect(() => unlockWithRecovery(changed, created.recoverySecret, "default")).toThrow();
    if (field === "profileId") expect(() => unlockWithRecovery(changed, created.recoverySecret, "restored-other")).toThrow();
  });

  it("rejects a valid envelope offered for a different profile", async () => {
    const created = await createProfileKeys("default", { keychain: keychain() });
    await expect(unlockWithKeychain(created.envelope, keychain(), "restored-other")).rejects.toThrow();
    expect(() => unlockWithRecovery(created.envelope, created.recoverySecret, "restored-other")).toThrow();
  });

  it("rejects unsupported versions, injected KDF settings, malformed encodings, and oversized input", async () => {
    const created = await createProfileKeys("default", { keychain: keychain() });
    const json = JSON.parse(serializeKeyEnvelope(created.envelope));
    expect(() => parseKeyEnvelope(JSON.stringify({ ...json, version: 99 }))).toThrow();
    expect(() => parseKeyEnvelope(JSON.stringify({ ...json, N: 2 ** 30 }))).toThrow();
    expect(() => parseKeyEnvelope(JSON.stringify({ ...json, recovery: { ...json.recovery, tag: "" } }))).toThrow();
    expect(() => parseKeyEnvelope(" ".repeat(65537))).toThrow();
  });

  it("changing a passphrase preserves the data/recovery key and does not mutate the old envelope", async () => {
    const created = await createProfileKeys("default", { passphrase });
    const oldJson = serializeKeyEnvelope(created.envelope);
    const updated = await replacePassphrase(created.envelope, created.dataKey, newPassphrase, "default");
    expect(serializeKeyEnvelope(created.envelope)).toBe(oldJson);
    expect(await unlockWithPassphrase(updated, newPassphrase, "default")).toEqual(created.dataKey);
    await expect(unlockWithPassphrase(updated, passphrase, "default")).rejects.toThrow();
    expect(unlockWithRecovery(updated, created.recoverySecret, "default")).toEqual(created.dataKey);
    await expect(replacePassphrase(created.envelope, randomBytes(32), newPassphrase, "default")).rejects.toThrow();
  });

  it("validates passphrase length and preserves whitespace without hidden normalization", async () => {
    await expect(createProfileKeys("default", { passphrase: "short" })).rejects.toThrow(/passphrase/i);
    await expect(createProfileKeys("default", { passphrase: "x".repeat(1025) })).rejects.toThrow(/passphrase/i);
    const created = await createProfileKeys("default", { passphrase: ` ${passphrase} ` });
    await expect(unlockWithPassphrase(created.envelope, passphrase, "default")).rejects.toThrow();
    expect(await unlockWithPassphrase(created.envelope, ` ${passphrase} `, "default")).toEqual(created.dataKey);
  });

  it("bounds concurrent memory-intensive derivations and becomes available after completion", async () => {
    const first = createProfileKeys("default", { passphrase });
    try {
      await expect(createProfileKeys("default", { passphrase })).rejects.toThrow(/derivation.*progress/i);
    } finally { (await first).dataKey.fill(0); }
    const next = await createProfileKeys("default", { passphrase });
    expect(next.dataKey.length).toBe(32);
  });

  it("rejects tampered passphrase salt and refuses unavailable keychain access before decrypting", async () => {
    const os = keychain();
    const created = await createProfileKeys("default", { keychain: os, passphrase });
    const changed = structuredClone(created.envelope);
    changed.passphrase!.salt = randomBytes(16).toString("base64url");
    await expect(unlockWithPassphrase(changed, passphrase, "default")).rejects.toThrow(/unable to unlock/i);
    os.isAvailable = () => false;
    await expect(unlockWithKeychain(created.envelope, os, "default")).rejects.toThrow(/unable to unlock/i);
    expect(os.decryptString).not.toHaveBeenCalled();
    expect(unlockWithRecovery(created.envelope, created.recoverySecret, "default")).toEqual(created.dataKey);
  });

  it("rebinds a recovered key to a new machine without changing the data key", async () => {
    const original = await createProfileKeys("default", { keychain: keychain() });
    const portable = portableKeyEnvelope(original.envelope);
    const dataKey = unlockWithRecovery(portable, original.recoverySecret, "default");
    const newMachine = keychain();
    const rebound = await bindKeychain(portable, dataKey, newMachine, "default");
    expect(await unlockWithKeychain(rebound, newMachine, "default")).toEqual(original.dataKey);
    expect(portable.keychain).toBeUndefined();
    await expect(bindKeychain(portable, randomBytes(32), newMachine, "default")).rejects.toThrow();
    dataKey.fill(0);
  });

  it("rejects an unrelated but well-formed recovery credential", async () => {
    const first = await createProfileKeys("default", { keychain: keychain() });
    const second = await createProfileKeys("default", { keychain: keychain() });
    expect(() => unlockWithRecovery(first.envelope, second.recoverySecret, "default")).toThrow(/^Unable to unlock profile key$/);
  });
});
