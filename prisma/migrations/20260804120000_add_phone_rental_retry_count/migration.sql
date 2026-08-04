-- Customer "try another" retry counter (bounds the button-gated failover). Additive + defaulted.
ALTER TABLE "phone_rentals" ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0;
