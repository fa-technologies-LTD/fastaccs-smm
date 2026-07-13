-- Super affiliate flag: flat per-activation reward replaces the per-order reward.
-- Additive + backward-compatible; all existing affiliates default to false.
ALTER TABLE "affiliate_programs"
	ADD COLUMN IF NOT EXISTS "is_super_affiliate" BOOLEAN NOT NULL DEFAULT false;
