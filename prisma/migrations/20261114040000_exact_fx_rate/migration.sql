ALTER TABLE "FxDailyRate" ADD COLUMN "rateDecimal" TEXT;

-- Keep the original Float when SQLite's decimal rendering would change its value.
UPDATE "FxDailyRate"
SET "rateDecimal" = CAST("rate" AS TEXT)
WHERE "rate" > 0
  AND "rate" <= 1.7976931348623157e308
  AND CAST(CAST("rate" AS TEXT) AS REAL) = "rate";
