ALTER TABLE "InvestmentProperties" ADD COLUMN "quantityDecimal" TEXT;
ALTER TABLE "InvestmentActivity" ADD COLUMN "quantityBeforeDecimal" TEXT;
ALTER TABLE "InvestmentActivity" ADD COLUMN "quantityAfterDecimal" TEXT;

UPDATE "InvestmentProperties" SET "quantityDecimal" = CAST("quantity" AS TEXT)
WHERE "quantity" >= 0 AND "quantity" <= 1.7976931348623157e308
  AND CAST(CAST("quantity" AS TEXT) AS REAL) = "quantity";

UPDATE "InvestmentActivity" SET "quantityBeforeDecimal" = CAST("quantityBefore" AS TEXT)
WHERE "quantityBefore" >= 0 AND "quantityBefore" <= 1.7976931348623157e308
  AND CAST(CAST("quantityBefore" AS TEXT) AS REAL) = "quantityBefore";

UPDATE "InvestmentActivity" SET "quantityAfterDecimal" = CAST("quantityAfter" AS TEXT)
WHERE "quantityAfter" >= 0 AND "quantityAfter" <= 1.7976931348623157e308
  AND CAST(CAST("quantityAfter" AS TEXT) AS REAL) = "quantityAfter";
