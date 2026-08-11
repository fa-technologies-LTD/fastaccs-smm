-- Replacement/shadow model: track when the customer requested the code (the 120s replacement
-- wait runs from here) and one stale-pvapins "shadow" (contingent pay-on-success exposure kept
-- for reconciliation, NOT reserved 1:1). All additive/nullable → backward compatible.
ALTER TABLE "phone_rentals" ADD COLUMN "otp_requested_at" TIMESTAMP(3);
ALTER TABLE "phone_rentals" ADD COLUMN "shadow_provider_ref" TEXT;
ALTER TABLE "phone_rentals" ADD COLUMN "shadow_cost_cents" INTEGER;
ALTER TABLE "phone_rentals" ADD COLUMN "shadow_stale_at" TIMESTAMP(3);
