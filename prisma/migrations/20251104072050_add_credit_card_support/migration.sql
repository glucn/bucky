-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN "postingDate" TEXT;

-- CreateTable
CREATE TABLE "CreditCardProperties" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "creditLimit" REAL NOT NULL,
    "interestRate" REAL NOT NULL,
    "statementClosingDay" INTEGER NOT NULL,
    "paymentDueDay" INTEGER NOT NULL,
    "minimumPaymentPercent" REAL NOT NULL,
    "effectiveDate" TEXT NOT NULL,
    "endDate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastStatementBalance" REAL,
    "lastStatementDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "CreditCardProperties_accountId_effectiveDate_idx" ON "CreditCardProperties"("accountId", "effectiveDate");

-- CreateIndex
CREATE INDEX "CreditCardProperties_accountId_isActive_idx" ON "CreditCardProperties"("accountId", "isActive");
