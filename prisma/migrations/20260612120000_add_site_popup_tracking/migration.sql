ALTER TABLE "users"
ADD COLUMN "first_purchase_popup_seen_at" TIMESTAMP(3),
ADD COLUMN "catalog_updates_last_seen_at" TIMESTAMP(3);

-- Existing users predate this feature: mark the first-purchase popup as already
-- seen so it never fires retroactively for buyers who already made their first
-- order. It will only appear for users who register after this ships.
UPDATE "users" SET "first_purchase_popup_seen_at" = now();
