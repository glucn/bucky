ALTER TABLE "JournalLine" ADD COLUMN "exchangeRateDecimal" TEXT;

UPDATE "JournalLine" SET "exchangeRateDecimal" = CAST("exchangeRate" AS TEXT)
WHERE "exchangeRate" > 0 AND "exchangeRate" <= 1.7976931348623157e308
  AND CAST(CAST("exchangeRate" AS TEXT) AS REAL) = "exchangeRate";
