import fs, { FileHandle } from "fs/promises";
import { constants } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";
import { createClient } from "@libsql/client";
import { snapshotDatabase } from "./localDatabase";
import { validateRecoveryDatabase } from "./recoveryValidation";
import { parseKeyEnvelope, portableKeyEnvelope, serializeKeyEnvelope, verifyProfileKey,
  unlockWithPassphrase, unlockWithRecovery, type ProfileKeyEnvelope } from "./profileKeys";
import type { RecoveryResult, RecoverySummary } from "../shared/recovery";

const MAGIC = Buffer.from("BUCKYBK1");
const MAX_HEADER = 65536, MAX_MANIFEST = 1024 * 1024, MAX_DATABASE = 8 * 1024 ** 3, CHUNK = 64 * 1024;
type Header = { format: "bucky-protected-backup"; version: 1; salt: string; nonce: string;
  envelope: ProfileKeyEnvelope; manifestBytes: number; databaseBytes: number };
type Credential = { mode: "recovery" | "passphrase"; secret: string };
type VerifyOptions = { source: string; stagingParent: string; migrations: string; credential: Credential; signal?: AbortSignal };
type VerifiedBackup = { databaseFile: string; dataKey: Buffer; envelope: ProfileKeyEnvelope; summary: RecoverySummary };
const invalid = () => new Error("Unable to verify protected backup; check the file, credential, and matching app version");

function absolute(filename: string) { if (!path.isAbsolute(filename)) throw new Error("Protected backup paths must be absolute"); }
function decode(value: unknown, size: number) {
  if (typeof value !== "string") throw invalid();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== size || bytes.toString("base64url") !== value) throw invalid();
  return bytes;
}
function parseHeader(bytes: Buffer): Header {
  const value = JSON.parse(bytes.toString("utf8"));
  const fields = ["format", "version", "salt", "nonce", "envelope", "manifestBytes", "databaseBytes"];
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== fields.length ||
    fields.some((name) => !Object.hasOwn(value, name)) || value.format !== "bucky-protected-backup" || value.version !== 1 ||
    !Number.isSafeInteger(value.manifestBytes) || value.manifestBytes < 1 || value.manifestBytes > MAX_MANIFEST ||
    !Number.isSafeInteger(value.databaseBytes) || value.databaseBytes < 16 || value.databaseBytes > MAX_DATABASE) throw invalid();
  decode(value.salt, 32); decode(value.nonce, 12);
  value.envelope = parseKeyEnvelope(JSON.stringify(value.envelope));
  if (value.envelope.keychain) throw invalid(); // Machine-bound metadata never belongs in a portable artifact.
  return value;
}
function outerKey(key: Buffer, salt: string) {
  return Buffer.from(hkdfSync("sha256", key, decode(salt, 32), "bucky-protected-backup-v1", 32));
}
async function openRegular(filename: string) {
  absolute(filename);
  const file = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { if (!(await file.stat()).isFile()) throw invalid(); return file; }
  catch (error) { await file.close(); throw error; }
}
async function read(file: FileHandle, length: number, position: number) {
  const bytes = Buffer.alloc(length);
  for (let offset = 0; offset < length;) {
    const result = await file.read(bytes, offset, length - offset, position + offset);
    if (!result.bytesRead) throw invalid();
    offset += result.bytesRead;
  }
  return bytes;
}
async function write(file: FileHandle, bytes: Buffer) {
  for (let offset = 0; offset < bytes.length;) {
    const result = await file.write(bytes, offset, bytes.length - offset);
    if (!result.bytesWritten) throw new Error("Protected backup write made no progress");
    offset += result.bytesWritten;
  }
}
async function encryptedFile(filename: string) {
  const file = await openRegular(filename);
  try {
    const size = (await file.stat()).size;
    if (size < 16 || size > MAX_DATABASE || (await read(file, 16, 0)).toString() === "SQLite format 3\0") throw invalid();
    return size;
  } finally { await file.close(); }
}
const connect = (filename: string, dataKey: Buffer) => createClient({ url: pathToFileURL(filename).href,
  encryptionKey: dataKey.toString("hex"), concurrency: 1, timeout: 5000 });
