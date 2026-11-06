-- Do not guess source identities for historical/manual transactions.
CREATE TABLE "InvestmentImportOrigin" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "portfolioId" TEXT NOT NULL,
  "sourceNamespace" TEXT NOT NULL DEFAULT '',
  "sourceKey" TEXT NOT NULL,
  "sourceId" TEXT,
  "fingerprint" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "entryId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "InvestmentImportOrigin_entryId_key" ON "InvestmentImportOrigin"("entryId");
CREATE UNIQUE INDEX "InvestmentImportOrigin_portfolioId_sourceNamespace_sourceKey_key" ON "InvestmentImportOrigin"("portfolioId", "sourceNamespace", "sourceKey");
CREATE INDEX "InvestmentImportOrigin_portfolioId_sourceNamespace_fingerprint_idx" ON "InvestmentImportOrigin"("portfolioId", "sourceNamespace", "fingerprint");
CREATE INDEX "InvestmentImportOrigin_portfolioId_sourceNamespace_date_type_ticker_idx" ON "InvestmentImportOrigin"("portfolioId", "sourceNamespace", "date", "type", "ticker");
