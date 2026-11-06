-- Retain previous prices unchanged; do not infer their adjustment basis or completion.
ALTER TABLE "SecurityDailyPrice" ADD COLUMN "priceBasis" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "SecurityDailyPrice" ADD COLUMN "barStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "SecurityDailyPrice" ADD COLUMN "basisAsOf" TEXT;
