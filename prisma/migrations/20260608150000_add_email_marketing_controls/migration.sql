ALTER TABLE "users"
ADD COLUMN "marketing_email_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "marketing_unsubscribed_at" TIMESTAMP(3),
ADD COLUMN "marketing_suppressed_at" TIMESTAMP(3),
ADD COLUMN "marketing_suppress_reason" TEXT,
ADD COLUMN "marketing_preference_token" UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE "email_notifications"
ADD COLUMN "classification" TEXT NOT NULL DEFAULT 'transactional',
ADD COLUMN "campaign_key" TEXT,
ADD COLUMN "suppression_reason" TEXT;

CREATE UNIQUE INDEX "users_marketing_preference_token_key"
ON "users"("marketing_preference_token");

CREATE INDEX "email_notifications_classification_status_sent_at_idx"
ON "email_notifications"("classification", "status", "sent_at");

CREATE INDEX "email_notifications_campaign_key_idx"
ON "email_notifications"("campaign_key");
