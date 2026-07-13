-- Ties a promo code to a single user (spend-milestone rewards). Additive + nullable.
ALTER TABLE "promotion_codes"
	ADD COLUMN IF NOT EXISTS "issued_to_user_id" UUID;
