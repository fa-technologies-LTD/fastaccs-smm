-- Customer price locks and context-aware Boosting complaints. This migration is additive and
-- does not enable supplier submission or change any existing order.
ALTER TABLE "boost_customer_offers"
ADD COLUMN "price_locked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "boost_complaints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fulfillment_id" UUID NOT NULL,
    "user_id" UUID,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "customer_note" TEXT,
    "eligibility_snapshot" JSONB NOT NULL DEFAULT '{}',
    "validation_note" TEXT,
    "provider_action" TEXT,
    "supplier_case_id" TEXT,
    "validated_by_user_id" UUID,
    "validated_at" TIMESTAMP(3),
    "escalated_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "boost_complaints_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "boost_complaints_fulfillment_id_created_at_idx"
ON "boost_complaints"("fulfillment_id", "created_at");
CREATE INDEX "boost_complaints_status_created_at_idx"
ON "boost_complaints"("status", "created_at");
CREATE INDEX "boost_complaints_user_id_created_at_idx"
ON "boost_complaints"("user_id", "created_at");
CREATE UNIQUE INDEX "boost_complaints_fulfillment_id_type_key"
ON "boost_complaints"("fulfillment_id", "type");

ALTER TABLE "boost_complaints"
ADD CONSTRAINT "boost_complaints_fulfillment_id_fkey"
FOREIGN KEY ("fulfillment_id") REFERENCES "boost_fulfillments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "boost_complaints"
ADD CONSTRAINT "boost_complaints_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "boost_complaints"
ADD CONSTRAINT "boost_complaints_validated_by_user_id_fkey"
FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
