ALTER TABLE "Checkpoint" ADD COLUMN "balanceCents" TEXT;

-- Backfill only values that round-trip to their original Float at cent precision.
-- Below 2^45 a Float has sufficient resolution to distinguish adjacent cents,
-- including when computing the candidate by multiplying by 100.
UPDATE "Checkpoint"
SET "balanceCents" = CAST(CAST(ROUND("balance" * 100.0) AS INTEGER) AS TEXT)
WHERE ABS("balance") < 35184372088832
  AND CAST(ROUND("balance" * 100.0) AS INTEGER) / 100.0 = "balance";
