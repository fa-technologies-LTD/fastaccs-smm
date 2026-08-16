-- Per-order-item ownership fences for Numbers fulfillment. All columns are additive so the
-- currently deployed code keeps working while the migration is applied ahead of the release.
ALTER TABLE "phone_rentals" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "phone_rentals" ADD COLUMN "rent_lease_token" TEXT;
ALTER TABLE "phone_rentals" ADD COLUMN "rent_lease_expires_at" TIMESTAMP(3);
ALTER TABLE "phone_rentals" ADD COLUMN "renting_at" TIMESTAMP(3);
ALTER TABLE "phone_rentals" ADD COLUMN "rent_candidate_provider" TEXT;
ALTER TABLE "phone_rentals" ADD COLUMN "rent_candidate_service_ref" TEXT;
ALTER TABLE "phone_rentals" ADD COLUMN "rent_call_started_at" TIMESTAMP(3);
ALTER TABLE "phone_rentals" ADD COLUMN "operation_token" TEXT;
ALTER TABLE "phone_rentals" ADD COLUMN "operation_lease_expires_at" TIMESTAMP(3);
ALTER TABLE "phone_attempts" ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 0;

-- Give any legacy in-flight rent a conservative grace lease. The new worker will never mistake
-- a just-deployed, still-running call for an abandoned one merely because its original row is old.
UPDATE "phone_rentals"
SET "renting_at" = COALESCE("rented_at", "updated_at", CURRENT_TIMESTAMP),
    "rent_lease_token" = 'legacy:' || "id"::text,
    "rent_lease_expires_at" = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
WHERE "status" = 'renting' AND "rent_lease_token" IS NULL;

CREATE INDEX "phone_rentals_status_rent_lease_expires_at_idx"
ON "phone_rentals"("status", "rent_lease_expires_at");
CREATE INDEX "phone_rentals_status_operation_lease_expires_at_idx"
ON "phone_rentals"("status", "operation_lease_expires_at");
CREATE INDEX "phone_attempts_order_item_id_generation_idx"
ON "phone_attempts"("order_item_id", "generation");

-- Deliberately keep phone_attempts_order_item_id_idx during the compatibility window. The
-- first rollout is expand-only: currently deployed code must remain safe while the database is
-- migrated ahead of the application. The redundant legacy index can be removed in a later,
-- separately reviewed cleanup migration after the new release is proven.
