-- An offer marked live must have genuinely enabled supplier routes. Earlier setup drafts used
-- shadow routes even after publication; promote only routes the owner explicitly approved.
UPDATE "boost_service_routes" AS route
SET "state" = 'enabled',
    "updated_at" = NOW()
FROM "boost_customer_offers" AS offer
WHERE route."offer_id" = offer."id"
  AND offer."status" = 'live'
  AND route."equivalence_approved" = TRUE
  AND route."state" = 'shadow';
