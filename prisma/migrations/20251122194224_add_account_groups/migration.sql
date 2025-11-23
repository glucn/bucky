-- AlterTable
ALTER TABLE "Account" ADD COLUMN "groupId" TEXT;

-- CreateTable
CREATE TABLE "AccountGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AccountGroup_accountType_displayOrder_idx" ON "AccountGroup"("accountType", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AccountGroup_name_accountType_key" ON "AccountGroup"("name", "accountType");

-- CreateIndex
CREATE INDEX "Account_groupId_idx" ON "Account"("groupId");
