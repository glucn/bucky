import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import { createClient } from "@libsql/client";
import { initializeEncryptedDatabase } from "./encryptedDatabase";
import { closeSqlite, openSqlite, querySql } from "./localDatabase";

const migrations = path.resolve("prisma/migrations");
let directory: string;
let filename: string;
let key: Buffer;
const sentinel = "encrypted-upgrade-private-account-9b1dd";

async function query(sql: string, file = filename, dataKey = key) {
  const client = createClient({ url: `file:${file}`, encryptionKey: dataKey.toString("hex"), concurrency: 1 });
  try { return (await client.execute(sql)).rows; } finally { client.close(); }
}

describe("encrypted personal database lifecycle", () => {
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-encrypted-lifecycle-"));
    filename = path.join(directory, "profile", "book.sqlite");
    key = randomBytes(32);
  });
  afterEach(async () => { key.fill(0); await fs.rm(directory, { recursive: true, force: true }); });

  it("applies real migrations, preserves records on reopen, and refuses plaintext/wrong-key reads", async () => {
    const result = await initializeEncryptedDatabase(filename, migrations, key);
    expect(result.applied.length).toBeGreaterThan(0);
    await query(`INSERT INTO Account (id,name,type,subtype,currency,updatedAt)
      VALUES ('keep','${sentinel}','user','asset','CAD',CURRENT_TIMESTAMP)`);
    await fs.chmod(filename, 0o644);
    expect(await initializeEncryptedDatabase(filename, migrations, key)).toEqual({ applied: [], backupPath: null });
    expect((await query("SELECT name FROM Account"))[0].name).toBe(sentinel);
    expect((await fs.readFile(filename)).includes(Buffer.from(sentinel))).toBe(false);
    expect((await fs.stat(filename)).mode & 0o777).toBe(0o600);
    const before = await fs.readFile(filename);
    await expect(initializeEncryptedDatabase(filename, migrations, randomBytes(32))).rejects.toThrow();
    expect(await fs.readFile(filename)).toEqual(before);
    const plain = await openSqlite(filename);
    try { await expect(querySql(plain, "SELECT name FROM Account")).rejects.toThrow(); }
    finally { await closeSqlite(plain); }
  });

  it("rejects invalid keys and relative paths before creating a database", async () => {
    await expect(initializeEncryptedDatabase(filename, migrations, Buffer.alloc(0))).rejects.toThrow(/key/i);
    await expect(initializeEncryptedDatabase("relative.sqlite", migrations, key)).rejects.toThrow(/absolute/i);
    await expect(fs.stat(filename)).rejects.toThrow();
  });

  it("keeps the pre-upgrade snapshot encrypted and preserves saved records", async () => {
    const partial = path.join(directory, "old-migrations");
    const names = (await fs.readdir(migrations)).filter((name) => /^\d/.test(name)).sort();
    for (const name of names.filter((name) => name < "20261114000000_portfolio_identity")) {
      await fs.cp(path.join(migrations, name), path.join(partial, name), { recursive: true });
    }
    await initializeEncryptedDatabase(filename, partial, key);
    await query(`INSERT INTO Account (id,name,type,subtype,currency,updatedAt)
      VALUES ('keep','${sentinel}','user','asset','CAD',CURRENT_TIMESTAMP)`);
    await query(`INSERT INTO Checkpoint (id,accountId,date,balance,updatedAt) VALUES
      ('cent','keep','2026-01-02',0.29,CURRENT_TIMESTAMP),
      ('ambiguous','keep','2026-01-03',12.345,CURRENT_TIMESTAMP)`);
    await query("INSERT INTO JournalEntry (id,date,updatedAt) VALUES ('entry','2026-01-02',CURRENT_TIMESTAMP)");
    await query("INSERT INTO JournalLine (id,entryId,accountId,amount,currency) VALUES ('line','entry','keep',-12.34,'CAD')");
    await query("UPDATE JournalLine SET exchangeRate=1.25 WHERE id='line'");
    await query(`INSERT INTO FxDailyRate (id,sourceCurrency,targetCurrency,marketDate,rate) VALUES
      ('exact-fx','USD','CAD','2026-01-02',1.25),
      ('legacy-fx','USD','CAD','2026-01-03',1.2345678901234567)`);
    await query(`INSERT INTO InvestmentProperties (id,accountId,tickerSymbol,quantity,costBasisMethod,lots,updatedAt)
      VALUES ('legacy-holding','keep','ABC',3,'FIFO','[]',CURRENT_TIMESTAMP)`);
    await query(`INSERT INTO SecurityPriceHistory (id,tickerSymbol,date,price,source) VALUES ('legacy-price','ABC','2026-01-02',999,'manual')`);
    await query(`INSERT INTO SecurityDailyPrice (id,ticker,market,marketDate,close) VALUES ('canonical-price','ABC','NASDAQ','2026-01-02',12.345678)`);
    await query(`INSERT INTO AccountGroup (id,name,accountType,updatedAt) VALUES ('known','Recorded holdings','user',CURRENT_TIMESTAMP), ('cash','Cash-only broker','user',CURRENT_TIMESTAMP), ('bank','Bank group','user',CURRENT_TIMESTAMP)`);
    await query(`UPDATE Account SET groupId='known' WHERE id='keep'`);
    await query(`INSERT INTO Account (id,name,type,subtype,currency,groupId,updatedAt) VALUES ('cash-only','Trade Cash - Cash-only broker (CAD)','user','asset','CAD','cash',CURRENT_TIMESTAMP), ('bank-cash','Trade Cash - Bank group (CAD)','user','asset','CAD','bank',CURRENT_TIMESTAMP)`);
    const result = await initializeEncryptedDatabase(filename, migrations, key);
    expect(await query("SELECT count(*) AS count FROM InvestmentCorrection")).toEqual([{ count: 0 }]);
    expect(result.backupPath).toBeTruthy();
    expect(await query("SELECT id,balance,balanceCents FROM Checkpoint ORDER BY id")).toEqual([
      { id: "ambiguous", balance: 12.345, balanceCents: null },
      { id: "cent", balance: 0.29, balanceCents: "29" },
    ]);
    expect(await query("SELECT balance FROM Checkpoint WHERE id='ambiguous'", result.backupPath!)).toEqual([{ balance: 12.345 }]);
    expect(await query("SELECT amount,amountCents FROM JournalLine WHERE id='line'")).toEqual([{ amount: -12.34, amountCents: "-1234" }]);
    expect(await query("SELECT exchangeRate,exchangeRateDecimal FROM JournalLine WHERE id='line'"))
      .toEqual([{ exchangeRate: 1.25, exchangeRateDecimal: "1.25" }]);
    expect(await query("SELECT id,rate,rateDecimal FROM FxDailyRate ORDER BY id")).toEqual([
      { id: "exact-fx", rate: 1.25, rateDecimal: "1.25" },
      { id: "legacy-fx", rate: 1.2345678901234567, rateDecimal: null },
    ]);
    expect(await query("SELECT rate FROM FxDailyRate WHERE id='legacy-fx'", result.backupPath!))
      .toEqual([{ rate: 1.2345678901234567 }]);
    expect((await query("SELECT name FROM Account"))[0].name).toBe(sentinel);
    expect((await query("SELECT name FROM Account", result.backupPath!))[0].name).toBe(sentinel);
    expect((await query("SELECT market FROM InvestmentProperties WHERE id='legacy-holding'"))[0].market).toBeNull();
    expect(await query("SELECT quantity,quantityDecimal FROM InvestmentProperties WHERE id='legacy-holding'"))
      .toEqual([{ quantity: 3, quantityDecimal: "3.0" }]);
    expect((await query("SELECT close,closeDecimal,source FROM SecurityDailyPrice WHERE id='canonical-price'"))[0])
      .toMatchObject({ close: 12.345678, closeDecimal: "12.345678", source: "provider" });
    expect((await query("SELECT priceBasis,barStatus,basisAsOf FROM SecurityDailyPrice WHERE id='canonical-price'"))[0]).toEqual({ priceBasis: "unknown", barStatus: "unknown", basisAsOf: null });
    expect((await query("SELECT price,source FROM SecurityPriceHistory WHERE id='legacy-price'"))[0]).toMatchObject({ price: 999, source: "manual" });
    expect((await query("SELECT quantity FROM InvestmentProperties WHERE id='legacy-holding'", result.backupPath!))[0].quantity).toBe(3);
    expect((await query("SELECT hasCompleteActivityHistory FROM InvestmentProperties WHERE id='legacy-holding'"))[0].hasCompleteActivityHistory).toBe(0);
    expect((await query("SELECT count(*) AS count FROM InvestmentActivity"))[0].count).toBe(0);
    expect((await query("SELECT count(*) AS count FROM InvestmentImportOrigin"))[0].count).toBe(0);
    expect(await query("SELECT id,isInvestmentPortfolio FROM AccountGroup ORDER BY id")).toEqual([
      { id: "bank", isInvestmentPortfolio: 0 }, { id: "cash", isInvestmentPortfolio: 0 }, { id: "known", isInvestmentPortfolio: 1 },
    ]);
    expect((await query("PRAGMA table_info(AccountGroup)", result.backupPath!)).some((column: any) => column.name === "isInvestmentPortfolio")).toBe(false);
    expect((await fs.readFile(result.backupPath!)).includes(Buffer.from(sentinel))).toBe(false);
    await expect(query("SELECT name FROM Account", result.backupPath!, randomBytes(32))).rejects.toThrow();
  });

  it("rolls back all failed DDL and history writes, retaining a readable encrypted snapshot", async () => {
    await initializeEncryptedDatabase(filename, migrations, key);
    const broken = path.join(directory, "broken-migrations");
    await fs.cp(migrations, broken, { recursive: true });
    const extra = path.join(broken, "20990101000000_broken");
    await fs.mkdir(extra);
    await fs.writeFile(path.join(extra, "migration.sql"), "CREATE TABLE MustRollBack(id TEXT); INSERT INTO MissingTable VALUES (1);");
    await expect(initializeEncryptedDatabase(filename, broken, key)).rejects.toThrow(/rolled back/i);
    expect(await query("SELECT name FROM sqlite_master WHERE name='MustRollBack'")).toEqual([]);
    expect(await query("SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%broken'")).toEqual([]);
    const backups = await fs.readdir(path.join(path.dirname(filename), "backups"));
    expect(backups).toHaveLength(1);
    expect((await query("PRAGMA integrity_check", path.join(path.dirname(filename), "backups", backups[0])))[0].integrity_check).toBe("ok");
  });

  it("refuses migration drift and untracked encrypted schemas", async () => {
    await initializeEncryptedDatabase(filename, migrations, key);
    await query("UPDATE _prisma_migrations SET checksum='changed'");
    await expect(initializeEncryptedDatabase(filename, migrations, key)).rejects.toThrow(/checksum/i);
    const untracked = path.join(directory, "untracked.sqlite");
    await query("CREATE TABLE ExistingRecords(id TEXT)", untracked);
    await expect(initializeEncryptedDatabase(untracked, migrations, key)).rejects.toThrow(/untracked/i);
  });

  it("never silently converts or overwrites an existing plaintext book", async () => {
    const plain = await openSqlite(path.join(directory, "legacy.sqlite"));
    try { await querySql(plain, "CREATE TABLE PersonalRecord(id TEXT)"); }
    finally { await closeSqlite(plain); }
    const legacy = path.join(directory, "legacy.sqlite");
    const before = await fs.readFile(legacy);
    await expect(initializeEncryptedDatabase(legacy, migrations, key)).rejects.toThrow();
    expect(await fs.readFile(legacy)).toEqual(before);
  });
});