/** Trusted caller supplies an authenticated key; this never migrates or rewrites a book. */
export async function validateEncryptedRecoveryDatabase(filename: string, dataKey: Buffer, migrations: string, signal?: AbortSignal) {
  await encryptedFile(filename);
  const client = connect(filename, dataKey);
  try {
    const tx = await client.transaction("read");
    try { return await validateRecoveryDatabase({ query: async <T>(sql: string, params: number[] = []) =>
      (await tx.execute({ sql, args: params })).rows.map((row) => ({ ...row })) as T[] }, migrations, signal); }
    finally { tx.close(); }
  } finally { client.close(); }
}
async function syncDirectory(directory: string) {
  const file = await fs.open(directory, "r");
  try { await file.sync(); } finally { await file.close(); }
}

/** Trusted main process only. Exports an encrypted SQLite snapshot, never a plaintext copy. */
export async function createProtectedBackup(options: { source: string; destination: string; migrations: string;
  dataKey: Buffer; envelope: ProfileKeyEnvelope; signal?: AbortSignal }): Promise<RecoveryResult> {
  const { source, destination, migrations, dataKey, signal } = options;
  absolute(source); absolute(destination); signal?.throwIfAborted();
  const envelope = portableKeyEnvelope(options.envelope);
  verifyProfileKey(envelope, dataKey, envelope.profileId);
  await encryptedFile(source);
  const parent = path.dirname(destination);
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  const staging = await fs.mkdtemp(path.join(parent, ".bucky-backup-"));
  let published = false;
  try {
    const snapshot = path.join(staging, "book.sqlite");
    const db = connect(source, dataKey);
    try { await snapshotDatabase(snapshot, (sql, args) => db.execute({ sql, args })); }
    finally { db.close(); }
    signal?.throwIfAborted();
    const summary = await validateEncryptedRecoveryDatabase(snapshot, dataKey, migrations, signal);
    const manifest = Buffer.from(JSON.stringify({ summary }));
    const header: Header = { format: "bucky-protected-backup", version: 1,
      salt: randomBytes(32).toString("base64url"), nonce: randomBytes(12).toString("base64url"), envelope,
      manifestBytes: manifest.length, databaseBytes: await encryptedFile(snapshot) };
    const headerBytes = Buffer.from(JSON.stringify(header));
    if (headerBytes.length > MAX_HEADER) throw invalid();
    parseHeader(headerBytes);
    const prefix = Buffer.alloc(12); MAGIC.copy(prefix); prefix.writeUInt32BE(headerBytes.length, 8);
    const key = outerKey(dataKey, header.salt);
    const artifact = path.join(staging, "artifact");
    try {
      const cipher = createCipheriv("aes-256-gcm", key, decode(header.nonce, 12), { authTagLength: 16 });
      cipher.setAAD(Buffer.concat([prefix, headerBytes]));
      const output = await fs.open(artifact, "wx", 0o600);
      try {
        await write(output, prefix); await write(output, headerBytes); await write(output, cipher.update(manifest));
        const input = await openRegular(snapshot);
        try {
          for (let offset = 0; offset < header.databaseBytes; offset += CHUNK) {
            signal?.throwIfAborted();
            await write(output, cipher.update(await read(input, Math.min(CHUNK, header.databaseBytes - offset), offset)));
          }
        } finally { await input.close(); }
        await write(output, cipher.final()); await write(output, cipher.getAuthTag()); await output.sync();
      } finally { await output.close(); }
    } finally { key.fill(0); manifest.fill(0); }
    // Verify durable bytes and the recovered record summary before publishing any success.
    await verifyArtifact({ source: artifact, stagingParent: staging, migrations, signal }, async () => Buffer.from(dataKey),
      async (verified) => { if (JSON.stringify(verified.summary) !== JSON.stringify(summary)) throw invalid(); });
    signal?.throwIfAborted();
    // Same-directory hard-link publication is atomic and refuses existing files/symlinks.
    await fs.link(artifact, destination); published = true;
    await syncDirectory(parent);
    return { path: destination, summary };
  } catch {
    throw new Error(published ? "Backup was published but durability confirmation failed; preserve and verify the existing file"
      : "Unable to create protected backup; existing books and backups were not replaced");
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}

/** The callback sees only an authenticated, schema/record-verified encrypted stage.
 * It must finish all use before returning. The stage is removed and key buffer cleared afterward.
 * This does not bind new credentials, publish a profile, or change next-launch selection.
 */
export async function withVerifiedProtectedBackup<T>(options: VerifyOptions, action: (verified: VerifiedBackup) => Promise<T>): Promise<T> {
  const credential = options.credential;
  if (!credential || typeof credential.secret !== "string" || credential.secret.length > 1024 ||
    !["recovery", "passphrase"].includes(credential.mode)) throw invalid();
  return verifyArtifact(options, (envelope) => credential.mode === "recovery"
    ? Promise.resolve(unlockWithRecovery(envelope, credential.secret, envelope.profileId))
    : unlockWithPassphrase(envelope, credential.secret, envelope.profileId), action);
}

async function verifyArtifact<T>(options: Omit<VerifyOptions, "credential">,
  unlock: (envelope: ProfileKeyEnvelope) => Promise<Buffer>, action: (verified: VerifiedBackup) => Promise<T>): Promise<T> {
  const { source, stagingParent, migrations, signal } = options;
  absolute(stagingParent); signal?.throwIfAborted();
  const input = await openRegular(source);
  let staging: string | undefined, dataKey: Buffer | undefined, key: Buffer | undefined, manifest: Buffer | undefined;
  try {
    const size = (await input.stat()).size;
    const prefix = await read(input, 12, 0);
    const headerLength = prefix.readUInt32BE(8);
    if (!prefix.subarray(0, 8).equals(MAGIC) || headerLength < 1 || headerLength > MAX_HEADER) throw invalid();
    const headerBytes = await read(input, headerLength, 12), header = parseHeader(headerBytes);
    const payloadLength = header.manifestBytes + header.databaseBytes, start = 12 + headerLength;
    if (size !== start + payloadLength + 16) throw invalid();
    dataKey = await unlock(header.envelope); verifyProfileKey(header.envelope, dataKey, header.envelope.profileId);
    signal?.throwIfAborted();
    key = outerKey(dataKey, header.salt);
    const decipher = createDecipheriv("aes-256-gcm", key, decode(header.nonce, 12), { authTagLength: 16 });
    decipher.setAAD(Buffer.concat([prefix, headerBytes]));
    decipher.setAuthTag(await read(input, 16, start + payloadLength));
    staging = await fs.mkdtemp(path.join(stagingParent, ".bucky-restore-"));
    const databaseFile = path.join(staging, "book.sqlite");
    const output = await fs.open(databaseFile, "wx", 0o600);
    manifest = Buffer.alloc(header.manifestBytes);
    let manifestOffset = 0;
    try {
      for (let offset = 0; offset < payloadLength; offset += CHUNK) {
        signal?.throwIfAborted();
        const bytes = decipher.update(await read(input, Math.min(CHUNK, payloadLength - offset), start + offset));
        try {
          const count = Math.min(bytes.length, manifest.length - manifestOffset);
          bytes.copy(manifest, manifestOffset, 0, count); manifestOffset += count;
          // Only the still-encrypted SQLite bytes reach disk; the manifest stays in memory.
          await write(output, bytes.subarray(count));
        } finally { bytes.fill(0); }
      }
      const final = decipher.final(); // No database open or manifest parse before GCM authentication succeeds.
      if (final.length || manifestOffset !== manifest.length || (await input.stat()).size !== size) throw invalid();
      await output.sync();
    } finally { await output.close(); }
    signal?.throwIfAborted();
    const summary = await validateEncryptedRecoveryDatabase(databaseFile, dataKey, migrations, signal);
    if (JSON.stringify(JSON.parse(manifest.toString("utf8"))) !== JSON.stringify({ summary })) throw invalid();
    signal?.throwIfAborted();
    return await action({ databaseFile, dataKey, envelope: header.envelope, summary });
  } catch { throw invalid(); }
  finally {
    key?.fill(0); dataKey?.fill(0); manifest?.fill(0); await input.close();
    if (staging) await fs.rm(staging, { recursive: true, force: true });
  }
}
