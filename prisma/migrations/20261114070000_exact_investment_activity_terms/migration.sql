ALTER TABLE "InvestmentActivity" ADD COLUMN "priceDecimal" TEXT;
ALTER TABLE "InvestmentActivity" ADD COLUMN "splitRatioDecimal" TEXT;

UPDATE "InvestmentActivity" SET "priceDecimal" = CAST("price" AS TEXT)
WHERE "price" >= 0 AND "price" <= 1.7976931348623157e308
  AND CAST(CAST("price" AS TEXT) AS REAL) = "price";

UPDATE "InvestmentActivity" SET "splitRatioDecimal" = CAST("splitRatio" AS TEXT)
WHERE "splitRatio" > 0 AND "splitRatio" <= 1.7976931348623157e308
  AND CAST(CAST("splitRatio" AS TEXT) AS REAL) = "splitRatio";
