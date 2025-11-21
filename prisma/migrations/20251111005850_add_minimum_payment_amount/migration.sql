-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreditCardProperties" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "creditLimit" REAL NOT NULL,
    "interestRate" REAL NOT NULL,
    "statementClosingDay" INTEGER NOT NULL,
    "paymentDueDay" INTEGER NOT NULL,
    "minimumPaymentPercent" REAL,
    "minimumPaymentAmount" REAL,
    "effectiveDate" TEXT NOT NULL,
    "endDate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastStatementBalance" REAL,
    "lastStatementDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CreditCardProperties" ("accountId", "createdAt", "creditLimit", "effectiveDate", "endDate", "id", "interestRate", "isActive", "lastStatementBalance", "lastStatementDate", "minimumPaymentPercent", "paymentDueDay", "statementClosingDay", "updatedAt") SELECT "accountId", "createdAt", "creditLimit", "effectiveDate", "endDate", "id", "interestRate", "isActive", "lastStatementBalance", "lastStatementDate", "minimumPaymentPercent", "paymentDueDay", "statementClosingDay", "updatedAt" FROM "CreditCardProperties";
DROP TABLE "CreditCardProperties";
ALTER TABLE "new_CreditCardProperties" RENAME TO "CreditCardProperties";
CREATE INDEX "CreditCardProperties_accountId_effectiveDate_idx" ON "CreditCardProperties"("accountId", "effectiveDate");
CREATE INDEX "CreditCardProperties_accountId_isActive_idx" ON "CreditCardProperties"("accountId", "isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
