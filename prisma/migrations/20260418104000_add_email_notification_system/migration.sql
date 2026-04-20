-- Email notification system foundation
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3);

-- Grandfather existing users so only new signups require verification.
UPDATE "users"
SET
	"email_verified" = true,
	"email_verified_at" = COALESCE("email_verified_at", NOW())
WHERE "id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "email_notifications" (
	"id" UUID NOT NULL DEFAULT gen_random_uuid(),
	"user_id" UUID,
	"email" TEXT NOT NULL,
	"notification_type" TEXT NOT NULL,
	"reference_id" TEXT,
	"subject" TEXT,
	"body" TEXT,
	"status" TEXT NOT NULL DEFAULT 'pending',
	"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"sent_at" TIMESTAMP(3),
	"failed_at" TIMESTAMP(3),
	"error_message" TEXT,
	"broadcast_id" UUID,
	CONSTRAINT "email_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "restock_subscriptions" (
	"id" UUID NOT NULL DEFAULT gen_random_uuid(),
	"user_id" UUID NOT NULL,
	"email" TEXT NOT NULL,
	"tier_id" UUID NOT NULL,
	"platform_name" TEXT NOT NULL,
	"tier_name" TEXT NOT NULL,
	"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"notified_at" TIMESTAMP(3),
	CONSTRAINT "restock_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "verification_codes" (
	"id" UUID NOT NULL DEFAULT gen_random_uuid(),
	"user_id" UUID NOT NULL,
	"code" TEXT NOT NULL,
	"expires_at" TIMESTAMP(3) NOT NULL,
	"attempts" INTEGER NOT NULL DEFAULT 0,
	"last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "restock_subscriptions_user_id_tier_id_key"
ON "restock_subscriptions"("user_id", "tier_id");

CREATE UNIQUE INDEX IF NOT EXISTS "verification_codes_user_id_key"
ON "verification_codes"("user_id");

CREATE INDEX IF NOT EXISTS "idx_notifications_type"
ON "email_notifications"("notification_type");

CREATE INDEX IF NOT EXISTS "idx_notifications_status"
ON "email_notifications"("status");

CREATE INDEX IF NOT EXISTS "idx_notifications_user"
ON "email_notifications"("user_id");

CREATE INDEX IF NOT EXISTS "email_notifications_broadcast_id_idx"
ON "email_notifications"("broadcast_id");

CREATE INDEX IF NOT EXISTS "email_notifications_reference_id_idx"
ON "email_notifications"("reference_id");

CREATE INDEX IF NOT EXISTS "email_notifications_created_at_idx"
ON "email_notifications"("created_at");

CREATE INDEX IF NOT EXISTS "restock_subscriptions_tier_id_notified_at_idx"
ON "restock_subscriptions"("tier_id", "notified_at");

CREATE INDEX IF NOT EXISTS "restock_subscriptions_email_idx"
ON "restock_subscriptions"("email");

CREATE INDEX IF NOT EXISTS "verification_codes_expires_at_idx"
ON "verification_codes"("expires_at");

CREATE INDEX IF NOT EXISTS "verification_codes_updated_at_idx"
ON "verification_codes"("updated_at");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'email_notifications_user_id_fkey'
	) THEN
		ALTER TABLE "email_notifications"
		ADD CONSTRAINT "email_notifications_user_id_fkey"
		FOREIGN KEY ("user_id")
		REFERENCES "users"("id")
		ON DELETE SET NULL
		ON UPDATE CASCADE;
	END IF;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'restock_subscriptions_user_id_fkey'
	) THEN
		ALTER TABLE "restock_subscriptions"
		ADD CONSTRAINT "restock_subscriptions_user_id_fkey"
		FOREIGN KEY ("user_id")
		REFERENCES "users"("id")
		ON DELETE CASCADE
		ON UPDATE CASCADE;
	END IF;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'verification_codes_user_id_fkey'
	) THEN
		ALTER TABLE "verification_codes"
		ADD CONSTRAINT "verification_codes_user_id_fkey"
		FOREIGN KEY ("user_id")
		REFERENCES "users"("id")
		ON DELETE CASCADE
		ON UPDATE CASCADE;
	END IF;
END $$;
