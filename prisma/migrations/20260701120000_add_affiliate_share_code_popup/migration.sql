-- Add per-user "share your code" affiliate popup seen timestamp (nullable, additive).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "affiliate_share_code_popup_seen_at" TIMESTAMP(3);
