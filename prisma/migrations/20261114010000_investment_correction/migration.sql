CREATE TABLE "InvestmentCorrection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "InvestmentCorrection_accountId_createdAt_idx" ON "InvestmentCorrection"("accountId", "createdAt");
