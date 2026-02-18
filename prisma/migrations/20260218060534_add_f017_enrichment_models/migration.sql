-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN "entryType" TEXT;

-- CreateTable
CREATE TABLE "AutoCategorizationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "normalizedPattern" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "targetCategoryAccountId" TEXT,
    "lastConfirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "jsonValue" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SecurityMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "displayName" TEXT,
    "assetType" TEXT,
    "quoteCurrency" TEXT,
    "lastFetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SecurityDailyPrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "marketDate" TEXT NOT NULL,
    "close" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FxDailyRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceCurrency" TEXT NOT NULL,
    "targetCurrency" TEXT NOT NULL,
    "marketDate" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AutoCategorizationRule_matchType_normalizedPattern_idx" ON "AutoCategorizationRule"("matchType", "normalizedPattern");

-- CreateIndex
CREATE INDEX "AutoCategorizationRule_targetCategoryAccountId_idx" ON "AutoCategorizationRule"("targetCategoryAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoCategorizationRule_normalizedPattern_matchType_key" ON "AutoCategorizationRule"("normalizedPattern", "matchType");

-- CreateIndex
CREATE INDEX "SecurityMetadata_ticker_market_idx" ON "SecurityMetadata"("ticker", "market");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityMetadata_ticker_market_key" ON "SecurityMetadata"("ticker", "market");

-- CreateIndex
CREATE INDEX "SecurityDailyPrice_ticker_market_marketDate_idx" ON "SecurityDailyPrice"("ticker", "market", "marketDate");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityDailyPrice_ticker_market_marketDate_key" ON "SecurityDailyPrice"("ticker", "market", "marketDate");

-- CreateIndex
CREATE INDEX "FxDailyRate_sourceCurrency_targetCurrency_marketDate_idx" ON "FxDailyRate"("sourceCurrency", "targetCurrency", "marketDate");

-- CreateIndex
CREATE UNIQUE INDEX "FxDailyRate_sourceCurrency_targetCurrency_marketDate_key" ON "FxDailyRate"("sourceCurrency", "targetCurrency", "marketDate");

-- CreateIndex
CREATE INDEX "JournalEntry_entryType_idx" ON "JournalEntry"("entryType");
