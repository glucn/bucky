-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Checkpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "balance" REAL NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Checkpoint" ("accountId", "balance", "createdAt", "date", "description", "id", "updatedAt") SELECT "accountId", "balance", "createdAt", "date", "description", "id", "updatedAt" FROM "Checkpoint";
DROP TABLE "Checkpoint";
ALTER TABLE "new_Checkpoint" RENAME TO "Checkpoint";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
