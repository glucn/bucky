-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN "displayOrder" REAL;

-- CreateIndex
CREATE INDEX "JournalEntry_displayOrder_idx" ON "JournalEntry"("displayOrder");
