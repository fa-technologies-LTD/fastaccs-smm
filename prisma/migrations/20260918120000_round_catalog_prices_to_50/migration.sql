-- Keep manually managed account and Boosting catalogue prices on a clean ₦50 grid.
-- Historical order-item prices, discounts, refunds, supplier costs and automatic
-- Numbers pricing are deliberately untouched.

UPDATE "categories"
SET "metadata" = jsonb_set(
  "metadata",
  '{pricing,base_price}',
  to_jsonb(GREATEST(50::numeric, ROUND((("metadata" #>> '{pricing,base_price}')::numeric) / 50) * 50)),
  false
)
WHERE "category_type" = 'tier'
  AND jsonb_typeof("metadata" -> 'pricing') = 'object'
  AND trim("metadata" #>> '{pricing,base_price}') ~ '^[0-9]+([.][0-9]+)?$'
  AND ("metadata" #>> '{pricing,base_price}')::numeric > 0;

UPDATE "categories"
SET "metadata" = jsonb_set(
  "metadata",
  '{price}',
  to_jsonb(GREATEST(50::numeric, ROUND((("metadata" ->> 'price')::numeric) / 50) * 50)),
  false
)
WHERE "category_type" = 'tier'
  AND trim("metadata" ->> 'price') ~ '^[0-9]+([.][0-9]+)?$'
  AND ("metadata" ->> 'price')::numeric > 0;

UPDATE "categories"
SET "metadata" = jsonb_set(
  "metadata",
  '{boosting_price_per_step}',
  to_jsonb(GREATEST(50::numeric, ROUND((("metadata" ->> 'boosting_price_per_step')::numeric) / 50) * 50)),
  false
)
WHERE "category_type" = 'boosting_service'
  AND trim("metadata" ->> 'boosting_price_per_step') ~ '^[0-9]+([.][0-9]+)?$'
  AND ("metadata" ->> 'boosting_price_per_step')::numeric > 0;
