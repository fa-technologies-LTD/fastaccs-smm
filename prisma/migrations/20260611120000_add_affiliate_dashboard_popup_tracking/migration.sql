ALTER TABLE "users"
ADD COLUMN "affiliate_welcome_popup_seen_at" TIMESTAMP(3),
ADD COLUMN "affiliate_progress_50_popup_seen_at" TIMESTAMP(3),
ADD COLUMN "affiliate_progress_80_popup_seen_at" TIMESTAMP(3),
ADD COLUMN "affiliate_progress_95_popup_seen_at" TIMESTAMP(3),
ADD COLUMN "affiliate_unlocked_popup_seen_at" TIMESTAMP(3);
