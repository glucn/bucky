import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { createCipheriv, createDecipheriv, hkdfSync } from "crypto";
import { createClient } from "@libsql/client";
import { createProfileKeys } from "./profileKeys";
import { initializeEncryptedDatabase } from "./encryptedDatabase";
import { closeSqlite, openSqlite, querySql } from "./localDatabase";
import { createProtectedBackup, withVerifiedProtectedBackup } from "./protectedBackup";

const migrations = path.resolve("prisma/migrations");
const passphrase = "Synthetic portable backup passphrase";
const sentinel = "Private portable book sentinel 90dcf";
let directory: string, source: string, destination: string;
let keys: Awaited<ReturnType<typeof createProfileKeys>>;
const client = (file = source, key = keys.dataKey) => createClient({ url: pathToFileURL(file).href, encryptionKey: key.toString("hex"), concurrency: 1 });
const save = (signal?: AbortSignal) => createProtectedBackup({ source, destination, migrations, ...keys, signal });
const recover = (action: Parameters<typeof withVerifiedProtectedBackup>[1], credential = { mode: "recovery" as const, secret: keys.recoverySecret }) =>
  withVerifiedProtectedBackup({ source: destination, stagingParent: directory, migrations, credential }, action);

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-protected-backup-"));
  source = path.join(directory, "book.sqlite"); destination = path.join(directory, "book.buckybackup");
  keys = await createProfileKeys("default", { passphrase, keychain: {
    isAvailable: () => true, encryptString: async () => Buffer.from("machine-bound-only"), decryptString: async () => { throw new Error("Original device is unavailable"); },
  } });
  await initializeEncryptedDatabase(source, migrations, keys.dataKey);
  const db = client();
  try { await db.executeMultiple(`INSERT INTO Account(id,name,type,subtype,currency,updatedAt)
    VALUES ('cash','${sentinel}','user','asset','CAD',CURRENT_TIMESTAMP),
    ('equity','Opening equity','equity','equity','CAD',CURRENT_TIMESTAMP);
    INSERT INTO JournalEntry(id,date,description,updatedAt) VALUES ('entry',CURRENT_TIMESTAMP,'Opening',CURRENT_TIMESTAMP);
    INSERT INTO JournalLine(id,entryId,accountId,amount,currency)
    VALUES ('debit','entry','cash',123.45,'CAD'),('credit','entry','equity',-123.45,'CAD');`); }
  finally { db.close(); }
});
afterEach(async () => { vi.restoreAllMocks(); keys?.dataKey.fill(0); await fs.rm(directory, { recursive: true, force: true }); });

it("exports committed WAL data and independently recovers a verified encrypted stage with either credential", async () => {
  const live = client();
  let retainedKey: Buffer | undefined, staged: string | undefined;
  try {
    await live.execute("PRAGMA journal_mode=WAL");
    await live.execute("UPDATE JournalLine SET amount=amount*2");
    const saved = await save();
    await live.execute("UPDATE Account SET name='Later edit' WHERE id='cash'");
    const bytes = await fs.readFile(destination);
    for (const secret of [sentinel, passphrase, keys.recoverySecret, "machine-bound-only", keys.dataKey.toString("hex")]) {
      expect(bytes.includes(Buffer.from(secret))).toBe(false);
    }
    expect((await fs.stat(destination)).mode & 0o777).toBe(0o600);
    await recover(async (verified) => {
      staged = verified.databaseFile; retainedKey = verified.dataKey;
      expect((await fs.stat(path.dirname(staged))).mode & 0o777).toBe(0o700);
      expect((await fs.stat(staged)).mode & 0o777).toBe(0o600);
      expect(verified.envelope.keychain).toBeUndefined();
      expect(verified.summary).toEqual(saved.summary);
      expect(verified.summary.balances).toContainEqual({ accountId: "cash", currency: "CAD", amount: 246.9 });
      const copy = client(verified.databaseFile, verified.dataKey);
      try { expect((await copy.execute("SELECT name FROM Account WHERE id='cash'")).rows[0].name).toBe(sentinel); }
      finally { copy.close(); }
      const plain = await openSqlite(verified.databaseFile);
      try { await expect(querySql(plain, "SELECT name FROM Account")).rejects.toThrow(); }
      finally { await closeSqlite(plain); }
      expect((await fs.readFile(verified.databaseFile)).includes(Buffer.from(sentinel))).toBe(false);
    });
    expect(retainedKey!.equals(Buffer.alloc(32))).toBe(true);
    await expect(fs.stat(staged!)).rejects.toThrow();
    await withVerifiedProtectedBackup({ source: destination, stagingParent: directory, migrations,
      credential: { mode: "passphrase", secret: passphrase } }, async (verified) => expect(verified.summary).toEqual(saved.summary));
    expect((await live.execute("SELECT name FROM Account WHERE id='cash'")).rows[0].name).toBe("Later edit");
    await expect(fs.stat(path.join(directory, "active-profile.json"))).rejects.toThrow();
  } finally { live.close(); }
});

