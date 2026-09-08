import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scrypt, timingSafeEqual } from "crypto";

/** Trusted-process only. None of the returned key material belongs in renderer IPC responses. */
export interface KeychainProtector {
  isAvailable(): boolean;
  encryptString(value: string): Promise<Buffer>;
  decryptString(value: Buffer): Promise<string>;
}
type Box = { nonce: string; ciphertext: string; tag: string };
type Header = { format: "bucky-profile-key"; version: 1; profileId: string; keyId: string };
export type ProfileKeyEnvelope = Header & {
  check: Box;
  recovery: Box;
  passphrase?: { kdf: "scrypt-v1"; salt: string; box: Box };
  keychain?: { protectedKey: string; box: Box };
};
const CHECK = Buffer.from("bucky-profile-key-verification-v1", "utf8");
const RECOVERY_PREFIX = "bucky-recovery-v1-";
const MAX_ENVELOPE_BYTES = 65536;
let derivingPassphraseKey = false;
const invalid = () => new Error("Invalid profile key envelope");
const unlockFailed = () => new Error("Unable to unlock profile key");

function profileIdValid(id: unknown): id is string {
  return typeof id === "string" && id.length <= 200 && /^(default|restored-[a-zA-Z0-9-]+)$/.test(id);
}
function decode(value: unknown, size: number): Buffer {
  if (typeof value !== "string" || value.length !== Math.ceil(size * 4 / 3) || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalid();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== size || bytes.toString("base64url") !== value) throw invalid();
  return bytes;
}
function object(value: unknown, required: string[], optional: string[] = []): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const record = value as Record<string, unknown>;
  if (required.some((key) => !Object.hasOwn(record, key)) || Object.keys(record).some((key) => !required.includes(key) && !optional.includes(key))) throw invalid();
  return record;
}
function validateBox(value: unknown, bytes = 32): void {
  const box = object(value, ["nonce", "ciphertext", "tag"]);
  decode(box.nonce, 12); decode(box.ciphertext, bytes); decode(box.tag, 16);
}
function validated(value: unknown): ProfileKeyEnvelope {
  const record = object(value, ["format", "version", "profileId", "keyId", "check", "recovery"], ["passphrase", "keychain"]);
  if (record.format !== "bucky-profile-key" || record.version !== 1 || !profileIdValid(record.profileId) ||
    typeof record.keyId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(record.keyId)) throw invalid();
  validateBox(record.check, CHECK.length); validateBox(record.recovery);
  if (record.passphrase !== undefined) {
    const wrap = object(record.passphrase, ["kdf", "salt", "box"]);
    if (wrap.kdf !== "scrypt-v1") throw invalid();
    decode(wrap.salt, 16); validateBox(wrap.box);
  }
  if (record.keychain !== undefined) {
    const wrap = object(record.keychain, ["protectedKey", "box"]);
    if (typeof wrap.protectedKey !== "string" || wrap.protectedKey.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(wrap.protectedKey)) throw invalid();
    const bytes = Buffer.from(wrap.protectedKey, "base64url");
    if (!bytes.length || bytes.toString("base64url") !== wrap.protectedKey) throw invalid();
    validateBox(wrap.box);
  }
  return record as ProfileKeyEnvelope;
}
export function parseKeyEnvelope(serialized: string): ProfileKeyEnvelope {
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > MAX_ENVELOPE_BYTES) throw invalid();
  try { return validated(JSON.parse(serialized)); } catch { throw invalid(); }
}
export function serializeKeyEnvelope(envelope: ProfileKeyEnvelope): string {
  return JSON.stringify(validated(envelope));
}
function aad(header: Header, purpose: string): Buffer {
  return Buffer.from(JSON.stringify([header.format, header.version, header.profileId, header.keyId, purpose]));
}
function seal(plaintext: Buffer, key: Buffer, header: Header, purpose: string): Box {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad(header, purpose));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { nonce: nonce.toString("base64url"), ciphertext: ciphertext.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
}
function open(box: Box, key: Buffer, header: Header, purpose: string): Buffer {
  const cipher = createDecipheriv("aes-256-gcm", key, decode(box.nonce, 12), { authTagLength: 16 });
  cipher.setAAD(aad(header, purpose)); cipher.setAuthTag(decode(box.tag, 16));
  const partial = cipher.update(Buffer.from(box.ciphertext, "base64url"));
  try { return Buffer.concat([partial, cipher.final()]); }
  finally { partial.fill(0); }
}
function verifyKey(envelope: ProfileKeyEnvelope, key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw unlockFailed();
  const check = open(envelope.check, key, envelope, "key-check");
  try { if (check.length !== CHECK.length || !timingSafeEqual(check, CHECK)) throw unlockFailed(); }
  finally { check.fill(0); }
}
function forProfile(envelope: ProfileKeyEnvelope, expectedProfileId: string): ProfileKeyEnvelope {
  const result = validated(envelope);
  if (result.profileId !== expectedProfileId) throw unlockFailed();
  return result;
}
function validatePassphrase(passphrase: string): void {
  if (typeof passphrase !== "string" || passphrase.length > 1024 || Buffer.byteLength(passphrase, "utf8") > 1024 || [...passphrase].length < 12) {
    throw new Error("Passphrase must contain at least 12 characters and at most 1024 UTF-8 bytes");
  }
}
async function passphraseKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  validatePassphrase(passphrase);
  if (derivingPassphraseKey) throw new Error("A key derivation is already in progress; retry when it finishes");
  derivingPassphraseKey = true;
  // Fixed, versioned cost prevents attacker-controlled KDF resource parameters.
  try {
    return await new Promise<Buffer>((resolve, reject) => scrypt(passphrase, salt, 32,
      { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
  } finally { derivingPassphraseKey = false; }
}
async function passphraseWrap(header: Header, dataKey: Buffer, passphrase: string): Promise<NonNullable<ProfileKeyEnvelope["passphrase"]>> {
  const salt = randomBytes(16), key = await passphraseKey(passphrase, salt);
  try { return { kdf: "scrypt-v1", salt: salt.toString("base64url"), box: seal(dataKey, key, header, "passphrase") }; }
  finally { key.fill(0); }
}
async function keychainWrap(header: Header, dataKey: Buffer, keychain: KeychainProtector): Promise<NonNullable<ProfileKeyEnvelope["keychain"]>> {
  if (!keychain.isAvailable()) throw new Error("OS keychain is unavailable");
  const wrappingKey = randomBytes(32);
  try {
    const protectedKey = await keychain.encryptString(wrappingKey.toString("base64url"));
    return { protectedKey: protectedKey.toString("base64url"), box: seal(dataKey, wrappingKey, header, "keychain") };
  } catch { throw new Error("OS keychain operation failed"); }
  finally { wrappingKey.fill(0); }
}

/** Caller must confirm the generated recovery credential before persisting/activating a book. */
export async function createProfileKeys(profileId: string, options: { keychain?: KeychainProtector; passphrase?: string }):
Promise<{ envelope: ProfileKeyEnvelope; dataKey: Buffer; recoverySecret: string }> {
  if (!profileIdValid(profileId)) throw new Error("Invalid personal profile");
  if (!options.keychain && options.passphrase === undefined) throw new Error("OS keychain or passphrase is required");
  if (options.passphrase !== undefined) validatePassphrase(options.passphrase);
  if (options.keychain && !options.keychain.isAvailable()) throw new Error("OS keychain is unavailable");
  const dataKey = randomBytes(32), recoveryKey = randomBytes(32);
  const header: Header = { format: "bucky-profile-key", version: 1, profileId, keyId: randomUUID() };
  try {
    const envelope: ProfileKeyEnvelope = { ...header, check: seal(CHECK, dataKey, header, "key-check"), recovery: seal(dataKey, recoveryKey, header, "recovery") };
    if (options.keychain) {
      envelope.keychain = await keychainWrap(header, dataKey, options.keychain);
    }
    if (options.passphrase !== undefined) envelope.passphrase = await passphraseWrap(header, dataKey, options.passphrase);
    validated(envelope);
    return { envelope, dataKey, recoverySecret: RECOVERY_PREFIX + recoveryKey.toString("base64url") };
  } catch (error) { dataKey.fill(0); throw error; }
  finally { recoveryKey.fill(0); }
}

export function unlockWithRecovery(envelope: ProfileKeyEnvelope, secret: string, expectedProfileId: string): Buffer {
  let key: Buffer | undefined, dataKey: Buffer | undefined;
  try {
    const record = forProfile(envelope, expectedProfileId);
    if (typeof secret !== "string" || !secret.startsWith(RECOVERY_PREFIX)) throw unlockFailed();
    key = decode(secret.slice(RECOVERY_PREFIX.length), 32);
    dataKey = open(record.recovery, key, record, "recovery"); verifyKey(record, dataKey);
    return dataKey;
  } catch { dataKey?.fill(0); throw unlockFailed(); }
  finally { key?.fill(0); }
}

export async function unlockWithPassphrase(envelope: ProfileKeyEnvelope, passphrase: string, expectedProfileId: string): Promise<Buffer> {
  let key: Buffer | undefined, dataKey: Buffer | undefined;
  try {
    const record = forProfile(envelope, expectedProfileId);
    if (!record.passphrase) throw unlockFailed();
    key = await passphraseKey(passphrase, decode(record.passphrase.salt, 16));
    dataKey = open(record.passphrase.box, key, record, "passphrase"); verifyKey(record, dataKey);
    return dataKey;
  } catch { dataKey?.fill(0); throw unlockFailed(); }
  finally { key?.fill(0); }
}

/** Keychain retrieval is NOT authentication. The main lock lifecycle must authenticate first. */
export async function unlockWithKeychain(envelope: ProfileKeyEnvelope, keychain: KeychainProtector, expectedProfileId: string): Promise<Buffer> {
  let key: Buffer | undefined, dataKey: Buffer | undefined;
  try {
    const record = forProfile(envelope, expectedProfileId);
    if (!record.keychain || !keychain.isAvailable()) throw unlockFailed();
    key = decode(await keychain.decryptString(Buffer.from(record.keychain.protectedKey, "base64url")), 32);
    dataKey = open(record.keychain.box, key, record, "keychain"); verifyKey(record, dataKey);
    return dataKey;
  } catch { dataKey?.fill(0); throw unlockFailed(); }
  finally { key?.fill(0); }
}

export async function replacePassphrase(envelope: ProfileKeyEnvelope, dataKey: Buffer, passphrase: string, expectedProfileId: string): Promise<ProfileKeyEnvelope> {
  const record = forProfile(envelope, expectedProfileId);
  try { verifyKey(record, dataKey); } catch { throw unlockFailed(); }
  return { ...parseKeyEnvelope(serializeKeyEnvelope(record)), passphrase: await passphraseWrap(record, dataKey, passphrase) };
}
export function portableKeyEnvelope(envelope: ProfileKeyEnvelope): ProfileKeyEnvelope {
  const record = parseKeyEnvelope(serializeKeyEnvelope(envelope));
  delete record.keychain;
  return record;
}

export async function bindKeychain(envelope: ProfileKeyEnvelope, dataKey: Buffer, keychain: KeychainProtector, expectedProfileId: string): Promise<ProfileKeyEnvelope> {
  const record = forProfile(envelope, expectedProfileId);
  try { verifyKey(record, dataKey); } catch { throw unlockFailed(); }
  const updated = { ...parseKeyEnvelope(serializeKeyEnvelope(record)), keychain: await keychainWrap(record, dataKey, keychain) };
  return validated(updated);
}
