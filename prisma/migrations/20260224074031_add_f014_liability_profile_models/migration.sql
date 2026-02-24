-- CreateTable
CREATE TABLE "LiabilityProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LiabilityRevolvingTerms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "limitOrCeiling" REAL,
    "statementClosingDay" INTEGER,
    "paymentDueDay" INTEGER,
    "minimumPaymentType" TEXT,
    "minimumPaymentPercent" REAL,
    "minimumPaymentAmount" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LiabilityInstallmentTerms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "scheduledPaymentAmount" REAL,
    "paymentFrequency" TEXT,
    "dueScheduleType" TEXT,
    "dueDayOfMonth" INTEGER,
    "dueWeekday" INTEGER,
    "anchorDate" TEXT,
    "paymentDueDay" INTEGER,
    "repaymentMethod" TEXT,
    "originalPrincipal" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LiabilityCounterparty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "counterpartyName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LiabilityProfileVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "effectiveDate" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "changeNote" TEXT,
    "counterpartyName" TEXT,
    "limitOrCeiling" REAL,
    "statementClosingDay" INTEGER,
    "paymentDueDay" INTEGER,
    "minimumPaymentType" TEXT,
    "minimumPaymentPercent" REAL,
    "minimumPaymentAmount" REAL,
    "interestRate" REAL,
    "scheduledPaymentAmount" REAL,
    "paymentFrequency" TEXT,
    "dueScheduleType" TEXT,
    "dueDayOfMonth" INTEGER,
    "dueWeekday" INTEGER,
    "anchorDate" TEXT,
    "repaymentMethod" TEXT,
    "originalPrincipal" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "LiabilityProfile_accountId_key" ON "LiabilityProfile"("accountId");

-- CreateIndex
CREATE INDEX "LiabilityProfile_template_idx" ON "LiabilityProfile"("template");

-- CreateIndex
CREATE UNIQUE INDEX "LiabilityRevolvingTerms_profileId_key" ON "LiabilityRevolvingTerms"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "LiabilityInstallmentTerms_profileId_key" ON "LiabilityInstallmentTerms"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "LiabilityCounterparty_profileId_key" ON "LiabilityCounterparty"("profileId");

-- CreateIndex
CREATE INDEX "LiabilityProfileVersion_profileId_effectiveDate_idx" ON "LiabilityProfileVersion"("profileId", "effectiveDate");

-- CreateIndex
CREATE UNIQUE INDEX "LiabilityProfileVersion_profileId_effectiveDate_key" ON "LiabilityProfileVersion"("profileId", "effectiveDate");
