CREATE TABLE IF NOT EXISTS "boosting_service_waitlist" (
	"id" UUID NOT NULL DEFAULT gen_random_uuid(),
	"user_id" UUID NOT NULL,
	"email" TEXT NOT NULL,
	"service_id" UUID NOT NULL,
	"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"notified_at" TIMESTAMP(3),
	CONSTRAINT "boosting_service_waitlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "boosting_service_waitlist_user_id_service_id_key"
ON "boosting_service_waitlist"("user_id", "service_id");

CREATE INDEX IF NOT EXISTS "boosting_service_waitlist_service_id_notified_at_idx"
ON "boosting_service_waitlist"("service_id", "notified_at");

CREATE INDEX IF NOT EXISTS "boosting_service_waitlist_email_idx"
ON "boosting_service_waitlist"("email");

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'boosting_service_waitlist_user_id_fkey'
	) THEN
		ALTER TABLE "boosting_service_waitlist"
		ADD CONSTRAINT "boosting_service_waitlist_user_id_fkey"
		FOREIGN KEY ("user_id")
		REFERENCES "users"("id")
		ON DELETE CASCADE
		ON UPDATE CASCADE;
	END IF;
END $$;