it.each(["wrong-recovery", "wrong-passphrase", "header", "nonce", "salt", "unused-passphrase-wrap", "ciphertext", "tag", "truncated", "appended", "version", "oversized-header"])(
  "rejects %s before releasing any recovered database, preserving the source and existing book", async (kind) => {
    await save();
    const bytes = await fs.readFile(destination);
    const bookBefore = await fs.readFile(source);
    if (kind === "header") bytes[12] ^= 1;
    if (["nonce", "salt", "unused-passphrase-wrap"].includes(kind)) {
      const header = JSON.parse(bytes.subarray(12, 12 + bytes.readUInt32BE(8)).toString());
      const object = kind === "unused-passphrase-wrap" ? header.envelope.passphrase : header;
      const field = kind === "nonce" ? "nonce" : "salt";
      object[field] = (object[field][0] === "A" ? "B" : "A") + object[field].slice(1);
      Buffer.from(JSON.stringify(header)).copy(bytes, 12);
    }
    if (kind === "ciphertext") bytes[bytes.length - 100] ^= 1;
    if (kind === "tag") bytes[bytes.length - 1] ^= 1;
    if (kind === "oversized-header") bytes.writeUInt32BE(0x7fffffff, 8);
    if (kind === "version") {
      const header = bytes.subarray(12, 12 + bytes.readUInt32BE(8));
      const position = header.indexOf('"version":1');
      expect(position).toBeGreaterThanOrEqual(0); header[position + 10] = "9".charCodeAt(0);
    }
    await fs.writeFile(destination, kind === "truncated" ? bytes.subarray(0, bytes.length - 1)
      : kind === "appended" ? Buffer.concat([bytes, Buffer.from("extra")]) : bytes);
    const before = await fs.readFile(destination);
    const action = vi.fn();
    await expect(withVerifiedProtectedBackup({ source: destination, stagingParent: directory, migrations,
      credential: kind === "wrong-passphrase" ? { mode: "passphrase", secret: "Incorrect synthetic passphrase" }
        : { mode: "recovery", secret: kind === "wrong-recovery" ? "not the saved code" : keys.recoverySecret } }, action)).rejects.toThrow();
    expect(action).not.toHaveBeenCalled();
    expect(await fs.readFile(destination)).toEqual(before);
    expect(await fs.readFile(source)).toEqual(bookBefore);
    expect((await fs.readdir(directory)).filter((name) => name.startsWith(".bucky-"))).toEqual([]);
  },
);

it("refuses overwritten and symlink targets and mismatched envelopes without changing existing files", async () => {
  await fs.writeFile(destination, "existing backup");
  await expect(save()).rejects.toThrow();
  expect(await fs.readFile(destination, "utf8")).toBe("existing backup");
  await fs.unlink(destination); await fs.symlink(source, destination);
  const before = await fs.readFile(source);
  await expect(save()).rejects.toThrow();
  expect(await fs.readFile(source)).toEqual(before);
  await fs.unlink(destination);
  const other = await createProfileKeys("default", { passphrase });
  try { await expect(createProtectedBackup({ source, destination, migrations, dataKey: keys.dataKey, envelope: other.envelope })).rejects.toThrow(); }
  finally { other.dataKey.fill(0); }
  await expect(fs.stat(destination)).rejects.toThrow();
});

it("refuses missing, linked, or plaintext input rather than creating or converting a book", async () => {
  for (const candidate of [path.join(directory, "missing"), path.join(directory, "linked"), path.join(directory, "plain")]) {
    if (candidate.endsWith("linked")) await fs.symlink(source, candidate);
    if (candidate.endsWith("plain")) await fs.writeFile(candidate, "SQLite format 3\0");
    await expect(createProtectedBackup({ source: candidate, destination, migrations, ...keys })).rejects.toThrow();
    await expect(fs.stat(destination)).rejects.toThrow();
  }
  await expect(fs.stat(path.join(directory, "missing"))).rejects.toThrow();
});

it("cleans staging after cancellation, callback failure, and failed publication", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(save(controller.signal)).rejects.toThrow();
  await expect(fs.stat(destination)).rejects.toThrow();
  vi.spyOn(fs, "link").mockRejectedValueOnce(new Error("Disk full"));
  await expect(save()).rejects.toThrow();
  await expect(fs.stat(destination)).rejects.toThrow();
  await save();
  await expect(recover(async () => { throw new Error("Canceled by caller"); })).rejects.toThrow();
  expect((await fs.readdir(directory)).filter((name) => name.startsWith(".bucky-"))).toEqual([]);
});

