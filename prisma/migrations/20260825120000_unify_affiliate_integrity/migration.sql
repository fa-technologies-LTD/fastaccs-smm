-- One durable affiliate program per user. Production was verified to contain no duplicates
-- before this migration was authored.
ALTER TABLE "affiliate_programs" ALTER COLUMN "commission_rate" SET DEFAULT 5.00;

CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_programs_user_id_key"
ON "affiliate_programs"("user_id");

-- Durable first-touch attribution. The application temporarily dual-reads the legacy
-- microcopy lock during rollout; a separate dry-run-capable script performs the backfill.
CREATE TABLE "affiliate_referrals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "affiliate_program_id" UUID NOT NULL,
    "referrer_user_id" UUID NOT NULL,
    "referred_user_id" UUID NOT NULL,
    "affiliate_code" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "policy_snapshot" JSONB NOT NULL DEFAULT '{}',
    "locked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_referrals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "affiliate_referrals_affiliate_program_id_fkey"
        FOREIGN KEY ("affiliate_program_id") REFERENCES "affiliate_programs"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "affiliate_referrals_referrer_user_id_fkey"
        FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "affiliate_referrals_referred_user_id_fkey"
        FOREIGN KEY ("referred_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "affiliate_referrals_referred_user_id_key"
ON "affiliate_referrals"("referred_user_id");
CREATE INDEX "affiliate_referrals_affiliate_program_id_locked_at_idx"
ON "affiliate_referrals"("affiliate_program_id", "locked_at");
CREATE INDEX "affiliate_referrals_referrer_user_id_locked_at_idx"
ON "affiliate_referrals"("referrer_user_id", "locked_at");
CREATE INDEX "affiliate_referrals_status_locked_at_idx"
ON "affiliate_referrals"("status", "locked_at");

-- First-party affiliate funnel events. Dedupe keys make settlement/refund events safe to
-- record from more than one recovery path.
CREATE TABLE "affiliate_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "affiliate_program_id" UUID,
    "affiliate_user_id" UUID,
    "referred_user_id" UUID,
    "order_id" UUID,
    "type" TEXT NOT NULL,
    "source" TEXT,
    "dedupe_key" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "affiliate_events_dedupe_key_key" ON "affiliate_events"("dedupe_key");
CREATE INDEX "affiliate_events_type_created_at_idx" ON "affiliate_events"("type", "created_at");
CREATE INDEX "affiliate_events_affiliate_program_id_created_at_idx"
ON "affiliate_events"("affiliate_program_id", "created_at");
CREATE INDEX "affiliate_events_affiliate_user_id_created_at_idx"
ON "affiliate_events"("affiliate_user_id", "created_at");
CREATE INDEX "affiliate_events_referred_user_id_created_at_idx"
ON "affiliate_events"("referred_user_id", "created_at");
CREATE INDEX "affiliate_events_order_id_idx" ON "affiliate_events"("order_id");

-- The application also serializes payout requests on the affiliate wallet. This
-- partial unique index is the final database backstop against retries, parallel
-- devices, or future callers creating two simultaneously reserved withdrawals.
CREATE UNIQUE INDEX "wallet_transactions_one_open_affiliate_payout_per_user"
ON "wallet_transactions"("user_id")
WHERE "type" = 'affiliate_payout' AND "status" IN ('requested', 'under_review');

-- Encrypted payout-details envelope. Legacy plaintext columns become nullable only so a
-- controlled backfill can replace their contents without downtime.
ALTER TABLE "affiliate_payout_details"
    ALTER COLUMN "bank_name" DROP NOT NULL,
    ALTER COLUMN "account_number" DROP NOT NULL,
    ALTER COLUMN "account_name" DROP NOT NULL,
    ALTER COLUMN "phone" DROP NOT NULL,
    ADD COLUMN "encrypted_payload" TEXT,
    ADD COLUMN "encryption_key_id" TEXT,
    ADD COLUMN "account_number_last_4" TEXT;
