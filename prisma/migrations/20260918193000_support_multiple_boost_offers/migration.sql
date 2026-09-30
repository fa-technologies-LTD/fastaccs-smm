-- One customer result (for example X Followers) can have a small number of calm customer choices
-- such as Affordable, More stable and Premium. Supplier services remain internal route inventory.
DROP INDEX IF EXISTS "boost_customer_offers_category_id_key";

UPDATE "boost_customer_offers"
SET "audience_tag" = 'general'
WHERE "audience_tag" IS NULL OR BTRIM("audience_tag") = '';

ALTER TABLE "boost_customer_offers"
ALTER COLUMN "audience_tag" SET DEFAULT 'general',
ALTER COLUMN "audience_tag" SET NOT NULL;

CREATE UNIQUE INDEX "boost_customer_offers_category_id_quality_tier_audience_tag_key"
ON "boost_customer_offers"("category_id", "quality_tier", "audience_tag");
