import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { createClient, Transaction } from "@libsql/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
import { initializeDatabase, snapshotDatabase } from "./localDatabase";

function encryptedConfig(filename: string, key: Buffer) {
  if (!path.isAbsolute(filename)) throw new Error("Encrypted storage requires an absolute file path");
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("Encrypted storage requires a 32-byte data key");
  // Only local files. Never accept a caller-provided URL, remote token, or sync configuration.
  return { url: pathToFileURL(filename).href, encryptionKey: key.toString("hex"), concurrency: 1, timeout: 5000 };
}

/** No plaintext intermediary, automatic legacy conversion, or fallback on encryption failure. */
export async function initializeEncryptedDatabase(filename: string, migrations: string, key: Buffer) {
  const config = encryptedConfig(filename, key);
  return initializeDatabase(filename, migrations, async () => {
    // Reserve a new file privately before the native driver opens it.
    try { const file = await fs.open(filename, "wx", 0o600); await file.close(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    if (!(await fs.lstat(filename)).isFile()) throw new Error("Encrypted storage must be a regular file");
    const client = createClient(config);
    let tx: Transaction | undefined;
    return {
      query: async <T>(sql: string) => (await (tx ?? client).execute(sql)).rows as unknown as T[],
      execute: async (sql) => { await (tx ?? client).executeMultiple(sql); },
      run: async (sql, args) => { await (tx ?? client).execute({ sql, args }); },
      snapshot: (destination) => snapshotDatabase(destination, (sql, args) => client.execute({ sql, args })),
      begin: async () => {
        await client.execute("PRAGMA foreign_keys=OFF");
        tx = await client.transaction("write");
      },
      commit: async () => { await tx!.commit(); tx!.close(); tx = undefined; },
      rollback: async () => { if (tx) { try { await tx.rollback(); } finally { tx.close(); tx = undefined; } } },
      close: async () => { tx?.close(); client.close(); },
    };
  });
}

/** Call only after authenticated key recovery and migration; the caller owns the connection. */
export function createEncryptedPrisma(filename: string, key: Buffer): PrismaClient {
  return new PrismaClient({ adapter: new PrismaLibSQL(encryptedConfig(filename, key)), log: [] });
}
