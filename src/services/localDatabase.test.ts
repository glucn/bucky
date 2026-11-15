import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import sqlite3 from "sqlite3";
import { initializePersonalDatabase, resolveDatabaseFile } from "./localDatabase";

const migrations = path.resolve("prisma/migrations");
let directory: string;
let filename: string;

async function sql(statement: string, file = filename): Promise<any[]> {
  const db = new sqlite3.Database(file);
  try {
    return await new Promise<any[]>((resolve, reject) => db.all(statement, (error, rows) =>
      error ? reject(error) : resolve(rows)));
  } finally {
    await new Promise<void>((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
  }
}

describe("Personal database lifecycle", () => {
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "bucky-lifecycle-"));
    filename = path.join(directory, "personal", "book.sqlite");
  });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

  it("keeps packaged personal data independent of cwd and test/development files", () => {
    expect(resolveDatabaseFile({ isPackaged: true, userData: directory, cwd: "/arbitrary", env: {} }))
      .toBe(path.join(directory, "profiles", "default", "book.sqlite"));
    expect(resolveDatabaseFile({ isPackaged: false, cwd: directory, env: { NODE_ENV: "test" } }))
      .toBe(path.join(directory, "prisma", "test.db"));
    expect(resolveDatabaseFile({ isPackaged: false, cwd: directory, env: {} }))
      .toBe(path.join(directory, "prisma", "dev.db"));
  });

  it("does not let inherited test environment variables redirect a packaged personal app", () => {
    expect(resolveDatabaseFile({ isPackaged: true, userData: directory, cwd: "/arbitrary",
      env: { NODE_ENV: "test", VITEST: "true" } })).toContain("profiles/default/book.sqlite");
  });

  it("initializes an empty personal database and reopens it without reseeding or changing records", async () => {
    await initializePersonalDatabase(filename, migrations);
    await sql(`INSERT INTO Account (id,name,type,subtype,currency,updatedAt)
      VALUES ('personal-account','My account','user','asset','CAD',CURRENT_TIMESTAMP)`);
    await initializePersonalDatabase(filename, migrations);
    expect(await sql("SELECT name,currency FROM Account WHERE id='personal-account'"))
      .toEqual([{ name: "My account", currency: "CAD" }]);
    expect((await sql("PRAGMA integrity_check"))[0].integrity_check).toBe("ok");
    expect(await sql("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("backs up before an upgrade and preserves existing records", async () => {
    const partial = path.join(directory, "old-migrations");
    const names = (await fs.readdir(migrations)).filter((name) => /^\d/.test(name)).sort();
    for (const name of names.filter((name) => name < "20261114000000_portfolio_identity")) {
      await fs.cp(path.join(migrations, name), path.join(partial, name), { recursive: true });
    }
    await initializePersonalDatabase(filename, partial);
    await sql(`INSERT INTO Account (id,name,type,subtype,currency,updatedAt)
      VALUES ('keep','Keep through upgrade','user','asset','CAD',CURRENT_TIMESTAMP)`);
    await sql(`INSERT INTO Checkpoint (id,accountId,date,balance,updatedAt) VALUES
      ('whole-cents','keep','2026-01-02',-12.34,CURRENT_TIMESTAMP),
      ('sub-cent','keep','2026-01-03',12.345,CURRENT_TIMESTAMP),
      ('large','keep','2026-01-04',80000000000000.06,CURRENT_TIMESTAMP)`);
    await sql("INSERT INTO JournalEntry (id,date,updatedAt) VALUES ('entry','2026-01-02',CURRENT_TIMESTAMP)");
    await sql(`INSERT INTO JournalLine (id,entryId,accountId,amount,currency) VALUES
      ('whole','entry','keep',-0.29,'CAD'), ('ambiguous','entry','keep',0.005,'CAD')`);
    await sql(`INSERT INTO FxDailyRate (id,sourceCurrency,targetCurrency,marketDate,rate) VALUES
      ('ordinary','USD','CAD','2026-01-02',1.25),
      ('long','USD','CAD','2026-01-03',1.2345678901234567)`);
    await sql(`INSERT INTO InvestmentProperties (id,accountId,tickerSymbol,quantity,costBasisMethod,lots,updatedAt)
      VALUES ('legacy-holding','keep','ABC',3,'FIFO','[]',CURRENT_TIMESTAMP)`);
    await sql(`INSERT INTO InvestmentActivity (id,accountId,sequence,date,kind,ticker,currency,costBasisMethod,quantityBefore,quantityAfter,basisBefore,basisAfter,cashAmount,price)
      VALUES ('quantity-upgrade','keep',1,'2026-01-02','buy','ABC','CAD','FIFO',0,0.3,0,3,-3,10)`);
    await sql(`INSERT INTO SecurityPriceHistory (id,tickerSymbol,date,price,source) VALUES ('legacy-price','ABC','2026-01-02',999,'manual')`);
    await sql(`INSERT INTO SecurityDailyPrice (id,ticker,market,marketDate,close) VALUES ('canonical-price','ABC','NASDAQ','2026-01-02',12.345678)`);
    await sql(`INSERT INTO AccountGroup (id,name,accountType,updatedAt) VALUES ('known','Recorded holdings','user',CURRENT_TIMESTAMP), ('cash','Cash-only broker','user',CURRENT_TIMESTAMP), ('bank','Bank group','user',CURRENT_TIMESTAMP)`);
    await sql(`UPDATE Account SET groupId='known' WHERE id='keep'`);
    await sql(`INSERT INTO Account (id,name,type,subtype,currency,groupId,updatedAt) VALUES ('cash-only','Trade Cash - Cash-only broker (CAD)','user','asset','CAD','cash',CURRENT_TIMESTAMP), ('bank-cash','Trade Cash - Bank group (CAD)','user','asset','CAD','bank',CURRENT_TIMESTAMP)`);
    const result = await initializePersonalDatabase(filename, migrations);
    expect(await sql("SELECT count(*) AS count FROM InvestmentCorrection")).toEqual([{ count: 0 }]);
    expect(result.backupPath).toBeTruthy();
    expect(await sql("SELECT id,balance,balanceCents FROM Checkpoint ORDER BY id")).toEqual([
      { id: "large", balance: 80000000000000.06, balanceCents: null },
      { id: "sub-cent", balance: 12.345, balanceCents: null },
      { id: "whole-cents", balance: -12.34, balanceCents: "-1234" },
    ]);
    expect(await sql("SELECT balance FROM Checkpoint WHERE id='sub-cent'", result.backupPath!)).toEqual([{ balance: 12.345 }]);
    expect(await sql("SELECT id,amount,amountCents FROM JournalLine ORDER BY id")).toEqual([
      { id: "ambiguous", amount: 0.005, amountCents: null }, { id: "whole", amount: -0.29, amountCents: "-29" },
    ]);
    expect(await sql("SELECT id,rate,rateDecimal FROM FxDailyRate ORDER BY id")).toEqual([
      { id: "long", rate: 1.2345678901234567, rateDecimal: null },
      { id: "ordinary", rate: 1.25, rateDecimal: "1.25" },
    ]);
    expect(await sql("SELECT name FROM Account WHERE id='keep'"))
      .toEqual([{ name: "Keep through upgrade" }]);
    expect(await sql("SELECT name FROM Account WHERE id='keep'", result.backupPath!))
      .toEqual([{ name: "Keep through upgrade" }]);
    expect(await sql("SELECT market,quantity,quantityDecimal FROM InvestmentProperties WHERE id='legacy-holding'"))
      .toEqual([{ market: null, quantity: 3, quantityDecimal: "3.0" }]);
    expect(await sql("SELECT quantityBeforeDecimal,quantityAfterDecimal,priceDecimal,splitRatioDecimal FROM InvestmentActivity WHERE id='quantity-upgrade'"))
      .toEqual([{ quantityBeforeDecimal: "0.0", quantityAfterDecimal: "0.3", priceDecimal: "10.0", splitRatioDecimal: null }]);
    expect(await sql("SELECT close,closeDecimal,source FROM SecurityDailyPrice WHERE id='canonical-price'"))
      .toEqual([{ close: 12.345678, closeDecimal: "12.345678", source: "provider" }]);
    expect(await sql("SELECT priceBasis,barStatus,basisAsOf FROM SecurityDailyPrice WHERE id='canonical-price'"))
      .toEqual([{ priceBasis: "unknown", barStatus: "unknown", basisAsOf: null }]);
    expect(await sql("SELECT price,source FROM SecurityPriceHistory WHERE id='legacy-price'"))
      .toEqual([{ price: 999, source: "manual" }]);
    expect(await sql("SELECT quantity FROM InvestmentProperties WHERE id='legacy-holding'", result.backupPath!))
      .toEqual([{ quantity: 3 }]);
    expect(await sql("SELECT hasCompleteActivityHistory FROM InvestmentProperties WHERE id='legacy-holding'"))
      .toEqual([{ hasCompleteActivityHistory: 0 }]);
    expect(await sql("SELECT count(*) AS count FROM InvestmentActivity")).toEqual([{ count: 1 }]);
    expect(await sql("SELECT count(*) AS count FROM InvestmentImportOrigin")).toEqual([{ count: 0 }]);
    expect(await sql("SELECT id,isInvestmentPortfolio FROM AccountGroup ORDER BY id")).toEqual([
      { id: "bank", isInvestmentPortfolio: 0 }, { id: "cash", isInvestmentPortfolio: 0 }, { id: "known", isInvestmentPortfolio: 1 },
    ]);
    expect((await sql("PRAGMA table_info(AccountGroup)", result.backupPath!)).some((column) => column.name === "isInvestmentPortfolio")).toBe(false);
  });

  it("rolls back an unsuccessful migration and leaves a recoverable pre-upgrade snapshot", async () => {
    await initializePersonalDatabase(filename, migrations);
    const broken = path.join(directory, "broken-migrations");
    await fs.cp(migrations, broken, { recursive: true });
    const extra = path.join(broken, "20990101000000_broken");
    await fs.mkdir(extra);
    await fs.writeFile(path.join(extra, "migration.sql"),
      "CREATE TABLE MustRollBack(id TEXT); INSERT INTO MissingTable VALUES (1);");
    await expect(initializePersonalDatabase(filename, broken)).rejects.toThrow();
    expect(await sql("SELECT name FROM sqlite_master WHERE name='MustRollBack'")) .toEqual([]);
    expect(await sql("SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%broken'"))
      .toEqual([]);
    const backups = await fs.readdir(path.join(path.dirname(filename), "backups"));
    expect(backups.some((name) => name.endsWith(".sqlite"))).toBe(true);
  });

  it("refuses untracked existing schemas without altering them", async () => {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await sql("CREATE TABLE ExistingPersonalRecords (id TEXT)");
    const before = await fs.readFile(filename);
    await expect(initializePersonalDatabase(filename, migrations)).rejects.toThrow(/untracked/i);
    expect(await fs.readFile(filename)).toEqual(before);
  });

  it("refuses edited or missing applied migrations", async () => {
    await initializePersonalDatabase(filename, migrations);
    await sql("UPDATE _prisma_migrations SET checksum='changed' WHERE migration_name LIKE '%init'");
    await expect(initializePersonalDatabase(filename, migrations)).rejects.toThrow(/checksum/i);
  });
});
