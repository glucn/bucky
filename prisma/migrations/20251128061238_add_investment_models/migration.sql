-- CreateTable
CREATE TABLE "InvestmentProperties" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "tickerSymbol" TEXT NOT NULL,
    "securityType" TEXT,
    "quantity" REAL NOT NULL DEFAULT 0,
    "costBasisMethod" TEXT NOT NULL DEFAULT 'FIFO',
    "lots" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SecurityPriceHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tickerSymbol" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentProperties_accountId_key" ON "InvestmentProperties"("accountId");

-- CreateIndex
CREATE INDEX "InvestmentProperties_tickerSymbol_idx" ON "InvestmentProperties"("tickerSymbol");

-- CreateIndex
CREATE INDEX "SecurityPriceHistory_tickerSymbol_date_idx" ON "SecurityPriceHistory"("tickerSymbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityPriceHistory_tickerSymbol_date_key" ON "SecurityPriceHistory"("tickerSymbol", "date");
