ALTER TABLE "AccountGroup" ADD COLUMN "isInvestmentPortfolio" BOOLEAN NOT NULL DEFAULT false;

-- Structured holding properties establish investment intent. Cash-only legacy groups
-- require explicit review; editable account or group names are not identity evidence.
UPDATE "AccountGroup" SET "isInvestmentPortfolio" = true
WHERE "accountType" = 'user' AND "id" IN (
  SELECT a."groupId" FROM "Account" a
  JOIN "InvestmentProperties" p ON p."accountId" = a."id"
  WHERE a."type" = 'user' AND a."subtype" = 'asset'
);
