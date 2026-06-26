CREATE TABLE IF NOT EXISTS "affiliate_payout_details" (
	"id" UUID NOT NULL DEFAULT gen_random_uuid(),
	"user_id" UUID NOT NULL,
	"bank_name" TEXT NOT NULL,
	"account_number" TEXT NOT NULL,
	"account_name" TEXT NOT NULL,
	"phone" TEXT NOT NULL,
	"feedback" TEXT,
	"status" TEXT NOT NULL DEFAULT 'pending',
	"rejection_reason" TEXT,
	"reviewed_at" TIMESTAMP(3),
	"reviewed_by" UUID,
	"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "affiliate_payout_details_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "affiliate_payout_details_user_id_key"
ON "affiliate_payout_details"("user_id");

CREATE INDEX IF NOT EXISTS "affiliate_payout_details_status_idx"
ON "affiliate_payout_details"("status");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'affiliate_payout_details_user_id_fkey'
	) THEN
		ALTER TABLE "affiliate_payout_details"
		ADD CONSTRAINT "affiliate_payout_details_user_id_fkey"
		FOREIGN KEY ("user_id")
		REFERENCES "users"("id")
		ON DELETE CASCADE
		ON UPDATE CASCADE;
	END IF;
END $$;
