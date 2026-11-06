-- Do not infer a legacy holding's market or copy ticker-only prices into a canonical market.
ALTER TABLE "InvestmentProperties" ADD COLUMN "market" TEXT;
ALTER TABLE "SecurityDailyPrice" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'provider';
