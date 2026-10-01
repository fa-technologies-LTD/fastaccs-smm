-- Freeze structured account add-on selections for later cost/commission accounting,
-- and give each Boosting offer an explicit customer ceiling that at least one
-- reviewed supplier route can fulfill.
ALTER TABLE "order_items"
ADD COLUMN "account_addon_snapshot" JSONB;

ALTER TABLE "boost_customer_offers"
ADD COLUMN "max_quantity" INTEGER;

UPDATE "boost_customer_offers" AS offer
SET "max_quantity" = route_limits.maximum_quantity
FROM (
    SELECT "offer_id", MAX("maximum_quantity") AS maximum_quantity
    FROM "boost_service_routes"
    WHERE "state" <> 'paused'
    GROUP BY "offer_id"
) AS route_limits
WHERE offer.id = route_limits.offer_id;

ALTER TABLE "boost_customer_offers"
ADD CONSTRAINT "boost_customer_offers_quantity_range_check"
CHECK ("max_quantity" IS NULL OR "max_quantity" >= "min_quantity");
