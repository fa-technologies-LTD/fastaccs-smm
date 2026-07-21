-- Additive: durable, queryable reason an order was cancelled/failed, so we can tell
-- retry-supersede from init-failure from expiry. Backward-compatible (nullable).
ALTER TABLE "orders" ADD COLUMN "cancellation_reason" TEXT;
