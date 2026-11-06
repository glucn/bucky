-- Preserve old holdings as unverified history; do not infer trades or starting quantities.
ALTER TABLE "InvestmentProperties" ADD COLUMN "hasCompleteActivityHistory" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "InvestmentActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "date" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "market" TEXT,
  "currency" TEXT NOT NULL,
  "costBasisMethod" TEXT NOT NULL,
  "quantityBefore" REAL NOT NULL,
  "quantityAfter" REAL NOT NULL,
  "basisBefore" REAL NOT NULL,
  "basisAfter" REAL NOT NULL,
  "lotsAfter" TEXT,
  "units" REAL,
  "price" REAL,
  "fee" REAL,
  "splitRatio" REAL,
  "cashAmount" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InvestmentActivity_accountId_sequence_key" ON "InvestmentActivity"("accountId", "sequence");
CREATE INDEX "InvestmentActivity_accountId_date_idx" ON "InvestmentActivity"("accountId", "date");
CREATE TABLE "InvestmentActivityJournal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "activityId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL
);
CREATE UNIQUE INDEX "InvestmentActivityJournal_entryId_key" ON "InvestmentActivityJournal"("entryId");
CREATE INDEX "InvestmentActivityJournal_activityId_idx" ON "InvestmentActivityJournal"("activityId");
