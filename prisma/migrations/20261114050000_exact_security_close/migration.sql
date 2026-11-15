ALTER TABLE "SecurityDailyPrice" ADD COLUMN "closeDecimal" TEXT;

UPDATE "SecurityDailyPrice"
SET "closeDecimal" = CAST("close" AS TEXT)
WHERE "close" >= 0
  AND "close" <= 1.7976931348623157e308
  AND CAST(CAST("close" AS TEXT) AS REAL) = "close";
