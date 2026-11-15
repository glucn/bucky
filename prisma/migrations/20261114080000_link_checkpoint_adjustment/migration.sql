ALTER TABLE "Checkpoint" ADD COLUMN "journalEntryId" TEXT;
CREATE UNIQUE INDEX "Checkpoint_journalEntryId_key" ON "Checkpoint"("journalEntryId");
