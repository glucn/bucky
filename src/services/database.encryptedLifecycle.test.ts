import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import { databaseService } from "./database";
import { AccountSubtype, AccountType } from "../shared/accountTypes";

const migrations = path.resolve("prisma/migrations");
const retained = databaseService.prismaClient;
let directory: string;
let filename: string;
let key: Buffer;

describe("encrypted database service integration", () => {
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-encrypted-service-"));
    filename = path.join(directory, "book.sqlite");
    key = randomBytes(32);
    await databaseService.openEncryptedDatabase(filename, migrations, key);
    await databaseService.resetAllData();
  });
  afterEach(async () => {
    await databaseService.disconnect();
    key.fill(0);
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("persists actual service postings and reopens only with the explicit key", async () => {
    const account = await databaseService.createAccount({ name: "Private service sentinel 812b", currency: "CAD",
      type: AccountType.User, subtype: AccountSubtype.Asset });
    await databaseService.setOpeningBalance({ accountId: account.id, displayAmount: 246.8, asOfDate: "2026-09-01" });
    const before = await retained.journalLine.findMany({ orderBy: { id: "asc" } });
    expect(before).toHaveLength(2);
    const lazy = retained.account.findMany();
    await databaseService.disconnect();
    await expect(databaseService.getAccounts()).rejects.toThrow(/closed/i);
    await expect(Promise.resolve(lazy)).rejects.toThrow(/closed/i);
    await expect(databaseService.initialize()).rejects.toThrow(/unlock/i);
    expect(() => databaseService.getRecoveryContext()).toThrow(/protected recovery/i);
    await expect(databaseService.openEncryptedDatabase(filename, migrations, randomBytes(32))).rejects.toThrow();
    await expect(databaseService.getAccounts()).rejects.toThrow(/closed/i);
    await databaseService.openEncryptedDatabase(filename, migrations, key);
    expect(await retained.journalLine.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    expect((await fs.readFile(filename)).includes(Buffer.from(account.name))).toBe(false);
    await expect(Promise.resolve(lazy)).rejects.toThrow(/closed/i);
  });

  it("preserves batch rollback semantics through the revocable facade", async () => {
    const data = { id: "duplicate", name: "Must roll back", type: AccountType.User };
    await expect(retained.$transaction([
      retained.account.create({ data }), retained.account.create({ data }),
    ])).rejects.toMatchObject({ code: "P2002" });
    expect(await retained.account.findUnique({ where: { id: data.id } })).toBeNull();
  });

  it("cancels a pending unlock instead of opening after a close request", async () => {
    const pending = databaseService.openEncryptedDatabase(filename, migrations, key);
    const rejected = expect(pending).rejects.toThrow(/cancelled/i);
    await databaseService.disconnect();
    await rejected;
    await expect(databaseService.getAccounts()).rejects.toThrow(/closed/i);
    await databaseService.openEncryptedDatabase(filename, migrations, key);
    expect(await retained.account.count()).toBeGreaterThan(0);
  });

  it("rolls back an in-flight interactive write when the session is closed", async () => {
    let entered!: () => void;
    let proceed!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const resume = new Promise<void>((resolve) => { proceed = resolve; });
    const pending = retained.$transaction(async (tx) => {
      await tx.account.create({ data: { id: "revoked-write", name: "Uncommitted", type: AccountType.User } });
      entered();
      await resume;
      await tx.account.count();
    });
    const rejected = expect(pending).rejects.toThrow();
    await ready;
    const closing = databaseService.disconnect();
    proceed();
    await rejected;
    await closing;
    await databaseService.openEncryptedDatabase(filename, migrations, key);
    expect(await retained.account.findUnique({ where: { id: "revoked-write" } })).toBeNull();
  });
});
