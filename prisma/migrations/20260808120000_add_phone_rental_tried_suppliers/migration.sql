-- Track which suppliers a rental already tried, so "try another" climbs the ladder without repeats.
ALTER TABLE "phone_rentals" ADD COLUMN "tried_suppliers" TEXT[] NOT NULL DEFAULT '{}';
