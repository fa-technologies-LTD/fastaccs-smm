-- Two-source Numbers: record which supplier served each rental.
-- Additive + defaulted, so existing rows and the currently-deployed code are unaffected.
ALTER TABLE "phone_rentals" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'hubman';
ALTER TABLE "phone_rentals" ADD COLUMN "provider_ref" TEXT;
