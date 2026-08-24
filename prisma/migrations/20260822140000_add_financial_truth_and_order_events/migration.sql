-- Additive-only financial truth and audit history. Historical refund amounts are deliberately
-- backfilled by a separately reviewed repair script, not implicitly during schema deployment.
ALTER TABLE "orders"
ADD COLUMN "refunded_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "order_items"
ADD COLUMN "refunded_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "phone_rentals"
ADD COLUMN "next_rent_attempt_at" TIMESTAMP(3);

CREATE TABLE "order_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actor_user_id" UUID,
    "order_item_id" UUID,
    "account_id" UUID,
    "amount" DECIMAL(10,2),
    "description" TEXT,
    "idempotency_key" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "phone_catalog_probes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL DEFAULT 'pvapins',
    "service_id" INTEGER NOT NULL,
    "service_name" TEXT NOT NULL,
    "provider_service_ref" TEXT NOT NULL,
    "country_id" INTEGER NOT NULL,
    "country_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_probed_at" TIMESTAMP(3),
    "last_rentable_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "next_probe_at" TIMESTAMP(3),
    "last_provider_ref" TEXT,
    "release_confirmed" BOOLEAN,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phone_catalog_probes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "phone_catalog_probe_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "probe_id" UUID NOT NULL,
    "outcome" TEXT NOT NULL,
    "provider_ref" TEXT,
    "release_confirmed" BOOLEAN,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phone_catalog_probe_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "phone_catalog_probe_attempts_probe_id_fkey" FOREIGN KEY ("probe_id") REFERENCES "phone_catalog_probes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "order_events_idempotency_key_key" ON "order_events"("idempotency_key");
CREATE INDEX "order_events_order_id_occurred_at_idx" ON "order_events"("order_id", "occurred_at");
CREATE INDEX "order_events_type_occurred_at_idx" ON "order_events"("type", "occurred_at");
CREATE INDEX "order_events_actor_user_id_occurred_at_idx" ON "order_events"("actor_user_id", "occurred_at");
CREATE UNIQUE INDEX "phone_catalog_probes_provider_provider_service_ref_country_name_key" ON "phone_catalog_probes"("provider", "provider_service_ref", "country_name");
CREATE INDEX "phone_catalog_probes_status_next_probe_at_idx" ON "phone_catalog_probes"("status", "next_probe_at");
CREATE INDEX "phone_catalog_probes_last_probed_at_idx" ON "phone_catalog_probes"("last_probed_at");
CREATE INDEX "phone_catalog_probe_attempts_created_at_idx" ON "phone_catalog_probe_attempts"("created_at");
CREATE INDEX "phone_catalog_probe_attempts_probe_id_created_at_idx" ON "phone_catalog_probe_attempts"("probe_id", "created_at");
CREATE INDEX "orders_paid_at_idx" ON "orders"("paid_at");
CREATE INDEX "orders_payment_status_paid_at_idx" ON "orders"("payment_status", "paid_at");
CREATE INDEX "orders_delivery_status_updated_at_idx" ON "orders"("delivery_status", "updated_at");
CREATE INDEX "phone_rentals_status_next_rent_attempt_at_idx" ON "phone_rentals"("status", "next_rent_attempt_at");
