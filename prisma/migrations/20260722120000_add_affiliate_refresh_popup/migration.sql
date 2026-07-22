-- Additive: one-time "affiliate program refreshed" announcement popup seen-flag.
ALTER TABLE "users" ADD COLUMN "affiliate_refresh_popup_seen_at" TIMESTAMP(3);
