-- Durable per-attempt telemetry for Numbers (observational only, NOT in the money path). New table.
CREATE TABLE "phone_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL,
    "provider_service_ref" TEXT NOT NULL,
    "provider_ref" TEXT,
    "expected_cost_cents" INTEGER,
    "actual_cost_cents" INTEGER,
    "outcome" TEXT NOT NULL,
    "failure_category" TEXT,
    "phone_number" TEXT,
    "otp_requested_at" TIMESTAMP(3),
    "otp_received_at" TIMESTAMP(3),
    "otp_latency_sec" INTEGER,
    "rejection_attempted" BOOLEAN NOT NULL DEFAULT false,
    "rejection_success" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phone_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "phone_attempts_order_item_id_idx" ON "phone_attempts"("order_item_id");
CREATE INDEX "phone_attempts_provider_provider_service_ref_created_at_idx" ON "phone_attempts"("provider", "provider_service_ref", "created_at");
CREATE INDEX "phone_attempts_outcome_created_at_idx" ON "phone_attempts"("outcome", "created_at");
