ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "order_type" TEXT NOT NULL DEFAULT 'account';

CREATE INDEX IF NOT EXISTS "orders_order_type_created_at_idx"
ON "orders"("order_type", "created_at");

-- Backfill: an order is "boosting" if any of its items carries a boost target link.
-- Checkout enforces orders never mix boosting and account items, so this is unambiguous.
UPDATE "orders"
SET "order_type" = 'boosting'
WHERE EXISTS (
	SELECT 1
	FROM "order_items"
	WHERE "order_items"."order_id" = "orders"."id"
	AND "order_items"."boost_target_url" IS NOT NULL
);
