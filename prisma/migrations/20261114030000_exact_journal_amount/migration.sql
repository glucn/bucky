ALTER TABLE "JournalLine" ADD COLUMN "amountCents" TEXT;

-- Preserve the original amount when its intended cents cannot be recovered reliably.
UPDATE "JournalLine"
SET "amountCents" = CAST(CAST(ROUND("amount" * 100.0) AS INTEGER) AS TEXT)
WHERE ABS("amount") < 35184372088832
  AND CAST(ROUND("amount" * 100.0) AS INTEGER) / 100.0 = "amount";
