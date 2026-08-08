-- First-touch acquisition attribution on users (additive, all nullable — backward-compatible).
ALTER TABLE "users" ADD COLUMN "acquisition_source" TEXT;
ALTER TABLE "users" ADD COLUMN "acquisition_medium" TEXT;
ALTER TABLE "users" ADD COLUMN "acquisition_campaign" TEXT;
ALTER TABLE "users" ADD COLUMN "acquisition_referrer" TEXT;
ALTER TABLE "users" ADD COLUMN "acquisition_landing" TEXT;
