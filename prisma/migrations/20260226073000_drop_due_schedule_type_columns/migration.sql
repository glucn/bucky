PRAGMA foreign_keys=OFF;

CREATE TABLE "new_LiabilityInstallmentTerms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "scheduledPaymentAmount" REAL,
    "paymentFrequency" TEXT,
    "dueDayOfMonth" INTEGER,
    "dueWeekday" INTEGER,
    "anchorDate" TEXT,
    "paymentDueDay" INTEGER,
    "repaymentMethod" TEXT,
    "originalPrincipal" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LiabilityInstallmentTerms_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LiabilityProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_LiabilityInstallmentTerms" (
    "id",
    "profileId",
    "scheduledPaymentAmount",
    "paymentFrequency",
    "dueDayOfMonth",
    "dueWeekday",
    "anchorDate",
    "paymentDueDay",
    "repaymentMethod",
    "originalPrincipal",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "profileId",
    "scheduledPaymentAmount",
    "paymentFrequency",
    "dueDayOfMonth",
    "dueWeekday",
    "anchorDate",
    "paymentDueDay",
    "repaymentMethod",
    "originalPrincipal",
    "createdAt",
    "updatedAt"
FROM "LiabilityInstallmentTerms";

DROP TABLE "LiabilityInstallmentTerms";
ALTER TABLE "new_LiabilityInstallmentTerms" RENAME TO "LiabilityInstallmentTerms";
CREATE UNIQUE INDEX "LiabilityInstallmentTerms_profileId_key" ON "LiabilityInstallmentTerms"("profileId");

CREATE TABLE "new_LiabilityProfileVersion" (
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
    "dueDayOfMonth" INTEGER,
    "dueWeekday" INTEGER,
    "anchorDate" TEXT,
    "repaymentMethod" TEXT,
    "originalPrincipal" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LiabilityProfileVersion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "LiabilityProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_LiabilityProfileVersion" (
    "id",
    "profileId",
    "effectiveDate",
    "template",
    "changeNote",
    "counterpartyName",
    "limitOrCeiling",
    "statementClosingDay",
    "paymentDueDay",
    "minimumPaymentType",
    "minimumPaymentPercent",
    "minimumPaymentAmount",
    "interestRate",
    "scheduledPaymentAmount",
    "paymentFrequency",
    "dueDayOfMonth",
    "dueWeekday",
    "anchorDate",
    "repaymentMethod",
    "originalPrincipal",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "profileId",
    "effectiveDate",
    "template",
    "changeNote",
    "counterpartyName",
    "limitOrCeiling",
    "statementClosingDay",
    "paymentDueDay",
    "minimumPaymentType",
    "minimumPaymentPercent",
    "minimumPaymentAmount",
    "interestRate",
    "scheduledPaymentAmount",
    "paymentFrequency",
    "dueDayOfMonth",
    "dueWeekday",
    "anchorDate",
    "repaymentMethod",
    "originalPrincipal",
    "createdAt",
    "updatedAt"
FROM "LiabilityProfileVersion";

DROP TABLE "LiabilityProfileVersion";
ALTER TABLE "new_LiabilityProfileVersion" RENAME TO "LiabilityProfileVersion";
CREATE INDEX "LiabilityProfileVersion_profileId_effectiveDate_idx" ON "LiabilityProfileVersion"("profileId", "effectiveDate");
CREATE UNIQUE INDEX "LiabilityProfileVersion_profileId_effectiveDate_key" ON "LiabilityProfileVersion"("profileId", "effectiveDate");

PRAGMA foreign_keys=ON;
