-- Additive only: preserves historical complaints and supplier case IDs.
ALTER TABLE "boost_complaints"
  ADD COLUMN "refill_state" TEXT,
  ADD COLUMN "refill_checked_at" TIMESTAMP(3),
  ADD COLUMN "refill_next_check_at" TIMESTAMP(3),
  ADD COLUMN "refill_poll_failures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refill_lease_token" UUID,
  ADD COLUMN "refill_lease_expires_at" TIMESTAMP(3);
CREATE INDEX "boost_complaints_status_refill_next_check_at_idx"
  ON "boost_complaints"("status", "refill_next_check_at");
