-- Distributed token bucket for pacing scarce upstream supplier calls (pvapins get_number ~5/min)
-- across serverless invocations. Brand-new table, no impact on existing data.
CREATE TABLE "rate_buckets" (
    "key" TEXT NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rate_buckets_pkey" PRIMARY KEY ("key")
);
