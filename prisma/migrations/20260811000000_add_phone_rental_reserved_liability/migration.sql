-- Reserve unresolved supplier liability from earlier attempts (USD cents) out of the procurement
-- budget, so a "try another" replacement can never push total supplier spend past the hard profit
-- floor. Additive + default 0 → backward compatible (existing rows read as no reservation).
ALTER TABLE "phone_rentals" ADD COLUMN "reserved_liability_cents" INTEGER NOT NULL DEFAULT 0;
