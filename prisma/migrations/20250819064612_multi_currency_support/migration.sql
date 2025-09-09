/*
  Warnings:

  - Added the required column `currency` to the `JournalLine` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- ALTER TABLE "JournalEntry" ADD COLUMN "type" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT, -- temporarily nullable for data migration
    "exchangeRate" REAL,
    "description" TEXT
);
-- Copy data and set currency from related Account
INSERT INTO "new_JournalLine" ("accountId", "amount", "description", "entryId", "id", "currency")
SELECT "accountId", "amount", "description", "entryId", "id",
       (SELECT "currency" FROM "Account" WHERE "Account"."id" = "JournalLine"."accountId") as "currency"
FROM "JournalLine";
DROP TABLE "JournalLine";
ALTER TABLE "new_JournalLine" RENAME TO "JournalLine";
-- Ensure all rows have currency set (should be set above, but for safety)
UPDATE "JournalLine" SET "currency" = 'USD' WHERE "currency" IS NULL;
-- Make currency NOT NULL
ALTER TABLE "JournalLine" RENAME TO "tmp_JournalLine";
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRate" REAL,
    "description" TEXT
);
INSERT INTO "JournalLine" ("id", "entryId", "accountId", "amount", "currency", "exchangeRate", "description")
SELECT "id", "entryId", "accountId", "amount", "currency", "exchangeRate", "description"
FROM "tmp_JournalLine";
DROP TABLE "tmp_JournalLine";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