it.each(["references", "schema", "migration-history"])("rejects invalid %s even when the encrypted database passes SQLite integrity", async (kind) => {
  const db = client();
  try { await db.execute(kind === "references" ? "DELETE FROM Account WHERE id='cash'"
    : kind === "schema" ? "DROP TABLE AppSetting" : "UPDATE _prisma_migrations SET checksum='invalid'"); } finally { db.close(); }
  await expect(save()).rejects.toThrow();
  await expect(fs.stat(destination)).rejects.toThrow();
});

it("checks the record manifest even when an altered artifact has a valid authentication tag", async () => {
  await save();
  const bytes = await fs.readFile(destination);
  const length = bytes.readUInt32BE(8), start = 12 + length;
  const header = JSON.parse(bytes.subarray(12, start).toString());
  const key = Buffer.from(hkdfSync("sha256", keys.dataKey, Buffer.from(header.salt, "base64url"), "bucky-protected-backup-v1", 32));
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(header.nonce, "base64url"));
    decipher.setAAD(bytes.subarray(0, start)); decipher.setAuthTag(bytes.subarray(-16));
    const payload = Buffer.concat([decipher.update(bytes.subarray(start, -16)), decipher.final()]);
    const manifest = JSON.parse(payload.subarray(0, header.manifestBytes).toString());
    manifest.summary.tableCounts.Account++;
    const altered = Buffer.from(JSON.stringify(manifest));
    expect(altered.length).toBe(header.manifestBytes); altered.copy(payload);
    const cipher = createCipheriv("aes-256-gcm", key, Buffer.from(header.nonce, "base64url"));
    cipher.setAAD(bytes.subarray(0, start));
    await fs.writeFile(destination, Buffer.concat([bytes.subarray(0, start), cipher.update(payload), cipher.final(), cipher.getAuthTag()]));
    payload.fill(0);
    const action = vi.fn(); await expect(recover(action)).rejects.toThrow(); expect(action).not.toHaveBeenCalled();
  } finally { key.fill(0); }
});

it("does not publish on mid-write cancellation and never enters the recovery callback after cancellation", async () => {
  const controller = new AbortController();
  const open = fs.open;
  vi.spyOn(fs, "open").mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args);
    if (String(args[0]).endsWith("/artifact") && args[1] === "wx") controller.abort();
    return handle;
  });
  await expect(save(controller.signal)).rejects.toThrow();
  await expect(fs.stat(destination)).rejects.toThrow();
  vi.restoreAllMocks(); await save();
  const action = vi.fn();
  await expect(withVerifiedProtectedBackup({ source: destination, stagingParent: directory, migrations,
    credential: { mode: "recovery", secret: keys.recoverySecret }, signal: controller.signal }, action)).rejects.toThrow();
  expect(action).not.toHaveBeenCalled();
  expect((await fs.readdir(directory)).filter((name) => name.startsWith(".bucky-"))).toEqual([]);
});

it("removes a failed partial write but preserves a complete backup if directory sync fails after publication", async () => {
  const open = fs.open;
  vi.spyOn(fs, "open").mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args);
    if (String(args[0]).endsWith("/artifact") && args[1] === "wx") vi.spyOn(handle, "write").mockRejectedValueOnce(new Error("Disk full"));
    return handle;
  });
  await expect(save()).rejects.toThrow();
  await expect(fs.stat(destination)).rejects.toThrow();
  expect((await fs.readdir(directory)).filter((name) => name.startsWith(".bucky-"))).toEqual([]);
  vi.restoreAllMocks();
  vi.spyOn(fs, "open").mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args);
    if (args[0] === directory && args[1] === "r") vi.spyOn(handle, "sync").mockRejectedValueOnce(new Error("Sync failed"));
    return handle;
  });
  await expect(save()).rejects.toThrow(/published.*durability/i);
  vi.restoreAllMocks();
  await recover(async (verified) => expect(verified.summary.tableCounts.Account).toBe(2));
});

it("uses fresh encryption parameters for each export and rejects linked or non-regular recovery input", async () => {
  await save();
  const second = path.join(directory, "second.buckybackup");
  await createProtectedBackup({ source, destination: second, migrations, ...keys });
  expect(await fs.readFile(second)).not.toEqual(await fs.readFile(destination));
  const linked = path.join(directory, "linked.buckybackup"); await fs.symlink(destination, linked);
  const action = vi.fn();
  for (const input of [linked, directory]) {
    await expect(withVerifiedProtectedBackup({ source: input, stagingParent: directory, migrations,
      credential: { mode: "recovery", secret: keys.recoverySecret } }, action)).rejects.toThrow();
  }
  expect(action).not.toHaveBeenCalled();
  expect(keys.dataKey.equals(Buffer.alloc(32))).toBe(false);
});
