ALTER TABLE "orders"
ADD COLUMN "analytics_metadata" JSONB NOT NULL DEFAULT '{}';
