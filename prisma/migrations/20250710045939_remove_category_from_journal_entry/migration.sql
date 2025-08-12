/*
  Warnings:

  - You are about to drop the column `category` on the `JournalEntry` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Checkpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "balance" REAL NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Checkpoint" ("accountId", "balance", "createdAt", "date", "description", "id", "updatedAt") SELECT "accountId", "balance", "createdAt", "date", "description", "id", "updatedAt" FROM "Checkpoint";
DROP TABLE "Checkpoint";
ALTER TABLE "new_Checkpoint" RENAME TO "Checkpoint";
CREATE TABLE "new_JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_JournalEntry" ("createdAt", "date", "description", "id", "updatedAt") SELECT "createdAt", "date", "description", "id", "updatedAt" FROM "JournalEntry";
DROP TABLE "JournalEntry";
ALTER TABLE "new_JournalEntry" RENAME TO "JournalEntry";
CREATE TABLE "new_JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "description" TEXT
);
INSERT INTO "new_JournalLine" ("accountId", "amount", "description", "entryId", "id") SELECT "accountId", "amount", "description", "entryId", "id" FROM "JournalLine";
DROP TABLE "JournalLine";
ALTER TABLE "new_JournalLine" RENAME TO "JournalLine";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
